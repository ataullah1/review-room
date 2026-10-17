import { describe, it, expect } from "vitest";
import {
  activityCursor,
  markActivityInput,
} from "../src/features/activity/validation";
import { activityDescription } from "../src/features/activity/description";
describe("activity contracts", () => {
  it("keeps bigint cursors lossless and rejects malformed/overflow values", () => {
    for (const value of ["0", "1", "9007199254740993", "9223372036854775807"])
      expect(activityCursor.parse(value)).toBe(value);
    for (const value of ["-1", "01", "1.5", "1e3", "9223372036854775808", "x"])
      expect(activityCursor.safeParse(value).success).toBe(false);
  });
  it("accepts only an explicit viewed high-water mark", () => {
    expect(
      markActivityInput.parse({ through: "42", userId: "forged" }),
    ).toEqual({ through: "42" });
    expect(markActivityInput.safeParse({ through: 42 }).success).toBe(false);
  });
  it("describes resource changes without copying comment text or invitation tokens", () => {
    expect(
      activityDescription({
        kind: "REPLY_CREATED",
        versionNumber: 2,
        threadNumber: 3,
      }),
    ).toBe("replied to thread 3 on version 2");
    expect(
      activityDescription({
        kind: "INVITE_ACCEPTED",
        versionNumber: null,
        threadNumber: null,
      }),
    ).toBe("joined the project");
  });
});
