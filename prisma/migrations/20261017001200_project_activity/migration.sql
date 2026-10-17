BEGIN;
-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('UPLOAD_READY', 'COMMENT_CREATED', 'REPLY_CREATED', 'THREAD_RESOLVED', 'THREAD_REOPENED', 'REVIEW_APPROVED', 'CHANGES_REQUESTED', 'INVITE_ACCEPTED');

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" BIGSERIAL NOT NULL,
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "actorId" UUID,
    "actorName" VARCHAR(100) NOT NULL,
    "assetId" UUID,
    "versionId" UUID,
    "versionNumber" INTEGER,
    "threadNumber" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectActivityRead" (
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadEventId" BIGINT NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectActivityRead_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_sourceKey_key" ON "ActivityEvent"("sourceKey");

-- CreateIndex
CREATE INDEX "ActivityEvent_projectId_workspaceId_id_idx" ON "ActivityEvent"("projectId", "workspaceId", "id");

-- CreateIndex
CREATE INDEX "ProjectActivityRead_workspaceId_userId_idx" ON "ProjectActivityRead"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityRead" ADD CONSTRAINT "ProjectActivityRead_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityRead" ADD CONSTRAINT "ProjectActivityRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE app."ActivityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ProjectActivityRead" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."ActivityEvent",app."ProjectActivityRead" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app."ActivityEvent",app."ProjectActivityRead" FROM anon,authenticated; END IF;
END $$;
GRANT SELECT ON app."ActivityEvent" TO review_room_user;
GRANT SELECT,INSERT ON app."ProjectActivityRead" TO review_room_user;
GRANT UPDATE("lastReadAt","lastReadEventId") ON app."ProjectActivityRead" TO review_room_user;
CREATE POLICY activity_read ON app."ActivityEvent" FOR SELECT TO review_room_user USING(app.can_access_project("projectId","workspaceId"));
CREATE POLICY activity_state_read ON app."ProjectActivityRead" FOR SELECT TO review_room_user USING("userId"=app.request_user_id() AND app.can_access_project("projectId","workspaceId"));
CREATE POLICY activity_state_create ON app."ProjectActivityRead" FOR INSERT TO review_room_user WITH CHECK("userId"=app.request_user_id() AND app.can_access_project("projectId","workspaceId"));
CREATE POLICY activity_state_update ON app."ProjectActivityRead" FOR UPDATE TO review_room_user USING("userId"=app.request_user_id() AND app.can_access_project("projectId","workspaceId")) WITH CHECK("userId"=app.request_user_id() AND app.can_access_project("projectId","workspaceId"));

