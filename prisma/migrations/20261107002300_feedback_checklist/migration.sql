BEGIN;
CREATE TABLE app."FeedbackAddress" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "sourceId" uuid NOT NULL REFERENCES app."Comment"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "targetVersionId" uuid NOT NULL REFERENCES app."AssetVersion"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" uuid NOT NULL REFERENCES app."UserProfile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorName" varchar(100) NOT NULL, note varchar(1000) NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 1000),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "FeedbackAddress_sourceId_targetVersionId_key" ON app."FeedbackAddress"("sourceId","targetVersionId");
CREATE INDEX "FeedbackAddress_targetVersionId_createdAt_id_idx" ON app."FeedbackAddress"("targetVersionId","createdAt",id);
ALTER TABLE app."FeedbackAddress" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."FeedbackAddress" FROM PUBLIC;
GRANT SELECT,INSERT ON app."FeedbackAddress" TO review_room_user;
CREATE POLICY feedback_read ON app."FeedbackAddress" FOR SELECT TO review_room_user USING(app.can_read_comment_version("targetVersionId") AND (app.reviewer_demo_workspace() IS NULL OR EXISTS(SELECT 1 FROM app."AssetVersion" v WHERE v.id="targetVersionId" AND v."workspaceId"=app.reviewer_demo_workspace())));
CREATE POLICY feedback_create ON app."FeedbackAddress" FOR INSERT TO review_room_user WITH CHECK("actorId"=app.request_user_id() AND app.can_write_comment_version("targetVersionId",true) AND app.reviewer_demo_workspace() IS NULL);
CREATE FUNCTION app.guard_feedback_address() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source app."Comment"; old_version app."AssetVersion"; target app."AssetVersion"; p app."Project";
BEGIN
 IF TG_OP<>'INSERT' AND current_setting('role',true) NOT IN ('review_room_user','review_room_capability') THEN RETURN OLD; END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Feedback address claims are immutable'; END IF;
 SELECT * INTO target FROM app."AssetVersion" WHERE id=NEW."targetVersionId";
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||target."projectId"::text,0));
 SELECT * INTO source FROM app."Comment" WHERE id=NEW."sourceId";
 SELECT * INTO old_version FROM app."AssetVersion" WHERE id=source."versionId";
 SELECT * INTO p FROM app."Project" WHERE id=target."projectId";
 IF source.id IS NULL OR source."parentId" IS NOT NULL OR old_version.status<>'READY' OR target.status<>'READY' OR
 old_version."assetId"<>target."assetId" OR old_version."projectId"<>target."projectId" OR old_version."workspaceId"<>target."workspaceId" OR old_version."versionNumber">=target."versionNumber" OR
 p."archivedAt" IS NOT NULL OR p."completionId" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app."Asset" WHERE id=target."assetId" AND "currentVersionId"=target.id) THEN
 RAISE EXCEPTION 'Link a historical root thread to the current version of the same active design'; END IF;
 IF NEW."actorId"<>app.request_user_id() OR NOT app.can_upload_project(p.id,p."workspaceId") OR app.reviewer_demo_workspace() IS NOT NULL THEN RAISE EXCEPTION 'Feedback claim is not permitted' USING ERRCODE='42501'; END IF;
 SELECT "displayName" INTO NEW."actorName" FROM app."UserProfile" WHERE id=NEW."actorId";
 NEW."createdAt":=now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_feedback_address() FROM PUBLIC;
CREATE TRIGGER feedback_integrity BEFORE INSERT OR UPDATE OR DELETE ON app."FeedbackAddress" FOR EACH ROW EXECUTE FUNCTION app.guard_feedback_address();
COMMIT;
