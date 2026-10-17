import { z } from "zod";
export const decisionInput = z
  .object({
    id: z.uuid(),
    expectedCurrentVersionId: z.uuid(),
    decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
    note: z
      .string()
      .trim()
      .max(2000)
      .refine((s) => !s.includes("\u0000"))
      .nullable()
      .optional()
      .transform((s) => s || null),
  })
  .refine(
    (data) => data.decision !== "CHANGES_REQUESTED" || !!data.note,
    "Explain which changes are needed.",
  );
