"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { isAnalyticsPage, publicPageview } from "@/lib/config/analytics";

export function SiteAnalytics() {
  const pathname = usePathname();
  if (!isAnalyticsPage(pathname)) return null;
  return <Analytics beforeSend={publicPageview} />;
}
