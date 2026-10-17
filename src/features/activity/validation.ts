import { z } from "zod";
export const activityCursor = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(
    (value) =>
      /^(0|[1-9][0-9]{0,18})$/.test(value) &&
      BigInt(value) <= BigInt("9223372036854775807"),
    "Invalid activity cursor.",
  );
export const markActivityInput = z.object({ through: activityCursor });
