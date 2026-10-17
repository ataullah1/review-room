-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorName" VARCHAR(100) NOT NULL DEFAULT '',
    "parentId" UUID,
    "body" VARCHAR(2000) NOT NULL,
    "xRatio" DOUBLE PRECISION,
    "yRatio" DOUBLE PRECISION,
    "threadNumber" INTEGER,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_versionId_parentId_createdAt_id_idx" ON "Comment"("versionId", "parentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_id_versionId_key" ON "Comment"("id", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_versionId_threadNumber_key" ON "Comment"("versionId", "threadNumber");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_versionId_fkey" FOREIGN KEY ("parentId", "versionId") REFERENCES "Comment"("id", "versionId") ON DELETE CASCADE ON UPDATE NO ACTION;


ALTER TABLE app."Comment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."Comment" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app."Comment" FROM anon, authenticated; END IF;
END $$;
GRANT SELECT, INSERT ON app."Comment" TO review_room_user;
GRANT UPDATE ("resolvedAt") ON app."Comment" TO review_room_user;

CREATE FUNCTION app.can_read_comment_version(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM app."AssetVersion" v WHERE v.id=target AND v.status='READY' AND app.can_access_project(v."projectId",v."workspaceId"))
$$;
CREATE FUNCTION app.can_write_comment_version(target uuid, resolving boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM app."AssetVersion" v JOIN app."Project" p ON p.id=v."projectId" AND p."workspaceId"=v."workspaceId"
 JOIN app."Membership" m ON m."workspaceId"=p."workspaceId"
 WHERE v.id=target AND v.status='READY' AND p."archivedAt" IS NULL AND m."userId"=app.request_user_id()
 AND app.can_access_project(p.id,p."workspaceId") AND (NOT resolving OR m.role IN ('OWNER','DESIGNER')))
$$;
REVOKE ALL ON FUNCTION app.can_read_comment_version(uuid),app.can_write_comment_version(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_read_comment_version(uuid),app.can_write_comment_version(uuid,boolean) TO review_room_user;
CREATE POLICY comment_read ON app."Comment" FOR SELECT TO review_room_user USING (app.can_read_comment_version("versionId"));
CREATE POLICY comment_create ON app."Comment" FOR INSERT TO review_room_user WITH CHECK ("authorId"=app.request_user_id() AND "resolvedAt" IS NULL AND app.can_write_comment_version("versionId"));
CREATE POLICY comment_resolve ON app."Comment" FOR UPDATE TO review_room_user USING ("parentId" IS NULL AND app.can_write_comment_version("versionId",true)) WITH CHECK ("parentId" IS NULL AND app.can_write_comment_version("versionId",true));
ALTER TABLE app."Comment" ADD CONSTRAINT comment_shape CHECK (
 ("parentId" IS NULL AND "xRatio" IS NOT NULL AND "yRatio" IS NOT NULL AND "xRatio" BETWEEN 0 AND 1 AND "yRatio" BETWEEN 0 AND 1 AND "threadNumber" > 0 AND "threadNumber" IS NOT NULL)
 OR ("parentId" IS NOT NULL AND "xRatio" IS NULL AND "yRatio" IS NULL AND "threadNumber" IS NULL AND "resolvedAt" IS NULL));
ALTER TABLE app."Comment" ADD CONSTRAINT comment_body CHECK (length(btrim(body)) BETWEEN 1 AND 2000);
CREATE FUNCTION app.guard_comment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-'resolvedAt') IS DISTINCT FROM (to_jsonb(OLD)-'resolvedAt') THEN RAISE EXCEPTION 'Comments and replies are immutable'; END IF;
 ELSE
   SELECT "displayName" INTO NEW."authorName" FROM app."UserProfile" WHERE id=NEW."authorId";
   IF NEW."parentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app."Comment" c WHERE c.id=NEW."parentId" AND c."versionId"=NEW."versionId" AND c."parentId" IS NULL) THEN
     RAISE EXCEPTION 'Replies must belong to a root thread of the same version';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_comment BEFORE INSERT OR UPDATE ON app."Comment" FOR EACH ROW EXECUTE FUNCTION app.guard_comment();
REVOKE ALL ON FUNCTION app.guard_comment() FROM PUBLIC;
