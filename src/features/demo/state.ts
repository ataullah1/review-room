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
        xRatio: 0.33,
        yRatio: 0.29,
        body: "Please make the Forma wordmark larger and give the tagline more breathing room.",
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
        body: "Updated in version 2: a larger wordmark, stronger forest green and clearer contact details.",
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
        xRatio: 0.33,
        yRatio: 0.29,
        body: "The larger wordmark and clearer hierarchy are ready for your final review.",
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
        xRatio: 0.43,
        yRatio: 0.36,
        body: "Sunday feels more prominent, and the smaller badge gives the books room to breathe.",
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
        yRatio: 0.9,
        body: "The benefits and net weight are much clearer. Please check the final label before approval.",
        author: "DESIGNER",
        resolved: false,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000006",
        assetId: "identity",
        version: 1,
        parentId: null,
        threadNumber: 2,
        xRatio: 0.58,
        yRatio: 0.55,
        body: "Give forest green more emphasis and increase the contrast between the lighter palette swatches.",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000007",
        assetId: "identity",
        version: 1,
        parentId: null,
        threadNumber: 3,
        xRatio: 0.28,
        yRatio: 0.91,
        body: "Make the business-card contact details larger and darker so they remain readable at a small size.",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000008",
        assetId: "journal",
        version: 1,
        parentId: null,
        threadNumber: 1,
        xRatio: 0.39,
        yRatio: 0.36,
        body: "Make Sunday more prominent and add space between the headline and supporting text.",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000009",
        assetId: "journal",
        version: 1,
        parentId: null,
        threadNumber: 2,
        xRatio: 0.65,
        yRatio: 0.8,
        body: "Make this badge smaller and move it right so it covers less of the books. Improve the text legibility too.",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000010",
        assetId: "packaging",
        version: 1,
        parentId: null,
        threadNumber: 1,
        xRatio: 0.5,
        yRatio: 0.27,
        body: "Make the Forma logo larger and add more space between it and the tagline.",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000011",
        assetId: "packaging",
        version: 1,
        parentId: null,
        threadNumber: 2,
        xRatio: 0.44,
        yRatio: 0.47,
        body: "Refine the size and spacing of Roasted Almond and Granola so the product name reads at a glance.",
        author: "CLIENT",
        resolved: true,
        createdAt,
      },
      {
        id: "90000000-0000-4000-8000-000000000012",
        assetId: "packaging",
        version: 1,
        parentId: null,
        threadNumber: 3,
        xRatio: 0.5,
        yRatio: 0.89,
        body: "Make the product benefits and net weight darker, and align the information along the bottom.",
        author: "CLIENT",
        resolved: true,
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
