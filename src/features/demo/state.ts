import { z } from "zod";
export const assetIdSchema = z.enum(["identity", "journal", "packaging"]);
export const demoView = z.enum(["DESIGNER", "CLIENT"]);
export const demoComment = z.object({
  id: z.uuid(),
  assetId: assetIdSchema,
  version: z.union([z.literal(1), z.literal(2)]),
  parentId: z.uuid().nullable(),
  threadNumber: z.number().int().positive().nullable(),
  xRatio: z.number().min(0).max(1).nullable(),
  yRatio: z.number().min(0).max(1).nullable(),
  body: z.string().max(1000),
  author: demoView,
  resolved: z.boolean(),
  createdAt: z.string(),
});
export const demoDecision = z.object({
  assetId: assetIdSchema,
  version: z.union([z.literal(1), z.literal(2)]),
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  note: z.string().max(1000).nullable(),
  createdAt: z.string(),
});
export const demoState = z.object({
  comments: z.array(demoComment).max(40),
  decisions: z.array(demoDecision).max(102),
});
export type DemoState = z.infer<typeof demoState>;
export type DemoComment = z.infer<typeof demoComment>;
export type DemoSnapshot = {
  view: "DESIGNER" | "CLIENT";
  state: DemoState;
  expiresAt: string;
  generation: number;
  commentCount: number;
  actionCount: number;
};
export function seededDemo(): DemoState {
  const createdAt = "2026-10-01T10:00:00.000Z";
  return {
    comments: [
      {
        id: "90000000-0000-4000-8000-000000000001",
        assetId: "identity",
        version: 1,
        parentId: null,
        threadNumber: 1,
        xRatio: 0.5,
        yRatio: 0.5,
        body: "Could the wordmark have a little more breathing room?",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000002",
        assetId: "identity",
        version: 1,
        parentId: "90000000-0000-4000-8000-000000000001",
        threadNumber: null,
        xRatio: null,
        yRatio: null,
        body: "Added space around the mark in version 2. Take a look!",
        author: "DESIGNER",
        resolved: false,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000003",
        assetId: "identity",
        version: 2,
        parentId: null,
        threadNumber: 1,
        xRatio: 0.5,
        yRatio: 0.56,
        body: "The spacing feels much calmer now. Ready for the final review.",
        author: "DESIGNER",
        resolved: false,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000004",
        assetId: "journal",
        version: 2,
        parentId: null,
        threadNumber: 1,
        xRatio: 0.42,
        yRatio: 0.38,
        body: "This crop and type balance work beautifully together.",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000005",
        assetId: "packaging",
        version: 2,
        parentId: null,
        threadNumber: 1,
        xRatio: 0.5,
        yRatio: 0.73,
        body: "Please make the weight label a little easier to read.",
        author: "CLIENT",
        resolved: false,
        createdAt,
      },
    ],
    decisions: [
      {
        assetId: "journal",
        version: 2,
        decision: "APPROVED",
        note: "Ready to go.",
        createdAt,
      },
      {
        assetId: "packaging",
        version: 2,
        decision: "CHANGES_REQUESTED",
        note: "Increase the weight-label contrast.",
        createdAt,
      },
    ],
  };
}
const common = {
  requestId: z.uuid(),
  generation: z.number().int().min(0).max(100),
};
const body = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((s) => !s.includes("\u0000"));
export const demoMutation = z.discriminatedUnion("operation", [
  z
    .object({ ...common, operation: z.literal("view"), view: demoView })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal("comment"),
      assetId: assetIdSchema,
      version: z.union([z.literal(1), z.literal(2)]),
      body,
      parentId: z.uuid().nullable().default(null),
      xRatio: z.number().finite().min(0).max(1).nullable().default(null),
      yRatio: z.number().finite().min(0).max(1).nullable().default(null),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal("resolve"),
      assetId: assetIdSchema,
      version: z.union([z.literal(1), z.literal(2)]),
      id: z.uuid(),
      resolved: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal("decision"),
      assetId: assetIdSchema,
      version: z.union([z.literal(1), z.literal(2)]),
      decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
      note: body.nullable().default(null),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal("reset"),
      confirm: z.literal(true),
    })
    .strict(),
]);
