import type { MetadataRoute } from "next";
import {
  isProductionDeployment,
  productionOrigin,
} from "@/lib/config/deployment";
export default function sitemap(): MetadataRoute.Sitemap {
  return isProductionDeployment()
    ? [{ url: productionOrigin, changeFrequency: "monthly", priority: 1 }]
    : [];
}
