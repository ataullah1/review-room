import "server-only";
import { openAsBlob } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readStorageEnvironment } from "../../lib/config/environment";
export function packagesEnabled() {
  return process.env.DELIVERY_ZIP_ENABLED === "true";
}
export function packageStorage() {
  const env = readStorageEnvironment(),
    name = process.env.DELIVERY_ZIP_BUCKET?.trim();
  if (!name || name === env.SUPABASE_STORAGE_BUCKET)
    throw new Error("Configure a separate private ZIP bucket.");
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal || AbortSignal.timeout(20_000),
          }),
      },
    },
  );
  const bucket = client.storage.from(name);
  return {
    async verify() {
      const { data, error } = await client.storage.getBucket(name);
      if (
        error ||
        !data ||
        data.public ||
        (data.allowed_mime_types != null &&
          !data.allowed_mime_types.includes("application/zip"))
      )
        throw new Error(
          "ZIP bucket must be private and accept application/zip uploads.",
        );
      return data.file_size_limit == null
        ? 105000000
        : Math.min(Number(data.file_size_limit), 105000000);
    },
    async put(key: string, path: string) {
      const blob = await openAsBlob(path, { type: "application/zip" });
      const { error } = await bucket.upload(key, blob, {
        upsert: true,
        contentType: "application/zip",
        cacheControl: "0",
      });
      if (error) throw new Error("Package storage unavailable.");
    },
    async remove(key: string) {
      const { error } = await bucket.remove([key]);
      if (error) throw new Error("Package cleanup failed.");
    },
    async sign(key: string) {
      const { data, error } = await bucket.createSignedUrl(key, 60, {
        download: "review-room-delivery.zip",
      });
      if (error || !data) throw new Error("Package download unavailable.");
      return data.signedUrl;
    },
  };
}
