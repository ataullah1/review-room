import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Generation/validation work without secrets. Database commands still require
    // an explicitly configured URL; runtime uses the separate pooled DATABASE_URL.
    url: process.env.DIRECT_URL ?? "",
  },
});