-- Project serialization makes event IDs a reliable committed high-water mark.
-- No request role can manufacture or edit audit events.
CREATE FUNCTION app.record_project_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_project uuid; tenant uuid; actor uuid; actor_name text; asset uuid; version uuid; version_number integer; thread_number integer; event_kind app."ActivityKind"; source text;
BEGIN
 IF TG_TABLE_NAME='AssetVersion' THEN
   IF NEW.status<>'READY' OR OLD.status='READY' THEN RETURN NEW; END IF;
   target_project:=NEW."projectId";tenant:=NEW."workspaceId";actor:=NEW."creatorId";asset:=NEW."assetId";version:=NEW.id;version_number:=NEW."versionNumber";event_kind:='UPLOAD_READY';source:='upload:'||NEW.id;
 ELSIF TG_TABLE_NAME='Comment' THEN
   IF TG_OP='UPDATE' AND (OLD."resolvedAt" IS NULL)=(NEW."resolvedAt" IS NULL) THEN RETURN NEW; END IF;
   SELECT v."projectId",v."workspaceId",v."assetId",v.id,v."versionNumber" INTO target_project,tenant,asset,version,version_number FROM app."AssetVersion" v WHERE v.id=NEW."versionId";
   IF TG_OP='INSERT' THEN
     actor:=NEW."authorId";event_kind:=CASE WHEN NEW."parentId" IS NULL THEN 'COMMENT_CREATED'::app."ActivityKind" ELSE 'REPLY_CREATED'::app."ActivityKind" END;source:='comment:'||NEW.id;
   ELSE actor:=app.request_user_id();event_kind:=CASE WHEN NEW."resolvedAt" IS NULL THEN 'THREAD_REOPENED'::app."ActivityKind" ELSE 'THREAD_RESOLVED'::app."ActivityKind" END;source:='thread:'||NEW.id||':'||gen_random_uuid(); END IF;
   IF NEW."parentId" IS NULL THEN thread_number:=NEW."threadNumber"; ELSE SELECT "threadNumber" INTO thread_number FROM app."Comment" WHERE id=NEW."parentId"; END IF;
 ELSIF TG_TABLE_NAME='ReviewDecision' THEN
   SELECT v."projectId",v."workspaceId",v."assetId",v.id,v."versionNumber" INTO target_project,tenant,asset,version,version_number FROM app."AssetVersion" v WHERE v.id=NEW."versionId";
   actor:=NEW."reviewerId";event_kind:=CASE WHEN NEW.decision='APPROVED' THEN 'REVIEW_APPROVED'::app."ActivityKind" ELSE 'CHANGES_REQUESTED'::app."ActivityKind" END;source:='decision:'||NEW.id;
 ELSIF TG_TABLE_NAME='ProjectInvitation' THEN
   IF OLD."acceptedAt" IS NOT NULL OR NEW."acceptedAt" IS NULL THEN RETURN NEW; END IF;
   target_project:=NEW."projectId";tenant:=NEW."workspaceId";actor:=NEW."acceptedById";event_kind:='INVITE_ACCEPTED';source:='invite:'||NEW.id;
 END IF;
 IF target_project IS NULL THEN RAISE EXCEPTION 'Activity requires a project'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||target_project,0));
 SELECT "displayName" INTO actor_name FROM app."UserProfile" WHERE id=actor;
 INSERT INTO app."ActivityEvent"("projectId","workspaceId","sourceKey",kind,"actorId","actorName","assetId","versionId","versionNumber","threadNumber","createdAt")
 VALUES(target_project,tenant,source,event_kind,actor,coalesce(actor_name,'Team member'),asset,version,version_number,thread_number,clock_timestamp()) ON CONFLICT("sourceKey") DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER activity_upload AFTER UPDATE OF status ON app."AssetVersion" FOR EACH ROW EXECUTE FUNCTION app.record_project_activity();
CREATE TRIGGER activity_comment AFTER INSERT OR UPDATE OF "resolvedAt" ON app."Comment" FOR EACH ROW EXECUTE FUNCTION app.record_project_activity();
CREATE TRIGGER activity_decision AFTER INSERT ON app."ReviewDecision" FOR EACH ROW EXECUTE FUNCTION app.record_project_activity();
CREATE TRIGGER activity_invitation AFTER UPDATE OF "acceptedAt" ON app."ProjectInvitation" FOR EACH ROW EXECUTE FUNCTION app.record_project_activity();
REVOKE ALL ON FUNCTION app.record_project_activity() FROM PUBLIC;

CREATE FUNCTION app.guard_activity_read() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||NEW."projectId",0));
 IF NEW."lastReadEventId"<0 OR (NEW."lastReadEventId">0 AND NOT EXISTS(SELECT 1 FROM app."ActivityEvent" WHERE id=NEW."lastReadEventId" AND "projectId"=NEW."projectId" AND "workspaceId"=NEW."workspaceId")) THEN RAISE EXCEPTION 'Read marker must belong to this project'; END IF;
 IF TG_OP='UPDATE' AND NEW."lastReadEventId"<OLD."lastReadEventId" THEN RAISE EXCEPTION 'Read marker cannot move backwards'; END IF;
 NEW."lastReadAt":=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER guard_activity_read BEFORE INSERT OR UPDATE ON app."ProjectActivityRead" FOR EACH ROW EXECUTE FUNCTION app.guard_activity_read();
REVOKE ALL ON FUNCTION app.guard_activity_read() FROM PUBLIC;

COMMIT;
