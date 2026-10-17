import { describe, it, expect } from "vitest";
import { imagePoint, isPinClick } from "../src/features/comments/coordinates";
import { createCommentSchema } from "../src/features/comments/validation";
const id = "10000000-0000-4000-8000-000000000001";
describe("image content coordinates", () => {
  it("places all four corners and centre against the actual content rectangle", () => {
    const rect = { left: 100, top: 80, width: 800, height: 400 };
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.5, 0.5],
    ])
      expect(imagePoint(100 + x * 800, 80 + y * 400, rect)).toEqual({
        xRatio: x,
        yRatio: y,
      });
  });
  it("keeps the same normalized target after resize, zoom and pan offsets", () => {
    for (const rect of [
      { left: 10, top: 25, width: 300, height: 200 },
      { left: -250, top: -70, width: 1800, height: 1200 },
    ])
      expect(
        imagePoint(
          rect.left + rect.width * 0.25,
          rect.top + rect.height * 0.75,
          rect,
        ),
      ).toEqual({ xRatio: 0.25, yRatio: 0.75 });
  });
  it("ignores letterboxing/outside points, invalid geometry and zero-size images", () => {
    for (const [x, y] of [
      [99, 200],
      [901, 200],
      [200, 79],
      [200, 481],
    ])
      expect(
        imagePoint(x, y, { left: 100, top: 80, width: 800, height: 400 }),
      ).toBeNull();
    expect(
      imagePoint(0, 0, { left: 0, top: 0, width: 0, height: 1 }),
    ).toBeNull();
    expect(
      imagePoint(NaN, 0, { left: 0, top: 0, width: 100, height: 100 }),
    ).toBeNull();
  });
  it("distinguishes small clicks from pan drags", () => {
    expect(isPinClick({ x: 10, y: 10 }, { x: 10, y: 10 }, true)).toBe(false);
    expect(isPinClick({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(true);
    expect(isPinClick({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false);
  });
});
describe("immutable comment payload", () => {
  it("trims plain text and drops forged author, version and resolved state", () => {
    expect(
      createCommentSchema.parse({
        id,
        body: "  <script>hello</script>  ",
        xRatio: 0,
        yRatio: 1,
        authorId: id,
        resolvedAt: "now",
        versionId: id,
      }),
    ).toEqual({
      id,
      body: "<script>hello</script>",
      parentId: null,
      xRatio: 0,
      yRatio: 1,
    });
  });
  it("requires root coordinates and forbids coordinates on replies", () => {
    expect(createCommentSchema.safeParse({ id, body: "root" }).success).toBe(
      false,
    );
    expect(
      createCommentSchema.safeParse({
        id,
        body: "reply",
        parentId: id,
        xRatio: 0.2,
        yRatio: 0.5,
      }).success,
    ).toBe(false);
    expect(
      createCommentSchema.safeParse({ id, body: "reply", parentId: id })
        .success,
    ).toBe(true);
  });
  it("bounds text and rejects invalid/non-finite normalized positions", () => {
    for (const body of [" ", "a".repeat(2001), "bad\0text"])
      expect(
        createCommentSchema.safeParse({ id, body, xRatio: 0.5, yRatio: 0.5 })
          .success,
      ).toBe(false);
    for (const xRatio of [-0.01, 1.01, NaN, Infinity])
      expect(
        createCommentSchema.safeParse({ id, body: "text", xRatio, yRatio: 0.5 })
          .success,
      ).toBe(false);
  });
});
