import "server-only";
import { readStorageEnvironment } from "../config/environment";
import { storageClient } from "../storage/client";
export function getUploadStorage() {
  return storageClient(readStorageEnvironment());
}
