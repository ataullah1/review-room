BEGIN;
CREATE TABLE app."AssetRemoval" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "assetId" uuid NOT NULL REFERENCES app."Asset"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" uuid NOT NULL, "actorName" varchar(100) NOT NULL, reason varchar(500) NOT NULL,
 "removedAt" timestamptz(3) NOT NULL DEFAULT now(), "restoreUntil" timestamptz(3) NOT NULL,
 "restoredAt" timestamptz(3), "restoredById" uuid,
 CHECK(length(btrim(reason)) BETWEEN 1 AND 500), CHECK("restoreUntil">"removedAt")
);
CREATE INDEX "AssetRemoval_assetId_removedAt_idx" ON app."AssetRemoval"("assetId","removedAt");
CREATE UNIQUE INDEX active_asset_removal ON app."AssetRemoval"("assetId") WHERE "restoredAt" IS NULL;
ALTER TABLE app."AssetRemoval" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."AssetRemoval" FROM PUBLIC,review_room_user,review_room_capability;
CREATE FUNCTION app.asset_available(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM app."AssetRemoval" WHERE "assetId"=target AND "restoredAt" IS NULL)
$$;
CREATE FUNCTION app.retained_delivery_version(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM app."ProjectCompletion" c JOIN app."AssetVersion" v ON v."projectId"=c."projectId" AND v."workspaceId"=c."workspaceId" WHERE v.id=target AND app.can_access_project(c."projectId",c."workspaceId") AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.manifest->'files') f WHERE f->>'versionId'=target::text))
$$;
REVOKE ALL ON FUNCTION app.asset_available(uuid),app.retained_delivery_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.asset_available(uuid),app.retained_delivery_version(uuid) TO review_room_user;
CREATE POLICY asset_not_removed ON app."Asset" AS RESTRICTIVE FOR ALL TO review_room_user USING(app.asset_available(id)) WITH CHECK(app.asset_available(id));
CREATE POLICY removed_version_read ON app."AssetVersion" AS RESTRICTIVE FOR SELECT TO review_room_user USING(app.asset_available("assetId") OR app.retained_delivery_version(id));
CREATE POLICY removed_version_create ON app."AssetVersion" AS RESTRICTIVE FOR INSERT TO review_room_user WITH CHECK(app.asset_available("assetId"));
CREATE POLICY removed_version_update ON app."AssetVersion" AS RESTRICTIVE FOR UPDATE TO review_room_user USING(app.asset_available("assetId")) WITH CHECK(app.asset_available("assetId"));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Comment','ReviewDecision','ShareLink'] LOOP
 EXECUTE format('CREATE POLICY removed_version_scope ON app.%I AS RESTRICTIVE FOR ALL TO review_room_user USING(EXISTS(SELECT 1 FROM app."AssetVersion" v WHERE v.id="versionId" AND app.asset_available(v."assetId"))) WITH CHECK(EXISTS(SELECT 1 FROM app."AssetVersion" v WHERE v.id="versionId" AND app.asset_available(v."assetId")))',t);
 END LOOP;
END $$;
CREATE POLICY removed_feedback_scope ON app."FeedbackAddress" AS RESTRICTIVE FOR ALL TO review_room_user USING(EXISTS(SELECT 1 FROM app."AssetVersion" v WHERE v.id="targetVersionId" AND app.asset_available(v."assetId"))) WITH CHECK(EXISTS(SELECT 1 FROM app."AssetVersion" v WHERE v.id="targetVersionId" AND app.asset_available(v."assetId")));
CREATE FUNCTION app.asset_removal_impact(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a app."Asset"; retained integer; versions integer; bytes bigint; pins integer; active_links integer;
BEGIN
 SELECT * INTO a FROM app."Asset" WHERE id=target;
 IF a.id IS NULL OR NOT app.is_workspace_owner(a."workspaceId") OR app.reviewer_demo_workspace() IS NOT NULL THEN RETURN jsonb_build_object('error','Only the project owner can manage design removal.','status',403); END IF;
 SELECT count(*),coalesce(sum("fileSize"),0) INTO versions,bytes FROM app."AssetVersion" WHERE "assetId"=target AND status='READY';
 SELECT count(*) INTO pins FROM app."Comment" c JOIN app."AssetVersion" v ON v.id=c."versionId" WHERE v."assetId"=target;
 SELECT count(*) INTO active_links FROM app."ShareLink" s JOIN app."AssetVersion" v ON v.id=s."versionId" WHERE v."assetId"=target AND s."revokedAt" IS NULL AND s."expiresAt">now();
 SELECT count(*) INTO retained FROM app."ProjectCompletion" c WHERE c."projectId"=a."projectId" AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.manifest->'files') f WHERE f->>'assetId'=target::text);
 RETURN jsonb_build_object('title',a.title,'versions',versions,'bytes',bytes,'comments',pins,'links',active_links,'retainedDeliveries',retained);
