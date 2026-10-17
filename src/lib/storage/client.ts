import { createClient } from "@supabase/supabase-js";
import { UploadError, maxImageBytes } from "../../features/uploads/validation";
export interface UploadStorage {
  signUpload(key: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  signRead(key: string): Promise<string>;
}
export function storageClient(config: {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_STORAGE_BUCKET: string;
}): UploadStorage {
  const client = createClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal || AbortSignal.timeout(20_000),
          }),
      },
    },
  );
  const bucket = client.storage.from(config.SUPABASE_STORAGE_BUCKET);
  const signRead = async (key: string) => {
    const { data, error } = await bucket.createSignedUrl(key, 60);
    if (error || !data?.signedUrl)
      throw new UploadError(
        "Could not open this image. Please try again.",
        503,
      );
    return data.signedUrl;
  };
  return {
    async signUpload(key) {
      const { data, error } = await bucket.createSignedUploadUrl(key, {
        upsert: false,
      });
      if (error || !data?.signedUrl)
        throw new UploadError(
          "Could not start this upload. Please try again.",
          503,
        );
      return data.signedUrl;
    },
    async read(key) {
      const response = await fetch(await signRead(key), {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok || !response.body)
        throw new UploadError(
          "The uploaded file is unavailable. Please upload it again.",
        );
      if (Number(response.headers.get("content-length")) > maxImageBytes) {
        await response.body.cancel();
        throw new UploadError("Choose an image of 10 MB or less.");
      }
      const reader = response.body.getReader(),
        chunks: Buffer[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxImageBytes)
            throw new UploadError("Choose an image of 10 MB or less.");
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return Buffer.concat(chunks, size);
    },
    async put(key, bytes, mimeType) {
      const { error } = await bucket.upload(key, bytes, {
        contentType: mimeType,
        upsert: false,
        cacheControl: "0",
      });
      if (error)
        throw new UploadError(
          "Could not save this image. Please upload it again.",
          503,
        );
    },
    async remove(keys) {
      if (!keys.length) return;
      const { error } = await bucket.remove(keys);
      if (error) throw new UploadError("Upload cleanup will be retried.", 503);
    },
    signRead,
  };
}
