-- CreateEnum
CREATE TYPE "AssetVersionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentVersionId" UUID,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "AssetVersionStatus" NOT NULL DEFAULT 'PENDING',
    "creatorId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "expectedMimeType" VARCHAR(30) NOT NULL,
    "expectedSize" INTEGER NOT NULL,
    "mimeType" VARCHAR(30),
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "contentHash" CHAR(64),
    "stagingKey" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "cleanupAfter" TIMESTAMPTZ(3) NOT NULL,
    "cleanedAt" TIMESTAMPTZ(3),
    "processingToken" UUID,
    "processingUntil" TIMESTAMPTZ(3),
    "failureReason" VARCHAR(200),

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_currentVersionId_key" ON "Asset"("currentVersionId");

-- CreateIndex
CREATE INDEX "Asset_projectId_workspaceId_createdAt_id_idx" ON "Asset"("projectId", "workspaceId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_id_projectId_workspaceId_key" ON "Asset"("id", "projectId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_currentVersionId_id_key" ON "Asset"("currentVersionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_stagingKey_key" ON "AssetVersion"("stagingKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_objectKey_key" ON "AssetVersion"("objectKey");

-- CreateIndex
CREATE INDEX "AssetVersion_workspaceId_projectId_status_createdAt_idx" ON "AssetVersion"("workspaceId", "projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AssetVersion_cleanupAfter_cleanedAt_idx" ON "AssetVersion"("cleanupAfter", "cleanedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_id_assetId_key" ON "AssetVersion"("id", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_assetId_versionNumber_key" ON "AssetVersion"("assetId", "versionNumber");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_currentVersionId_id_fkey" FOREIGN KEY ("currentVersionId", "id") REFERENCES "AssetVersion"("id", "assetId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_projectId_workspaceId_fkey" FOREIGN KEY ("assetId", "projectId", "workspaceId") REFERENCES "Asset"("id", "projectId", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE app."Asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."AssetVersion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."Asset", app."AssetVersion" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON app."Asset", app."AssetVersion" FROM anon, authenticated;
  END IF;
END $$;
GRANT SELECT, INSERT ON app."Asset", app."AssetVersion" TO review_room_user;
GRANT UPDATE ("currentVersionId") ON app."Asset" TO review_room_user;
GRANT UPDATE (status, "mimeType", "fileSize", width, height, "contentHash", "processingToken", "processingUntil", "failureReason") ON app."AssetVersion" TO review_room_user;

CREATE FUNCTION app.can_upload_project(target uuid, tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM app."Project" p JOIN app."Membership" m ON m."workspaceId" = p."workspaceId"
 WHERE p.id = target AND p."workspaceId" = tenant AND p."archivedAt" IS NULL AND m."userId" = app.request_user_id()
 AND (m.role = 'OWNER' OR (m.role = 'DESIGNER' AND EXISTS (
 SELECT 1 FROM app."ProjectMember" pm WHERE pm."projectId" = p.id AND pm."workspaceId" = tenant AND pm."userId" = m."userId"))))
$$;
REVOKE ALL ON FUNCTION app.can_upload_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_upload_project(uuid, uuid) TO review_room_user;
CREATE POLICY asset_read ON app."Asset" FOR SELECT TO review_room_user USING (app.can_access_project("projectId", "workspaceId"));
CREATE POLICY asset_create ON app."Asset" FOR INSERT TO review_room_user WITH CHECK (app.can_upload_project("projectId", "workspaceId") AND "currentVersionId" IS NULL);
CREATE POLICY asset_publish ON app."Asset" FOR UPDATE TO review_room_user USING (app.can_upload_project("projectId", "workspaceId")) WITH CHECK (app.can_upload_project("projectId", "workspaceId"));
CREATE POLICY version_read ON app."AssetVersion" FOR SELECT TO review_room_user USING (app.can_access_project("projectId", "workspaceId") AND (status = 'READY' OR "creatorId" = app.request_user_id() OR app.is_workspace_owner("workspaceId")));
CREATE POLICY version_create ON app."AssetVersion" FOR INSERT TO review_room_user WITH CHECK (app.can_upload_project("projectId", "workspaceId") AND "creatorId" = app.request_user_id() AND status = 'PENDING' AND "processingToken" IS NULL);
CREATE POLICY version_finalize ON app."AssetVersion" FOR UPDATE TO review_room_user USING (app.can_upload_project("projectId", "workspaceId") AND ("creatorId" = app.request_user_id() OR app.is_workspace_owner("workspaceId"))) WITH CHECK (app.can_upload_project("projectId", "workspaceId"));

ALTER TABLE app."AssetVersion" ADD CONSTRAINT valid_upload_size CHECK ("expectedSize" BETWEEN 1 AND 10485760 AND "expectedMimeType" IN ('image/jpeg','image/png','image/webp') AND "versionNumber" > 0);
ALTER TABLE app."AssetVersion" ADD CONSTRAINT valid_ready_image CHECK (status <> 'READY' OR (
 "fileSize" BETWEEN 1 AND 10485760 AND width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192
 AND width::bigint * height::bigint <= 20000000 AND "mimeType" IN ('image/jpeg','image/png','image/webp')
 AND "fileSize" IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND "mimeType" IS NOT NULL AND "contentHash" IS NOT NULL));

CREATE FUNCTION app.guard_asset_version() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF OLD.status = 'READY' AND (to_jsonb(NEW) - 'cleanedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'cleanedAt') THEN
   RAISE EXCEPTION 'READY asset versions are immutable';
 END IF;
 IF OLD.status = 'FAILED' AND NEW.status <> 'FAILED' THEN RAISE EXCEPTION 'Failed uploads cannot be published'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_asset_version BEFORE UPDATE ON app."AssetVersion" FOR EACH ROW EXECUTE FUNCTION app.guard_asset_version();
CREATE FUNCTION app.guard_current_version() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW."currentVersionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app."AssetVersion" v WHERE v.id = NEW."currentVersionId" AND v."assetId" = NEW.id AND v.status = 'READY') THEN
   RAISE EXCEPTION 'Current version must be READY and belong to this asset';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_current_version BEFORE INSERT OR UPDATE OF "currentVersionId" ON app."Asset" FOR EACH ROW EXECUTE FUNCTION app.guard_current_version();
REVOKE ALL ON FUNCTION app.guard_asset_version(), app.guard_current_version() FROM PUBLIC;
