-- Dynamic trigger records do not share the same columns. Inspect JSON for
-- optional fields instead of accessing a field absent on decisions/comments.
CREATE OR REPLACE FUNCTION app.guard_completed_project() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pid uuid; completed uuid;
BEGIN
 IF current_setting('role',true) NOT IN ('review_room_user','review_room_capability') THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_TABLE_NAME='Project' THEN
  IF TG_OP<>'INSERT' AND NEW."completionId" IS DISTINCT FROM OLD."completionId" THEN
   IF current_setting('app.lifecycle_project',true)=NEW.id::text THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Completion is managed by the owner lifecycle service'; END IF;
  pid:=NEW.id;
 ELSIF TG_TABLE_NAME IN ('Comment','ReviewDecision','ShareLink') THEN
  IF TG_OP='DELETE' THEN SELECT "projectId" INTO pid FROM app."AssetVersion" WHERE id=OLD."versionId"; ELSE SELECT "projectId" INTO pid FROM app."AssetVersion" WHERE id=NEW."versionId"; END IF;
 ELSE IF TG_OP='DELETE' THEN pid:=OLD."projectId"; ELSE pid:=NEW."projectId"; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||pid::text,0));
 SELECT "completionId" INTO completed FROM app."Project" WHERE id=pid;
 IF completed IS NOT NULL THEN
  -- Removing access and revoking an existing capability remain available.
  IF TG_TABLE_NAME='ProjectMember' AND TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME IN ('ShareLink','ProjectInvitation') AND TG_OP='UPDATE' AND to_jsonb(NEW)->>'revokedAt' IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='Project' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'archivedAt')=(to_jsonb(OLD)-'archivedAt') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Reopen this completed project before changing its work.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
