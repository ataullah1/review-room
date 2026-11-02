import type { MetadataRoute } from "next";
import { isProductionDeployment, readAppOrigin } from "@/lib/config/deployment";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = readAppOrigin();
  return isProductionDeployment()
    ? [{ url: origin, changeFrequency: "monthly", priority: 1 }]
    : [];
}
