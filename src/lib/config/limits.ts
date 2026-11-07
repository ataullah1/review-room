export type StorageLimits = {
  maxStorageBytes: number;
  maxReadyVersions: number;
  maxPendingUploads: number;
};

// Documented finite defaults:
// 500 MB default storage limit per workspace
export const DEFAULT_MAX_STORAGE_BYTES = 500 * 1024 * 1024;
// 200 ready images/versions default limit per workspace
export const DEFAULT_MAX_READY_VERSIONS = 200;
// 5 simultaneous active pending reservations per workspace
export const DEFAULT_MAX_PENDING_UPLOADS = 5;

export function readStorageLimits(
  env: Readonly<Record<string, string | undefined>> = process.env,
): StorageLimits {
  const parsePositiveInt = (val: string | undefined, fallback: number) => {
    if (!val) return fallback;
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return {
    maxStorageBytes: parsePositiveInt(
      env.WORKSPACE_MAX_STORAGE_BYTES,
      DEFAULT_MAX_STORAGE_BYTES,
    ),
    maxReadyVersions: parsePositiveInt(
      env.WORKSPACE_MAX_READY_VERSIONS,
      DEFAULT_MAX_READY_VERSIONS,
    ),
    maxPendingUploads: parsePositiveInt(
      env.WORKSPACE_MAX_PENDING_UPLOADS,
      DEFAULT_MAX_PENDING_UPLOADS,
    ),
  };
}
