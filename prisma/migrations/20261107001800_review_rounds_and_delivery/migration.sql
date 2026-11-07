BEGIN;
CREATE TABLE app."ReviewRound" (
 id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "projectId" uuid NOT NULL, "assetId" uuid NOT NULL,
 "versionId" uuid NOT NULL REFERENCES app."AssetVersion"(id) ON DELETE RESTRICT,
 "requestedById" uuid NOT NULL, "requestedByName" varchar(100) NOT NULL, reason varchar(500) NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY("assetId","projectId","workspaceId") REFERENCES app."Asset"(id,"projectId","workspaceId") ON DELETE CASCADE
);
CREATE INDEX "ReviewRound_versionId_createdAt_idx" ON app."ReviewRound"("versionId","createdAt");
CREATE TABLE app."ReviewRoundReviewer" (
 "roundId" uuid NOT NULL REFERENCES app."ReviewRound"(id) ON DELETE CASCADE,
 "userId" uuid NOT NULL REFERENCES app."UserProfile"(id) ON DELETE RESTRICT,
 "reviewerName" varchar(100) NOT NULL, PRIMARY KEY("roundId","userId")
);
CREATE TABLE app."ProjectCompletion" (
 id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "projectId" uuid NOT NULL,
 "completedById" uuid NOT NULL, "completedByName" varchar(100) NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(), manifest jsonb NOT NULL,
 FOREIGN KEY("projectId","workspaceId") REFERENCES app."Project"(id,"workspaceId") ON DELETE RESTRICT
);
CREATE TABLE app."ProjectReopening" (
 id uuid PRIMARY KEY, "completionId" uuid NOT NULL UNIQUE REFERENCES app."ProjectCompletion"(id) ON DELETE RESTRICT,
 "projectId" uuid NOT NULL REFERENCES app."Project"(id) ON DELETE RESTRICT,
 "actorId" uuid NOT NULL, "actorName" varchar(100) NOT NULL, reason varchar(500) NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app."Project" ADD COLUMN "completionId" uuid UNIQUE REFERENCES app."ProjectCompletion"(id) ON DELETE RESTRICT;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ReviewRound','ReviewRoundReviewer','ProjectCompletion','ProjectReopening'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',t);
  EXECUTE format('GRANT SELECT ON app.%I TO review_room_user',t);
 END LOOP;
END $$;
CREATE POLICY round_read ON app."ReviewRound" FOR SELECT TO review_room_user USING(app.can_access_project("projectId","workspaceId") AND (app.reviewer_demo_workspace() IS NULL OR "workspaceId"=app.reviewer_demo_workspace()));
CREATE POLICY required_read ON app."ReviewRoundReviewer" FOR SELECT TO review_room_user USING(EXISTS(SELECT 1 FROM app."ReviewRound" r WHERE r.id="roundId"));
CREATE POLICY completion_read ON app."ProjectCompletion" FOR SELECT TO review_room_user USING(app.can_access_project("projectId","workspaceId") AND (app.reviewer_demo_workspace() IS NULL OR "workspaceId"=app.reviewer_demo_workspace()));
CREATE POLICY reopening_read ON app."ProjectReopening" FOR SELECT TO review_room_user USING(EXISTS(SELECT 1 FROM app."Project" p WHERE p.id="projectId" AND app.can_access_project(p.id,p."workspaceId") AND (app.reviewer_demo_workspace() IS NULL OR p."workspaceId"=app.reviewer_demo_workspace())));

-- All approval-state readers and writers share project advisory serialization.
CREATE FUNCTION app.review_round_status(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v app."AssetVersion"; r app."ReviewRound"; required jsonb; open_count integer; state text;
BEGIN
 SELECT * INTO v FROM app."AssetVersion" WHERE id=target AND status='READY';
 IF v.id IS NULL OR NOT app.can_access_project(v."projectId",v."workspaceId") OR (app.reviewer_demo_workspace() IS NOT NULL AND v."workspaceId"<>app.reviewer_demo_workspace()) THEN RETURN jsonb_build_object('error','Review unavailable.','status',404); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||v."projectId"::text,0));
 SELECT * INTO r FROM app."ReviewRound" WHERE "versionId"=target ORDER BY "createdAt" DESC,id DESC LIMIT 1;
 IF r.id IS NULL THEN RETURN jsonb_build_object('state','UNCONFIGURED','reviewers','[]'::jsonb,'openComments',0,'roundId',null); END IF;
 SELECT count(*) INTO open_count FROM app."Comment" WHERE "versionId"=target AND "parentId" IS NULL AND "resolvedAt" IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',q."userId",'name',q."reviewerName",'hasAccess',EXISTS(SELECT 1 FROM app."ProjectMember" pm JOIN app."Membership" m ON m."userId"=pm."userId" AND m."workspaceId"=pm."workspaceId" WHERE pm."projectId"=r."projectId" AND pm."userId"=q."userId" AND m.role='CLIENT'),'decision',(SELECT d.decision::text FROM app."ReviewDecision" d WHERE d."versionId"=target AND d."reviewerId"=q."userId" AND d."createdAt">=r."createdAt" ORDER BY d."decisionNumber" DESC LIMIT 1)) ORDER BY q."reviewerName",q."userId"),'[]'::jsonb) INTO required FROM app."ReviewRoundReviewer" q WHERE q."roundId"=r.id;
 IF jsonb_array_length(required)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(required) e WHERE (e->>'hasAccess')::boolean IS NOT TRUE) THEN state:='REVIEWERS_REQUIRED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(required)e WHERE e->>'decision'='CHANGES_REQUESTED') THEN state:='CHANGES_REQUESTED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(required)e WHERE e->>'decision' IS NULL) THEN state:='AWAITING_REVIEW';
 ELSIF open_count>0 THEN state:='FEEDBACK_OPEN'; ELSE state:='APPROVED'; END IF;
 RETURN jsonb_build_object('state',state,'roundId',r.id,'requestedAt',r."createdAt",'reviewers',required,'openComments',open_count);
