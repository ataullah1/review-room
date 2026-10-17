import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decisionInput } from "../src/features/reviews/validation";
import { uploadInput } from "../src/features/uploads/validation";
describe("version and decision input", () => {
  it("requires a current-version expectation and a nonempty changes note", () => {
    const input = {
      id: randomUUID(),
      expectedCurrentVersionId: randomUUID(),
      decision: "CHANGES_REQUESTED",
    };
    expect(decisionInput.safeParse(input).success).toBe(false);
    expect(decisionInput.safeParse({ ...input, note: "  " }).success).toBe(
      false,
    );
    expect(
      decisionInput.parse({ ...input, note: "  Please increase spacing.  " })
        .note,
    ).toBe("Please increase spacing.");
    expect(
      decisionInput.safeParse({
        ...input,
        note: "x",
        expectedCurrentVersionId: "bad",
      }).success,
    ).toBe(false);
  });
  it("allows an optional approve note, plain text and only known server inputs", () => {
    const input = {
      id: randomUUID(),
      expectedCurrentVersionId: randomUUID(),
      decision: "APPROVED",
      note: " <b>Looks good</b> ",
      reviewerId: randomUUID(),
    };
    expect(decisionInput.parse(input)).toMatchObject({
      note: "<b>Looks good</b>",
    });
    expect(decisionInput.parse(input)).not.toHaveProperty("reviewerId");
    expect(decisionInput.parse({ ...input, note: "" }).note).toBeNull();
    expect(
      decisionInput.safeParse({ ...input, note: "a".repeat(2001) }).success,
    ).toBe(false);
    expect(
      decisionInput.safeParse({ ...input, note: "bad\u0000" }).success,
    ).toBe(false);
  });
  it("only accepts a UUID asset target for an additional immutable version", () => {
    const file = { name: "update.png", mimeType: "image/png", size: 100 };
    expect(
      uploadInput.safeParse({ ...file, assetId: randomUUID() }).success,
    ).toBe(true);
    expect(
      uploadInput.safeParse({ ...file, assetId: "../foreign" }).success,
    ).toBe(false);
    expect(uploadInput.safeParse(file).success).toBe(true);
  });
});