END $$;
CREATE FUNCTION app.change_asset_removal(target uuid, restoring boolean, removal_reason text, expected_project uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a app."Asset"; p app."Project"; r app."AssetRemoval";
BEGIN
 SELECT * INTO a FROM app."Asset" WHERE id=target;
 IF a.id IS NULL OR a."projectId"<>expected_project OR NOT app.is_workspace_owner(a."workspaceId") OR app.reviewer_demo_workspace() IS NOT NULL THEN RETURN jsonb_build_object('error','Only the project owner can manage design removal.','status',403); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||a."projectId"::text,0));
 SELECT * INTO p FROM app."Project" WHERE id=a."projectId" FOR UPDATE;
 IF p."completionId" IS NOT NULL OR p."archivedAt" IS NOT NULL THEN RETURN jsonb_build_object('error','Reopen and restore the project before changing its designs.','status',409); END IF;
 SELECT * INTO r FROM app."AssetRemoval" WHERE "assetId"=target AND "restoredAt" IS NULL;
 IF restoring THEN
  IF r.id IS NULL THEN RETURN jsonb_build_object('restored',true); END IF;
  IF r."restoreUntil"<=now() THEN RETURN jsonb_build_object('error','The 30-day self-service restore window has ended. Contact the operator; original bytes have not been purged.','status',410); END IF;
  UPDATE app."AssetRemoval" SET "restoredAt"=now(),"restoredById"=app.request_user_id() WHERE id=r.id;
  RETURN jsonb_build_object('restored',true);
 END IF;
 IF r.id IS NOT NULL THEN RETURN jsonb_build_object('removed',true); END IF;
 IF length(btrim(removal_reason)) NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('error','Explain why this design is being removed (1–500 characters).','status',400); END IF;
 IF EXISTS(SELECT 1 FROM app."AssetVersion" WHERE "assetId"=target AND status='PENDING') THEN RETURN jsonb_build_object('error','Finish or cancel pending uploads before removing this design.','status',409); END IF;
 UPDATE app."ShareLink" SET "revokedAt"=coalesce("revokedAt",now()) WHERE "versionId" IN (SELECT id FROM app."AssetVersion" WHERE "assetId"=target) AND "revokedAt" IS NULL;
 INSERT INTO app."AssetRemoval"("assetId","actorId","actorName",reason,"restoreUntil") SELECT target,app.request_user_id(),"displayName",btrim(removal_reason),now()+interval '30 days' FROM app."UserProfile" WHERE id=app.request_user_id();
 RETURN jsonb_build_object('removed',true);
END $$;
CREATE FUNCTION app.removed_project_assets(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p app."Project";
BEGIN
 SELECT * INTO p FROM app."Project" WHERE id=target;
 IF p.id IS NULL OR NOT app.is_workspace_owner(p."workspaceId") OR app.reviewer_demo_workspace() IS NOT NULL THEN RETURN jsonb_build_object('error','Removed designs are not available.','status',403); END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT r.id,a.id AS "assetId",a.title,r.reason,r."actorName",r."removedAt",r."restoreUntil" FROM app."AssetRemoval" r JOIN app."Asset" a ON a.id=r."assetId" WHERE a."projectId"=target AND r."restoredAt" IS NULL ORDER BY r."removedAt" DESC LIMIT 100)q);
END $$;
REVOKE ALL ON FUNCTION app.asset_removal_impact(uuid),app.change_asset_removal(uuid,boolean,text,uuid),app.removed_project_assets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.asset_removal_impact(uuid),app.change_asset_removal(uuid,boolean,text,uuid),app.removed_project_assets(uuid) TO review_room_user;
-- Complete only visible work; retain earlier delivery manifests byte-for-byte.
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('app.complete_project(uuid,uuid)'::regprocedure);
 body:=replace(body,'WHERE a."projectId"=p.id AND v.status=''READY''','WHERE a."projectId"=p.id AND app.asset_available(a.id) AND v.status=''READY''');
 EXECUTE body;
END $$;
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('app.request_review(uuid,uuid,uuid[],text)'::regprocedure);
 body:=replace(body,'WHERE id=v."assetId" AND "currentVersionId"=target','WHERE id=v."assetId" AND app.asset_available(id) AND "currentVersionId"=target');
 EXECUTE body;
END $$;
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('app.review_round_status(uuid)'::regprocedure);
 body:=replace(body,'IF v.id IS NULL OR NOT app.can_access_project','IF v.id IS NULL OR NOT app.asset_available(v."assetId") OR NOT app.can_access_project');
 EXECUTE body;
END $$;
COMMIT;