END $$;
CREATE FUNCTION app.request_review(target uuid, request_id uuid, reviewer_ids uuid[], request_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v app."AssetVersion"; p app."Project"; actor uuid:=app.request_user_id(); existing app."ReviewRound";
BEGIN
 SELECT * INTO v FROM app."AssetVersion" WHERE id=target AND status='READY';
 IF v.id IS NULL OR NOT app.can_upload_project(v."projectId",v."workspaceId") OR (app.reviewer_demo_workspace() IS NOT NULL AND v."workspaceId"<>app.reviewer_demo_workspace()) THEN RETURN jsonb_build_object('error','Review request is not permitted.','status',403); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||v."projectId"::text,0));
 SELECT * INTO p FROM app."Project" WHERE id=v."projectId" FOR UPDATE;
 IF p."archivedAt" IS NOT NULL OR p."completionId" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app."Asset" WHERE id=v."assetId" AND "currentVersionId"=target) THEN RETURN jsonb_build_object('error','Open the current version of an active, reopened project.','status',409); END IF;
 IF cardinality(reviewer_ids) NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT x) FROM unnest(reviewer_ids)x)<>cardinality(reviewer_ids) OR length(btrim(request_reason)) NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('error','Choose assigned clients and explain this review request.','status',400); END IF;
 IF EXISTS(SELECT 1 FROM unnest(reviewer_ids) uid WHERE NOT EXISTS(SELECT 1 FROM app."ProjectMember" pm JOIN app."Membership" m ON m."workspaceId"=pm."workspaceId" AND m."userId"=pm."userId" WHERE pm."projectId"=p.id AND pm."userId"=uid AND m.role='CLIENT')) THEN RETURN jsonb_build_object('error','Choose only clients currently assigned to this project.','status',400); END IF;
 SELECT * INTO existing FROM app."ReviewRound" WHERE id=request_id;
 IF existing.id IS NOT NULL THEN
  IF existing."versionId"<>target OR existing."requestedById"<>actor OR existing.reason<>btrim(request_reason) OR (SELECT array_agg("userId" ORDER BY "userId") FROM app."ReviewRoundReviewer" WHERE "roundId"=existing.id)<>(SELECT array_agg(x ORDER BY x) FROM unnest(reviewer_ids)x) THEN RETURN jsonb_build_object('error','This request ID was already used.','status',409); END IF;
  RETURN jsonb_build_object('id',existing.id);
 END IF;
 IF (SELECT count(*) FROM app."ReviewRound" WHERE "projectId"=p.id)>=100 THEN RETURN jsonb_build_object('error','Review round capacity reached. Contact the operator.','status',429); END IF;
 INSERT INTO app."ReviewRound"(id,"workspaceId","projectId","assetId","versionId","requestedById","requestedByName",reason) SELECT request_id,p."workspaceId",p.id,v."assetId",v.id,actor,"displayName",btrim(request_reason) FROM app."UserProfile" WHERE id=actor;
 INSERT INTO app."ReviewRoundReviewer"("roundId","userId","reviewerName") SELECT request_id,u.id,u."displayName" FROM app."UserProfile" u WHERE u.id=ANY(reviewer_ids);
 RETURN jsonb_build_object('id',request_id);
