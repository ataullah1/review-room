import { z } from "zod";
const body = z
  .string()
  .trim()
  .min(1, "Write a comment first.")
  .max(2000, "Use no more than 2000 characters.")
  .refine(
    (value) => !value.includes("\u0000"),
    "Remove invalid characters from your comment.",
  );
export const createCommentSchema = z
  .object({
    id: z.uuid(),
    body,
    parentId: z.uuid().nullable().default(null),
    xRatio: z.number().finite().min(0).max(1).nullable().default(null),
    yRatio: z.number().finite().min(0).max(1).nullable().default(null),
  })
  .refine(
    (data) =>
      data.parentId
        ? data.xRatio === null && data.yRatio === null
        : data.xRatio !== null && data.yRatio !== null,
    "Root comments need a position; replies belong to a thread.",
  );
export const commentMutation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), input: createCommentSchema }),
  z.object({
    operation: z.literal("resolve"),
    id: z.uuid(),
    resolved: z.boolean(),
  }),
]);
export function boundedInteger(value: string | null, fallback = 0) {
  const n = Number(value);
  return value !== null && Number.isSafeInteger(n) && n >= 0 && n <= 1000000
    ? n
    : fallback;
}
