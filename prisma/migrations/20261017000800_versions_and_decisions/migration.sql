BEGIN;
ALTER TABLE app."AssetVersion" ADD COLUMN "creatorName" VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE app."AssetVersion" DISABLE TRIGGER guard_asset_version;
UPDATE app."AssetVersion" v SET "creatorName"=u."displayName" FROM app."UserProfile" u WHERE u.id=v."creatorId";
ALTER TABLE app."AssetVersion" ENABLE TRIGGER guard_asset_version;

-- CreateEnum
CREATE TYPE "ReviewDecisionKind" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "decisionNumber" INTEGER NOT NULL DEFAULT 0,
    "reviewerName" VARCHAR(100) NOT NULL DEFAULT '',
    "decision" "ReviewDecisionKind" NOT NULL,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewDecision_versionId_createdAt_id_idx" ON "ReviewDecision"("versionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ReviewDecision_versionId_reviewerId_createdAt_id_idx" ON "ReviewDecision"("versionId", "reviewerId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDecision_versionId_decisionNumber_key" ON "ReviewDecision"("versionId", "decisionNumber");

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Historical feedback stays readable. Writes require the READY current version.
CREATE OR REPLACE FUNCTION app.can_write_comment_version(target uuid, resolving boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM app."AssetVersion" v JOIN app."Asset" a ON a.id=v."assetId" AND a."currentVersionId"=v.id
 JOIN app."Project" p ON p.id=v."projectId" AND p."workspaceId"=v."workspaceId"
 JOIN app."Membership" m ON m."workspaceId"=p."workspaceId"
 WHERE v.id=target AND v.status='READY' AND p."archivedAt" IS NULL AND m."userId"=app.request_user_id()
 AND app.can_access_project(p.id,p."workspaceId") AND (NOT resolving OR m.role IN ('OWNER','DESIGNER')))
$$;

-- Serialize direct comment writes and decision inserts with publication too.
CREATE FUNCTION app.lock_feedback_current() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_asset uuid; current_id uuid;
BEGIN
 SELECT "assetId" INTO target_asset FROM app."AssetVersion" WHERE id=NEW."versionId";
 SELECT "currentVersionId" INTO current_id FROM app."Asset" WHERE id=target_asset FOR UPDATE;
 IF current_id IS DISTINCT FROM NEW."versionId" THEN RAISE EXCEPTION 'Historical versions are read only; refresh the current version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lock_feedback_current BEFORE INSERT OR UPDATE ON app."Comment" FOR EACH ROW EXECUTE FUNCTION app.lock_feedback_current();
REVOKE ALL ON FUNCTION app.lock_feedback_current() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.guard_current_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE new_number integer; old_number integer;
BEGIN
 IF NEW."currentVersionId" IS NOT NULL THEN
   SELECT "versionNumber" INTO new_number FROM app."AssetVersion" WHERE id=NEW."currentVersionId" AND "assetId"=NEW.id AND status='READY';
   IF new_number IS NULL THEN RAISE EXCEPTION 'Current version must be READY and belong to this asset'; END IF;
   IF TG_OP='UPDATE' AND OLD."currentVersionId" IS NOT NULL AND NEW."currentVersionId" IS DISTINCT FROM OLD."currentVersionId" THEN
     SELECT "versionNumber" INTO old_number FROM app."AssetVersion" WHERE id=OLD."currentVersionId";
     IF new_number <= old_number THEN RAISE EXCEPTION 'Current version cannot move backwards'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER TABLE app."ReviewDecision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."ReviewDecision" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app."ReviewDecision" FROM anon, authenticated; END IF;
END $$;
GRANT SELECT, INSERT ON app."ReviewDecision" TO review_room_user;
CREATE FUNCTION app.can_decide_version(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM app."AssetVersion" v JOIN app."Asset" a ON a.id=v."assetId" AND a."currentVersionId"=v.id
 JOIN app."Project" p ON p.id=v."projectId" AND p."workspaceId"=v."workspaceId"
 JOIN app."Membership" m ON m."workspaceId"=p."workspaceId" AND m."userId"=app.request_user_id() AND m.role='CLIENT'
 JOIN app."ProjectMember" pm ON pm."projectId"=p.id AND pm."workspaceId"=p."workspaceId" AND pm."userId"=m."userId"
 WHERE v.id=target AND v.status='READY' AND p."archivedAt" IS NULL)
$$;
REVOKE ALL ON FUNCTION app.can_decide_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_decide_version(uuid) TO review_room_user;
CREATE POLICY decision_read ON app."ReviewDecision" FOR SELECT TO review_room_user USING(app.can_read_comment_version("versionId"));
CREATE POLICY decision_create ON app."ReviewDecision" FOR INSERT TO review_room_user WITH CHECK("reviewerId"=app.request_user_id() AND app.can_decide_version("versionId"));
ALTER TABLE app."ReviewDecision" ADD CONSTRAINT decision_note CHECK(
 "decisionNumber">0 AND (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 2000)
 AND (decision<>'CHANGES_REQUESTED' OR note IS NOT NULL));
CREATE FUNCTION app.guard_review_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_asset uuid; current_id uuid;
BEGIN
 SELECT "assetId" INTO target_asset FROM app."AssetVersion" WHERE id=NEW."versionId";
 SELECT "currentVersionId" INTO current_id FROM app."Asset" WHERE id=target_asset FOR UPDATE;
 IF current_id IS DISTINCT FROM NEW."versionId" THEN RAISE EXCEPTION 'This version is no longer current; refresh before reviewing'; END IF;
 IF NOT app.can_decide_version(NEW."versionId") OR NEW."reviewerId" IS DISTINCT FROM app.request_user_id() THEN RAISE EXCEPTION 'Only assigned clients can review the current version'; END IF;
 SELECT "displayName" INTO NEW."reviewerName" FROM app."UserProfile" WHERE id=NEW."reviewerId";
 SELECT coalesce(max("decisionNumber"),0)+1 INTO NEW."decisionNumber" FROM app."ReviewDecision" WHERE "versionId"=NEW."versionId";
 NEW."createdAt" := clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER guard_review_decision BEFORE INSERT ON app."ReviewDecision" FOR EACH ROW EXECUTE FUNCTION app.guard_review_decision();
REVOKE ALL ON FUNCTION app.guard_review_decision() FROM PUBLIC;

-- Count reservations by every uploader without exposing their private pending rows.
CREATE FUNCTION app.assign_version_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM app."Asset" WHERE id=NEW."assetId" AND "projectId"=NEW."projectId" AND "workspaceId"=NEW."workspaceId" FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Image not found'; END IF;
 SELECT "displayName" INTO NEW."creatorName" FROM app."UserProfile" WHERE id=NEW."creatorId";
 SELECT coalesce(max("versionNumber"),0)+1 INTO NEW."versionNumber" FROM app."AssetVersion" WHERE "assetId"=NEW."assetId";
 RETURN NEW;
END $$;
CREATE TRIGGER assign_version_number BEFORE INSERT ON app."AssetVersion" FOR EACH ROW EXECUTE FUNCTION app.assign_version_number();
REVOKE ALL ON FUNCTION app.assign_version_number() FROM PUBLIC;

COMMIT;
