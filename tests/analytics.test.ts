import { describe, expect, it } from "vitest";
import { isAnalyticsPage, publicPageview } from "../src/lib/config/analytics";

describe("public web analytics", () => {
  it.each(["/", "/login", "/signup"])(
    "tracks %s without query strings or fragments",
    (path) => {
      const event = {
        type: "pageview" as const,
        url: `https://rreviewroom.vercel.app${path}?email=private@example.test#private-token`,
      };
      expect(isAnalyticsPage(path)).toBe(true);
      expect(publicPageview(event)).toEqual({
        type: "pageview",
        url: `https://rreviewroom.vercel.app${path}`,
      });
      expect(event.url).toContain("private-token");
    },
  );
  it.each([
    "/app",
    "/app/workspace/projects/private-project",
    "/auth/callback",
    "/invite",
    "/share/view/private-id",
    "/demo",
    "/demo/state",
    "/unknown",
  ])("drops %s even after navigating from a public page", (path) => {
    expect(isAnalyticsPage(path)).toBe(false);
    expect(
      publicPageview({
        type: "pageview",
        url: `https://rreviewroom.vercel.app${path}?secret=value`,
      }),
    ).toBeNull();
  });
  it("drops custom events, malformed URLs and unresolved routes", () => {
    expect(
      publicPageview({ type: "event", url: "https://rreviewroom.vercel.app/" }),
    ).toBeNull();
    expect(publicPageview({ type: "pageview", url: "invalid" })).toBeNull();
    expect(isAnalyticsPage(null)).toBe(false);
  });
});
