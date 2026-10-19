import type { BeforeSendEvent } from "@vercel/analytics/next";

export function isAnalyticsPage(pathname: string | null): boolean {
  return pathname === "/" || pathname === "/login" || pathname === "/signup";
}

// The injected SDK can outlive a client-side navigation. Filter every event,
// even after the public-page component has unmounted.
export function publicPageview(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  try {
    const url = new URL(event.url);
    if (!isAnalyticsPage(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
