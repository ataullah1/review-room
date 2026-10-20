import { createHash } from "node:crypto";
import type {
  PrismaClient,
  WorkspaceRole,
} from "../../generated/prisma/client";
import { validateImage } from "../uploads/image";

export const reviewerDemoMarker = "review-room-reviewer-demo-v1";
export function demoId(label: string): string {
  const bytes = createHash("sha256")
    .update(`${reviewerDemoMarker}:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const demoWorkspaceId = demoId("workspace");
export const demoProjects = [
  {
    id: demoId("olive-project"),
    name: "Olive Café — Brand Identity",
    assigned: true,
  },
  {
    id: demoId("forma-project"),
    name: "Forma — Packaging Study",
    assigned: true,
  },
  {
    id: demoId("studio-project"),
    name: "Studio Notes — Editorial Direction",
    assigned: false,
  },
];
export const demoDesigns = [
  {
    key: "olive-identity",
    title: "Olive Café / identity",
    projectId: demoProjects[0].id,
    files: [
      "public/reviewer-demo/olive-identity-v1.webp",
      "public/reviewer-demo/olive-identity-v2.webp",
    ],
  },
  {
    key: "olive-menu",
    title: "Olive Café / seasonal menu",
    projectId: demoProjects[0].id,
    files: [
      "public/reviewer-demo/olive-menu-v1.webp",
      "public/reviewer-demo/olive-menu-v2.webp",
    ],
  },
  {
    key: "forma-packaging",
    title: "Forma / almond granola",
    projectId: demoProjects[1].id,
    files: ["public/demo/packaging-v1.webp", "public/demo/packaging-v2.webp"],
  },
  {
    key: "studio-journal",
    title: "Studio Notes / editorial cover",
    projectId: demoProjects[2].id,
    files: ["public/demo/journal-v1.webp", "public/demo/journal-v2.webp"],
  },
] as const;
export type DemoIdentity = {
  id: string;
  role: WorkspaceRole;
  email: string;
  legacyWorkspaceId?: string;
};
export type DemoSeedFile = {
  key: string;
  bytes: Buffer;
  mimeType: string;
  metadata: Awaited<ReturnType<typeof validateImage>>;
  versionId: string;
  assetId: string;
  projectId: string;
  originalName: string;
};
export async function demoSeedFiles(
  read: (path: string) => Promise<Buffer>,
): Promise<DemoSeedFile[]> {
  const files: DemoSeedFile[] = [];
  for (const design of demoDesigns)
    for (const [index, path] of design.files.entries()) {
      const bytes = await read(path),
        originalName = path.split("/").at(-1)!;
      const metadata = await validateImage(bytes, {
        name: originalName,
        mimeType: "image/webp",
        size: bytes.length,
      });
      const versionId = demoId(`${design.key}:v${index + 1}`),
        assetId = demoId(design.key);
      files.push({
        key: `${demoWorkspaceId}/${design.projectId}/${assetId}/${versionId}/original.webp`,
        bytes,
        mimeType: "image/webp",
        metadata,
        versionId,
        assetId,
        projectId: design.projectId,
        originalName,
      });
    }
  return files;
}

export async function verifyDemoOwnership(
  db: PrismaClient,
  identities: DemoIdentity[],
) {
  if (
    identities.length !== 3 ||
    new Set(identities.map((u) => u.id)).size !== 3 ||
    new Set(identities.map((u) => u.role)).size !== 3
  )
    throw new Error(
      "Three distinct verified Auth identities with existing roles are required.",
    );
  const workspace = await db.workspace.findUnique({
    where: { id: demoWorkspaceId },
  });
  if (
    workspace &&
    (workspace.name !== "Olive Café — Demo Studio" ||
      workspace.createdById !==
        (identities.find((u) => u.role === "OWNER")!.legacyWorkspaceId
          ? null
          : identities.find((u) => u.role === "OWNER")!.id))
  )
    throw new Error("Demo workspace ID collision. No data was changed.");
  const registry = await db.reviewerDemoAccount.findMany({
    where: {
      OR: [
        { workspaceId: demoWorkspaceId },
        { userId: { in: identities.map((u) => u.id) } },
      ],
    },
  });
  if (
    registry.some(
      (r) =>
        r.workspaceId !== demoWorkspaceId ||
        !identities.some(
          (u) =>
            u.id === r.userId &&
            u.legacyWorkspaceId === (r.legacyWorkspaceId || undefined),
        ),
    )
  )
    throw new Error("Demo registry ownership conflict. No data was changed.");
  const memberships = await db.membership.findMany({
    where: {
      OR: [
        { workspaceId: demoWorkspaceId },
        { userId: { in: identities.map((u) => u.id) } },
      ],
    },
  });
  if (
    memberships.some(
      (m) =>
        !(
          m.workspaceId === demoWorkspaceId &&
          identities.some((u) => u.id === m.userId && u.role === m.role)
        ) &&
        !identities.some(
          (u) =>
            u.id === m.userId &&
            u.legacyWorkspaceId === m.workspaceId &&
            m.role === "OWNER",
        ),
    )
  )
    throw new Error(
      "Demo identities have unexpected memberships. No data was changed.",
    );
  if (
    workspace &&
    (registry.length !== 3 ||
      memberships.filter((m) => m.workspaceId === demoWorkspaceId).length !==
        3 ||
      registry.some((r) => r.allowAuthChanges))
  )
    throw new Error(
      "Demo registry/memberships are incomplete or credential rotation is still enabled.",
    );
  for (const identity of identities) {
    const profile = await db.userProfile.findUnique({
      where: { id: identity.id },
    });
    if (identity.legacyWorkspaceId) {
      const legacy = await db.workspace.findUnique({
        where: { id: identity.legacyWorkspaceId },
        include: { memberships: true, _count: { select: { projects: true } } },
      });
      if (
        !legacy ||
        legacy.createdById !== identity.id ||
        legacy._count.projects !== 0 ||
        legacy.memberships.length !== 1 ||
        legacy.memberships[0].userId !== identity.id ||
        legacy.memberships[0].role !== "OWNER"
      )
        throw new Error(
          "An existing personal workspace is not empty and exclusively owned by its demo account. Refusing adoption.",
        );
    }
    if (
      profile &&
      !registry.some((r) => r.userId === identity.id) &&
      !identity.legacyWorkspaceId
    )
      throw new Error(
        "Existing profile is not registered to this demo. Refusing to adopt it.",
      );
  }
}

export async function installDemoSeed(
  db: PrismaClient,
  identities: DemoIdentity[],
  files: DemoSeedFile[],
) {
  await verifyDemoOwnership(db, identities);
  const byRole = (role: WorkspaceRole) =>
    identities.find((u) => u.role === role)!;
  const owner = byRole("OWNER"),
    designer = byRole("DESIGNER"),
    client = byRole("CLIENT");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reviewerDemoMarker},0))::text`;
      // Validate existing rows under the operator lock before adding any records.
      const existing = await tx.workspace.findUnique({
        where: { id: demoWorkspaceId },
      });
      if (
        existing &&
        (existing.name !== "Olive Café — Demo Studio" ||
          existing.createdById !== (owner.legacyWorkspaceId ? null : owner.id))
      )
        throw new Error("Demo workspace collision. Refusing overwrite.");
      const presentProjects = await tx.project.findMany({
        where: { workspaceId: demoWorkspaceId },
        include: { members: true },
      });
      if (
        presentProjects.some((project) => {
          const expected = demoProjects.find((p) => p.id === project.id);
          return (
            !expected ||
            expected.name !== project.name ||
            !!project.archivedAt ||
            project.members.some(
              (m) =>
                !expected.assigned ||
                ![designer.id, client.id].includes(m.userId),
            )
          );
        })
      )
        throw new Error(
          "Demo project structure differs from the baseline. Refusing to overwrite it.",
        );
      const versions = await tx.assetVersion.findMany({
        where: { id: { in: files.map((f) => f.versionId) } },
      });
      if (
        versions.some(
          (v) =>
            !files.some(
              (f) =>
                f.versionId === v.id &&
                f.projectId === v.projectId &&
                f.assetId === v.assetId &&
                f.key === v.objectKey &&
                f.metadata.contentHash === v.contentHash,
            ) ||
            v.workspaceId !== demoWorkspaceId ||
            v.status !== "READY",
        )
      )
        throw new Error(
          "An existing demo version differs from the source artwork. Refusing overwrite.",
        );
      const created =
        !existing ||
        presentProjects.length !== demoProjects.length ||
        versions.length !== files.length ||
        presentProjects.some(
          (p) =>
            demoProjects.find((e) => e.id === p.id)?.assigned &&
            p.members.length !== 2,
        );
      if (!existing) {
        for (const identity of identities)
          await tx.userProfile.upsert({
            where: { id: identity.id },
            update: {
              displayName: `${identity.role === "OWNER" ? "Creator" : identity.role === "DESIGNER" ? "Designer" : "Client"} Demo`,
            },
            create: {
              id: identity.id,
              displayName: `${identity.role === "OWNER" ? "Creator" : identity.role === "DESIGNER" ? "Designer" : "Client"} Demo`,
            },
          });
        await tx.workspace.create({
          data: {
            id: demoWorkspaceId,
            name: "Olive Café — Demo Studio",
            createdById: owner.legacyWorkspaceId ? null : owner.id,
          },
        });
        for (const identity of identities) {
          await tx.membership.create({
            data: {
              workspaceId: demoWorkspaceId,
              userId: identity.id,
              role: identity.role,
            },
          });
          await tx.reviewerDemoAccount.create({
            data: {
              userId: identity.id,
              workspaceId: demoWorkspaceId,
              legacyWorkspaceId: identity.legacyWorkspaceId,
            },
          });
        }
      }
      for (const project of demoProjects) {
        await tx.project.upsert({
          where: { id: project.id },
          update: {},
          create: {
            id: project.id,
            workspaceId: demoWorkspaceId,
            name: project.name,
          },
        });
        if (project.assigned)
          for (const user of [designer, client])
            await tx.projectMember.upsert({
              where: {
                projectId_userId: { projectId: project.id, userId: user.id },
              },
              update: {},
              create: {
                projectId: project.id,
                workspaceId: demoWorkspaceId,
                userId: user.id,
              },
            });
      }
      for (const design of demoDesigns) {
        const assetId = demoId(design.key);
        const previousAsset = await tx.asset.findUnique({
          where: { id: assetId },
        });
        if (
          previousAsset &&
          (previousAsset.workspaceId !== demoWorkspaceId ||
            previousAsset.projectId !== design.projectId ||
            previousAsset.title !== design.title)
        )
          throw new Error("Demo asset collision. Refusing overwrite.");
        await tx.asset.upsert({
          where: { id: assetId },
          update: {},
          create: {
            id: assetId,
            projectId: design.projectId,
            workspaceId: demoWorkspaceId,
            title: design.title,
          },
        });
        for (const [index] of design.files.entries()) {
          const number = index + 1,
            file = files.find(
              (f) => f.versionId === demoId(`${design.key}:v${number}`),
            )!;
          if (!file) throw new Error("Validated seed image is missing.");
          if (versions.some((v) => v.id === file.versionId)) continue;
          await tx.assetVersion.create({
            data: {
              id: file.versionId,
              assetId,
              projectId: design.projectId,
              workspaceId: demoWorkspaceId,
              creatorId: designer.id,
              originalName: file.originalName,
              expectedMimeType: file.mimeType,
              expectedSize: file.bytes.length,
              stagingKey: `_reviewer-demo/${file.versionId}/unused`,
              objectKey: file.key,
              expiresAt: new Date("2099-01-01"),
              cleanupAfter: new Date("2099-01-01"),
            },
          });
          await tx.assetVersion.update({
            where: { id: file.versionId },
            data: { status: "READY", ...file.metadata },
          });
          await tx.asset.update({
            where: { id: assetId },
            data: { currentVersionId: file.versionId },
          });
          if (design.projectId === demoProjects[0].id) {
            const identity = design.key === "olive-identity";
            const rootId = demoId(`${design.key}:v${number}:thread`);
            await tx.comment.create({
              data: {
                id: rootId,
                versionId: file.versionId,
                authorId: client.id,
                threadNumber: 1,
                xRatio: identity ? 0.5 : 0.28,
                yRatio: identity ? 0.25 : number === 1 ? 0.63 : 0.73,
                body:
                  number === 1
                    ? identity
                      ? "Could we make the leaf icon slightly smaller and give the café name more space?"
                      : "Please increase the contrast of the menu descriptions and make prices easier to scan."
                    : identity
                      ? "This version looks much better. The smaller leaf feels balanced."
                      : "The prices are clearer now. Could we give the drinks section a little more spacing?",
              },
            });
            await tx.comment.create({
              data: {
                id: demoId(`${design.key}:v${number}:reply`),
                versionId: file.versionId,
                authorId: designer.id,
                parentId: rootId,
                body:
                  number === 1
                    ? identity
                      ? "I’ve adjusted the icon and included the change in Version 2."
                      : "Updated the menu contrast and price alignment in Version 2."
                    : identity
                      ? "Thank you! The identity is ready for the final handoff."
                      : "I can open up the spacing in the next revision. Please pin any other details here.",
              },
            });
            if (number === 1 || identity)
              await tx.comment.update({
                where: { id: rootId },
                data: { resolvedAt: new Date() },
              });
            await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub',${client.id},true)`;
            await tx.reviewDecision.create({
              data: {
                id: demoId(`${design.key}:v${number}:decision`),
                versionId: file.versionId,
                reviewerId: client.id,
                decision:
                  number === 2 && identity ? "APPROVED" : "CHANGES_REQUESTED",
                note:
                  number === 2 && identity
                    ? "Approved for the Olive Café launch."
                    : number === 1
                      ? "Please address the pinned feedback before the next review."
                      : "Please open up the drinks section spacing.",
              },
            });
            await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub','',true)`;
          }
        }
      }
      return { created, workspaceId: demoWorkspaceId };
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}

// Explicit operator-only restore. It never searches by email/name or removes
// anything outside the exact, verified demo workspace and three registry IDs.
export async function restoreDemoSeed(
  db: PrismaClient,
  identities: DemoIdentity[],
) {
  await verifyDemoOwnership(db, identities);
  const registry = await db.reviewerDemoAccount.findMany({
    where: { workspaceId: demoWorkspaceId },
  });
  if (registry.length !== 3)
    throw new Error("A complete demo registry is required before restoration.");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reviewerDemoMarker},0))::text`;
      const objects = await tx.assetVersion.findMany({
        where: { workspaceId: demoWorkspaceId },
        select: { objectKey: true, stagingKey: true },
      });
      if (
        objects.some(
          (o) =>
            !o.objectKey.startsWith(`${demoWorkspaceId}/`) ||
            (!o.stagingKey.startsWith(`_pending/${demoWorkspaceId}/`) &&
              !o.stagingKey.startsWith("_reviewer-demo/")),
        )
      )
        throw new Error(
          "Unexpected storage key in demo workspace. Restore aborted.",
        );
      await tx.asset.updateMany({
        where: { workspaceId: demoWorkspaceId },
        data: { currentVersionId: null },
      });
      await tx.project.deleteMany({ where: { workspaceId: demoWorkspaceId } });
      await tx.reviewerDemoQuota.deleteMany({
        where: { userId: { in: identities.map((u) => u.id) } },
      });
      // Keep the registry in place throughout restore so Auth credentials remain protected.
      return objects.flatMap((o) => [o.objectKey, o.stagingKey]);
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}
