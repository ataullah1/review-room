import type { MetadataRoute } from "next";
import {
  isProductionDeployment,
  productionOrigin,
} from "@/lib/config/deployment";
export default function robots(): MetadataRoute.Robots {
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
        sitemap: `${productionOrigin}/sitemap.xml`,
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