END $$;
CREATE FUNCTION app.complete_project(target uuid, request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p app."Project"; actor uuid:=app.request_user_id(); manifest jsonb; row record; status jsonb; files jsonb:='[]'::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||target::text,0));
 SELECT * INTO p FROM app."Project" WHERE id=target FOR UPDATE;
 IF p.id IS NULL OR NOT app.is_workspace_owner(p."workspaceId") OR app.reviewer_demo_workspace() IS NOT NULL THEN RETURN jsonb_build_object('error','Only the owner of a non-demo project can complete it.','status',403); END IF;
 IF p."completionId" IS NOT NULL THEN RETURN jsonb_build_object('id',p."completionId"); END IF;
 IF p."archivedAt" IS NOT NULL THEN RETURN jsonb_build_object('error','Restore the project before completion.','status',409); END IF;
 FOR row IN SELECT a.id,a.title,v.id version_id,v."versionNumber",v."contentHash",v."fileSize",v."mimeType",v."originalName",v.width,v.height FROM app."Asset" a JOIN app."AssetVersion" v ON v.id=a."currentVersionId" WHERE a."projectId"=p.id AND v.status='READY' ORDER BY a.id LOOP
  status:=app.review_round_status(row.version_id);
  IF status->>'state'<>'APPROVED' THEN RETURN jsonb_build_object('error','Every current design needs all required approvals and resolved feedback.','status',409); END IF;
  files:=files||jsonb_build_array(jsonb_build_object('assetId',row.id,'title',row.title,'versionId',row.version_id,'versionNumber',row."versionNumber",'contentHash',row."contentHash",'fileSize',row."fileSize",'mimeType',row."mimeType",'originalName',row."originalName",'width',row.width,'height',row.height,'review',status));
 END LOOP;
 IF jsonb_array_length(files)=0 THEN RETURN jsonb_build_object('error','Upload and approve at least one design before completion.','status',409); END IF;
 manifest:=jsonb_build_object('formatVersion',1,'projectName',p.name,'files',files);
 INSERT INTO app."ProjectCompletion"(id,"workspaceId","projectId","completedById","completedByName",manifest) SELECT request_id,p."workspaceId",p.id,actor,"displayName",manifest FROM app."UserProfile" WHERE id=actor;
 PERFORM set_config('app.lifecycle_project',p.id::text,true);
 UPDATE app."Project" SET "completionId"=request_id WHERE id=p.id;
 PERFORM set_config('app.lifecycle_project','',true);
 RETURN jsonb_build_object('id',request_id);
END $$;
CREATE FUNCTION app.reopen_project(target uuid, request_id uuid, reopen_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p app."Project"; actor uuid:=app.request_user_id();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||target::text,0));
 SELECT * INTO p FROM app."Project" WHERE id=target FOR UPDATE;
 IF p.id IS NULL OR NOT app.is_workspace_owner(p."workspaceId") OR app.reviewer_demo_workspace() IS NOT NULL THEN RETURN jsonb_build_object('error','Only the project owner can reopen it.','status',403); END IF;
 IF p."archivedAt" IS NOT NULL THEN RETURN jsonb_build_object('error','Restore the archived project first.','status',409); END IF;
 IF length(btrim(reopen_reason)) NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('error','Explain why this project needs reopening.','status',400); END IF;
 IF p."completionId" IS NULL THEN RETURN jsonb_build_object('reopened',true); END IF;
 INSERT INTO app."ProjectReopening"(id,"completionId","projectId","actorId","actorName",reason) SELECT request_id,p."completionId",p.id,actor,"displayName",btrim(reopen_reason) FROM app."UserProfile" WHERE id=actor;
 PERFORM set_config('app.lifecycle_project',p.id::text,true);
 UPDATE app."Project" SET "completionId"=null WHERE id=p.id;
 PERFORM set_config('app.lifecycle_project','',true);
 RETURN jsonb_build_object('reopened',true);
END $$;
-- DB barriers supplement every application writer, including old deployed code.
CREATE FUNCTION app.guard_completed_project() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF TG_TABLE_NAME IN ('ShareLink','ProjectInvitation') AND TG_OP='UPDATE' AND NEW."revokedAt" IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='Project' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'archivedAt')=(to_jsonb(OLD)-'archivedAt') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Reopen this completed project before changing its work.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION app.guard_completed_project() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Project','ProjectMember','Asset','AssetVersion','Comment','ReviewDecision','ProjectInvitation','ShareLink'] LOOP
  EXECUTE format('CREATE TRIGGER completed_project BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_completed_project()',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.review_round_status(uuid),app.request_review(uuid,uuid,uuid[],text),app.complete_project(uuid,uuid),app.reopen_project(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.review_round_status(uuid),app.request_review(uuid,uuid,uuid[],text),app.complete_project(uuid,uuid),app.reopen_project(uuid,uuid,text) TO review_room_user;
ALTER TABLE app."ReviewRound" ADD CONSTRAINT "ReviewRound_projectId_workspaceId_fkey" FOREIGN KEY("projectId","workspaceId") REFERENCES app."Project"(id,"workspaceId") ON DELETE CASCADE;
COMMIT;
