import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient, DemoSession } from "../../generated/prisma/client";
import type { UserDatabase } from "./context";
import type { DemoIdentity } from "../../features/demo/cookie";
import {
  demoState,
  demoMutation,
  seededDemo,
  type DemoSnapshot,
} from "../../features/demo/state";
import { demoMarker } from "../../features/demo/catalog";
import { AccessError } from "../auth/errors";
export function demoSnapshot(row: DemoSession): DemoSnapshot {
  return {
    view: row.view as DemoSnapshot["view"],
    state: demoState.parse(row.state),
    expiresAt: row.expiresAt.toISOString(),
    generation: row.generation,
    commentCount: row.commentCount,
    actionCount: row.actionCount,
  };
}
export async function withDemoDatabase<T>(
  db: PrismaClient,
  identity: DemoIdentity,
  op: (tx: UserDatabase) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE review_room_demo");
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      await tx.$queryRaw`SELECT set_config('demo.session_id',${identity.id},true),set_config('demo.token_hash',${identity.tokenHash},true)`;
      return op(tx);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
export async function createDemo(tx: UserDatabase, identity: DemoIdentity) {
  const time = await tx.$queryRaw<
    { expiresAt: Date }[]
  >`SELECT date_trunc('milliseconds',now())+interval '24 hours' AS "expiresAt"`;
  return demoSnapshot(
    await tx.demoSession.create({
      data: {
        id: identity.id,
        tokenHash: identity.tokenHash,
        marker: demoMarker,
        expiresAt: time[0].expiresAt,
        state: seededDemo(),
      },
    }),
  );
}
export async function readDemo(tx: UserDatabase, identity: DemoIdentity) {
  const row = await tx.demoSession.findUnique({ where: { id: identity.id } });
  if (!row)
    throw new AccessError(
      "This demo session expired. Start a fresh demo to continue.",
      410,
    );
  return demoSnapshot(row);
}
export async function mutateDemo(
  tx: UserDatabase,
  identity: DemoIdentity,
  input: unknown,
) {
  const action = demoMutation.parse(input);
  await tx.$queryRaw`SELECT id FROM app."DemoSession" WHERE id=${identity.id}::uuid FOR UPDATE`;
  const row = await tx.demoSession.findUnique({ where: { id: identity.id } });
  if (!row)
    throw new AccessError(
      "This demo session expired. Start a fresh demo to continue.",
      410,
    );
  const fingerprint = createHash("sha256")
      .update(JSON.stringify(action))
      .digest("hex"),
    receipts = row.receipts as Record<string, string>;
  if (receipts[action.requestId]) {
    if (receipts[action.requestId] !== fingerprint)
      throw new AccessError(
        "This request was already used. Refresh the demo and try again.",
        409,
      );
    return demoSnapshot(row);
  }
  if (action.generation !== row.generation)
    throw new AccessError(
      "The demo was reset in another tab. Refresh before making changes.",
      409,
    );
  if (row.actionCount >= 100)
    throw new AccessError(
      "This demo session reached its 100-action limit. You can still explore the designs.",
      429,
    );
  const state = demoState.parse(row.state);
  let view = row.view,
    generation = row.generation,
    commentCount = row.commentCount;
  if (action.operation === "reset") {
    generation++;
    Object.assign(state, seededDemo());
  } else if (action.operation === "view") view = action.view;
  else {
    if (action.version !== 2)
      throw new AccessError(
        "Historical versions are read only. Switch to version 2.",
        409,
      );
    if (action.operation === "comment") {
      if (commentCount >= 20)
        throw new AccessError(
          "This demo session reached its 20-comment limit. Reset does not reset this quota.",
          429,
        );
      const parent = action.parentId
        ? state.comments.find(
            (c) =>
              c.id === action.parentId &&
              c.assetId === action.assetId &&
              c.version === action.version &&
              !c.parentId,
          )
        : null;
      if (action.parentId && !parent)
        throw new AccessError(
          "Reply to a root thread on this demo version.",
          400,
        );
      if (
        parent
          ? action.xRatio !== null || action.yRatio !== null
          : action.xRatio === null || action.yRatio === null
      )
        throw new AccessError(
          "Choose an image position for a root comment; replies use the thread position.",
          400,
        );
      const number = parent
        ? null
        : Math.max(
            0,
            ...state.comments
              .filter(
                (c) =>
                  c.assetId === action.assetId &&
                  c.version === action.version &&
                  !c.parentId,
              )
              .map((c) => c.threadNumber!),
          ) + 1;
      state.comments.push({
        id: randomUUID(),
        assetId: action.assetId,
        version: action.version,
        parentId: action.parentId,
        threadNumber: number,
        xRatio: action.xRatio,
        yRatio: action.yRatio,
        body: action.body,
        author: row.view as DemoSnapshot["view"],
        resolved: false,
        createdAt: new Date().toISOString(),
      });
      commentCount++;
    } else if (action.operation === "resolve") {
      if (row.view !== "DESIGNER")
        throw new AccessError(
          "Switch to Designer view to resolve or reopen threads.",
        );
      const root = state.comments.find(
        (c) =>
          c.id === action.id &&
          c.assetId === action.assetId &&
          c.version === action.version &&
          !c.parentId,
      );
      if (!root) throw new AccessError("Demo thread not found.", 404);
      root.resolved = action.resolved;
    } else if (action.operation === "decision") {
      if (row.view !== "CLIENT")
        throw new AccessError(
          "Only Client view can make a demo review decision.",
        );
      if (action.decision === "CHANGES_REQUESTED" && !action.note)
        throw new AccessError(
          "Add a note explaining the requested changes.",
          400,
        );
      state.decisions.push({
        assetId: action.assetId,
        version: action.version,
        decision: action.decision,
        note: action.note,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return demoSnapshot(
    await tx.demoSession.update({
      where: { id: row.id },
      data: {
        state,
        view,
        generation,
        commentCount,
        actionCount: row.actionCount + 1,
        receipts: { ...receipts, [action.requestId]: fingerprint },
      },
    }),
  );
}
