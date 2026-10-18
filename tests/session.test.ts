import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { proxy } from "../src/proxy";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
const create = vi.mocked(createServerClient);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});
describe("cookie refresh proxy", () => {
  it("verifies claims and passes rotated cookies to this request and the browser", async () => {
    const request = new NextRequest("http://localhost/app", {
      headers: { cookie: "sb-session=old" },
    });
    const getClaims = vi.fn().mockImplementation(async () => {
      const options = create.mock.calls[0][2];
      if (!options.cookies || !("setAll" in options.cookies))
        throw new Error("Missing cookie methods");
      await options.cookies.setAll?.(
        [
          {
            name: "sb-session",
            value: "rotated",
            options: { path: "/", httpOnly: true },
          },
        ],
        { "Cache-Control": "private, no-store", Pragma: "no-cache" },
      );
      await options.cookies.setAll?.(
        [{ name: "extra-chunk", value: "new", options: { path: "/" } }],
        {},
      );
      return { data: { claims: { sub: "user-id" } }, error: null };
    });
    create.mockReturnValue({ auth: { getClaims } } as unknown as ReturnType<
      typeof createServerClient
    >);
    const response = await proxy(request);
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][2].cookieOptions?.httpOnly).toBe(true);
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(request.cookies.get("sb-session")?.value).toBe("rotated");
    expect(response.cookies.get("sb-session")?.value).toBe("rotated");
    expect(response.cookies.get("extra-chunk")?.value).toBe("new");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-session=rotated",
    );
  });
  it("fails closed if auth configuration is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect((await proxy(new NextRequest("http://localhost/app"))).status).toBe(
      503,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

it("blocks a production-backed Preview before constructing the Supabase SDK", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  try {
    const response = await proxy(
      new NextRequest("https://preview.example.test/login"),
    );
    expect(response.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
