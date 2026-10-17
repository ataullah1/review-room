BEGIN;
-- CreateTable
CREATE TABLE "ProjectInvitation" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedById" UUID,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ProjectInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityRateBucket" (
    "keyHash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CapabilityRateBucket_pkey" PRIMARY KEY ("keyHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvitation_tokenHash_key" ON "ProjectInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ProjectInvitation_projectId_createdAt_id_idx" ON "ProjectInvitation"("projectId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareLink_versionId_createdAt_id_idx" ON "ShareLink"("versionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CapabilityRateBucket_expiresAt_idx" ON "CapabilityRateBucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='review_room_capability') THEN CREATE ROLE review_room_capability NOLOGIN NOINHERIT NOBYPASSRLS; END IF;
 EXECUTE format('GRANT review_room_capability TO %I',current_user);
END $$;
GRANT USAGE ON SCHEMA app TO review_room_capability;
ALTER TABLE app."ProjectInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ShareLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."CapabilityRateBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."ProjectInvitation",app."ShareLink",app."CapabilityRateBucket" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app."ProjectInvitation",app."ShareLink",app."CapabilityRateBucket" FROM anon,authenticated; END IF;
END $$;
GRANT SELECT,INSERT ON app."ProjectInvitation",app."ShareLink" TO review_room_user;
GRANT UPDATE("revokedAt") ON app."ProjectInvitation",app."ShareLink" TO review_room_user;
ALTER TABLE app."ProjectInvitation" ADD CONSTRAINT invitation_role CHECK(role IN ('CLIENT','DESIGNER'));
ALTER TABLE app."ProjectInvitation" ADD CONSTRAINT invitation_email CHECK(email=lower(btrim(email)) AND length(email)>3);
ALTER TABLE app."ProjectInvitation" ADD CONSTRAINT invitation_hash CHECK("tokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE app."ShareLink" ADD CONSTRAINT share_hash CHECK("tokenHash" ~ '^[a-f0-9]{64}$');
CREATE POLICY invitation_read ON app."ProjectInvitation" FOR SELECT TO review_room_user USING(app.is_workspace_owner("workspaceId"));
CREATE POLICY invitation_create ON app."ProjectInvitation" FOR INSERT TO review_room_user WITH CHECK(app.is_workspace_owner("workspaceId") AND "acceptedAt" IS NULL AND "acceptedById" IS NULL AND "revokedAt" IS NULL AND "expiresAt">now() AND "expiresAt"<=now()+interval '7 days' AND EXISTS(SELECT 1 FROM app."Project" WHERE id="projectId" AND "workspaceId"="ProjectInvitation"."workspaceId" AND "archivedAt" IS NULL));
CREATE POLICY invitation_revoke ON app."ProjectInvitation" FOR UPDATE TO review_room_user USING(app.is_workspace_owner("workspaceId")) WITH CHECK(app.is_workspace_owner("workspaceId"));
CREATE FUNCTION app.owns_share_version(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM app."AssetVersion" WHERE id=target AND status='READY' AND app.is_workspace_owner("workspaceId"))
$$;
REVOKE ALL ON FUNCTION app.owns_share_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.owns_share_version(uuid) TO review_room_user;
CREATE POLICY share_read ON app."ShareLink" FOR SELECT TO review_room_user USING(app.owns_share_version("versionId"));
CREATE POLICY share_create ON app."ShareLink" FOR INSERT TO review_room_user WITH CHECK(app.owns_share_version("versionId") AND "revokedAt" IS NULL AND "expiresAt">now() AND "expiresAt"<=now()+interval '24 hours');
CREATE POLICY share_revoke ON app."ShareLink" FOR UPDATE TO review_room_user USING(app.owns_share_version("versionId")) WITH CHECK(app.owns_share_version("versionId"));

CREATE FUNCTION app.inspect_invitation(token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i app."ProjectInvitation"; project_name text;
BEGIN
 SELECT * INTO i FROM app."ProjectInvitation" WHERE "tokenHash"=token_hash;
 IF i.id IS NULL OR i."revokedAt" IS NOT NULL THEN RETURN jsonb_build_object('error','This invitation is unavailable.','status',404); END IF;
 IF i."acceptedAt" IS NULL AND i."expiresAt"<=clock_timestamp() THEN RETURN jsonb_build_object('error','This invitation has expired. Ask the owner for a new link.','status',410); END IF;
 SELECT name INTO project_name FROM app."Project" WHERE id=i."projectId";
 RETURN jsonb_build_object('id',i.id,'projectName',project_name,'role',i.role,'expiresAt',i."expiresAt",'accepted',i."acceptedAt" IS NOT NULL);
END $$;
CREATE FUNCTION app.accept_invitation(token_hash text, verified_email text, email_verified boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i app."ProjectInvitation"; uid uuid; current_role app."WorkspaceRole"; archived timestamptz;
BEGIN
 uid:=app.request_user_id();
 IF uid IS NULL OR NOT email_verified OR verified_email IS NULL THEN RETURN jsonb_build_object('error','Sign in with a confirmed email before accepting.','status',403); END IF;
 SELECT * INTO i FROM app."ProjectInvitation" WHERE "tokenHash"=token_hash;
 IF i.id IS NULL THEN RETURN jsonb_build_object('error','This invitation is unavailable.','status',404); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||i."projectId",0));
 SELECT * INTO i FROM app."ProjectInvitation" WHERE id=i.id FOR UPDATE;
 IF i."revokedAt" IS NOT NULL THEN RETURN jsonb_build_object('error','This invitation was revoked.','status',410); END IF;
 IF lower(btrim(verified_email))<>i.email THEN RETURN jsonb_build_object('error','Sign in with the email address this invitation was sent to.','status',403); END IF;
 IF i."acceptedAt" IS NOT NULL THEN
   IF i."acceptedById"<>uid THEN RETURN jsonb_build_object('error','This invitation has already been used.','status',409); END IF;
   RETURN jsonb_build_object('workspaceId',i."workspaceId",'projectId',i."projectId");
 END IF;
 IF i."expiresAt"<=clock_timestamp() THEN RETURN jsonb_build_object('error','This invitation has expired. Ask the owner for a new link.','status',410); END IF;
 SELECT "archivedAt" INTO archived FROM app."Project" WHERE id=i."projectId";
 IF archived IS NOT NULL THEN RETURN jsonb_build_object('error','This project is archived. Ask the owner to restore it.','status',409); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('membership:'||i."workspaceId"||':'||uid,0));
 SELECT role INTO current_role FROM app."Membership" WHERE "workspaceId"=i."workspaceId" AND "userId"=uid;
 IF current_role IS NOT NULL AND current_role<>i.role THEN RETURN jsonb_build_object('error','Your existing workspace role conflicts with this invitation. Ask the owner for help.','status',409); END IF;
 INSERT INTO app."Membership"("workspaceId","userId",role) VALUES(i."workspaceId",uid,i.role) ON CONFLICT DO NOTHING;
 INSERT INTO app."ProjectMember"("projectId","workspaceId","userId") VALUES(i."projectId",i."workspaceId",uid) ON CONFLICT DO NOTHING;
 UPDATE app."ProjectInvitation" SET "acceptedAt"=clock_timestamp(),"acceptedById"=uid WHERE id=i.id;
 RETURN jsonb_build_object('workspaceId',i."workspaceId",'projectId',i."projectId");
END $$;
REVOKE ALL ON FUNCTION app.inspect_invitation(text),app.accept_invitation(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.inspect_invitation(text) TO review_room_capability;
GRANT EXECUTE ON FUNCTION app.accept_invitation(text,text,boolean) TO review_room_user;

CREATE FUNCTION app.read_share(target uuid,token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s app."ShareLink"; result jsonb;
BEGIN
 SELECT * INTO s FROM app."ShareLink" WHERE id=target AND "tokenHash"=token_hash FOR SHARE;
 IF s.id IS NULL OR s."revokedAt" IS NOT NULL OR s."expiresAt"<=clock_timestamp() THEN RETURN jsonb_build_object('error','This share link is expired, revoked or unavailable.','status',404); END IF;
 SELECT jsonb_build_object('id',s.id,'title',a.title,'versionId',v.id,'versionNumber',v."versionNumber",'width',v.width,'height',v.height,'objectKey',v."objectKey",'expiresAt',s."expiresAt") INTO result FROM app."AssetVersion" v JOIN app."Asset" a ON a.id=v."assetId" WHERE v.id=s."versionId" AND v.status='READY';
 RETURN coalesce(result,jsonb_build_object('error','This image is unavailable.','status',404));
END $$;
CREATE FUNCTION app.shared_comment(c app."Comment") RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id,'versionId',c."versionId",'authorId','','authorName',c."authorName",'parentId',c."parentId",'body',c.body,'xRatio',c."xRatio",'yRatio',c."yRatio",'threadNumber',c."threadNumber",'resolvedAt',c."resolvedAt",'createdAt',c."createdAt")
$$;
CREATE FUNCTION app.read_shared_comments(target uuid,token_hash text,after_number integer DEFAULT 0,root_id uuid DEFAULT NULL,after_reply uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE access jsonb; vid uuid; rows jsonb; more boolean; last_number integer; last_reply uuid; cursor_time timestamptz;
BEGIN
 access:=app.read_share(target,token_hash);
 IF access ? 'error' THEN RETURN access; END IF;
 vid:=(access->>'versionId')::uuid;
 IF root_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM app."Comment" WHERE id=root_id AND "versionId"=vid AND "parentId" IS NULL) THEN RETURN jsonb_build_object('error','Thread not found.','status',404); END IF;
   IF after_reply IS NOT NULL THEN
     SELECT "createdAt" INTO cursor_time FROM app."Comment" WHERE id=after_reply AND "versionId"=vid AND "parentId"=root_id;
     IF cursor_time IS NULL THEN RETURN jsonb_build_object('error','Reply not found.','status',404); END IF;
   END IF;
   SELECT coalesce(jsonb_agg(app.shared_comment(c) ORDER BY c."createdAt",c.id),'[]'::jsonb) INTO rows FROM (SELECT * FROM app."Comment" WHERE "versionId"=vid AND "parentId"=root_id AND (after_reply IS NULL OR ("createdAt",id)>(cursor_time,after_reply)) ORDER BY "createdAt",id LIMIT 21)c;
   more:=jsonb_array_length(rows)>20;
   IF more THEN last_reply:=(rows->19->>'id')::uuid; rows:=rows-20; END IF;
   RETURN jsonb_build_object('replies',rows,'next',last_reply);
 END IF;
 SELECT coalesce(jsonb_agg(app.shared_comment(c)||jsonb_build_object(
   'replies',(SELECT coalesce(jsonb_agg(app.shared_comment(r) ORDER BY r."createdAt",r.id),'[]'::jsonb) FROM(SELECT * FROM app."Comment" WHERE "parentId"=c.id AND "versionId"=vid ORDER BY "createdAt",id LIMIT 5)r),
   'replyTotal',(SELECT count(*) FROM app."Comment" WHERE "parentId"=c.id AND "versionId"=vid),
   'replyCursor',(SELECT r.id FROM (SELECT id,"createdAt" FROM app."Comment" WHERE "parentId"=c.id AND "versionId"=vid ORDER BY "createdAt",id LIMIT 5)r ORDER BY r."createdAt" DESC,r.id DESC LIMIT 1),
   'moreReplies',(SELECT count(*)>5 FROM app."Comment" WHERE "parentId"=c.id AND "versionId"=vid)) ORDER BY c."threadNumber"),'[]'::jsonb) INTO rows
 FROM(SELECT * FROM app."Comment" WHERE "versionId"=vid AND "parentId" IS NULL AND "threadNumber">after_number ORDER BY "threadNumber" LIMIT 21)c;
 more:=jsonb_array_length(rows)>20;
 IF more THEN last_number:=(rows->19->>'threadNumber')::integer;rows:=rows-20; END IF;
 RETURN jsonb_build_object('threads',rows,'total',(SELECT count(*) FROM app."Comment" WHERE "versionId"=vid AND "parentId" IS NULL),'next',last_number);
END $$;
REVOKE ALL ON FUNCTION app.read_share(uuid,text),app.shared_comment(app."Comment"),app.read_shared_comments(uuid,text,integer,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.read_share(uuid,text),app.read_shared_comments(uuid,text,integer,uuid,uuid) TO review_room_capability;

CREATE FUNCTION app.exchange_share(token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; access jsonb;
BEGIN
 SELECT id INTO target FROM app."ShareLink" WHERE "tokenHash"=token_hash;
 access:=app.read_share(target,token_hash);
 IF access ? 'error' THEN RETURN access; END IF;
 RETURN jsonb_build_object('id',target,'expiresAt',access->>'expiresAt');
END $$;
REVOKE ALL ON FUNCTION app.exchange_share(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.exchange_share(text) TO review_room_capability;

COMMIT;
