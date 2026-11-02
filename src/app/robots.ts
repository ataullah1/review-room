import type { MetadataRoute } from "next";
import { isProductionDeployment, readAppOrigin } from "@/lib/config/deployment";
export default function robots(): MetadataRoute.Robots {
  const origin = readAppOrigin();
  return isProductionDeployment()
    ? {
        rules: {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/app",
            "/auth",
            "/api",
            "/login",
            "/signup",
            "/invite",
            "/share",
            "/demo",
          ],
        },
        sitemap: `${origin}/sitemap.xml`,
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
