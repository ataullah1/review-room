BEGIN;

ALTER TABLE app."Comment"
  ADD COLUMN "editedAt" timestamptz(3),
  ADD COLUMN "deletedAt" timestamptz(3);

CREATE TABLE app."CommentRevision" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "commentId" uuid NOT NULL REFERENCES app."Comment"(id) ON DELETE CASCADE,
  "editorId" uuid NOT NULL REFERENCES app."UserProfile"(id) ON DELETE RESTRICT,
  "previousBody" varchar(2000) NOT NULL,
  action varchar(10) NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT comment_revision_action CHECK (action IN ('EDIT','DELETE'))
);
CREATE INDEX "CommentRevision_commentId_createdAt_id_idx"
  ON app."CommentRevision"("commentId","createdAt",id);

ALTER TABLE app."CommentRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."CommentRevision" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON app."CommentRevision" FROM anon, authenticated;
  END IF;
END $$;

-- All validation and history creation remain inside one database transaction.
-- The request role receives execute only, so it cannot bypass the audit row by
-- updating Comment.body directly.
CREATE FUNCTION app.edit_comment(target uuid, new_body text, deleting boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE c app."Comment"; v app."AssetVersion"; a app."Asset"; p app."Project"; actor uuid;
BEGIN
  actor:=app.request_user_id();
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM app."Comment" WHERE id=target FOR UPDATE;
  IF c.id IS NULL OR c."authorId"<>actor OR c."deletedAt" IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v FROM app."AssetVersion" WHERE id=c."versionId" AND status='READY';
  SELECT * INTO a FROM app."Asset" WHERE id=v."assetId";
  SELECT * INTO p FROM app."Project" WHERE id=v."projectId" AND "workspaceId"=v."workspaceId";
  IF v.id IS NULL OR a.id IS NULL OR p.id IS NULL OR a."currentVersionId"<>v.id
     OR p."archivedAt" IS NOT NULL OR p."completionId" IS NOT NULL
     OR NOT app.can_access_project(p.id,p."workspaceId")
     OR (app.reviewer_demo_workspace() IS NOT NULL AND p."workspaceId"<>app.reviewer_demo_workspace()) THEN
    RETURN NULL;
  END IF;
  IF NOT deleting AND (new_body IS NULL OR length(btrim(new_body)) NOT BETWEEN 1 AND 2000 OR position(chr(0) in new_body)>0) THEN
    RAISE EXCEPTION 'Invalid comment body' USING ERRCODE='22023';
  END IF;
  IF NOT deleting AND btrim(new_body)=c.body THEN RETURN c.id; END IF;

  INSERT INTO app."CommentRevision"("commentId","editorId","previousBody",action)
  VALUES(c.id,actor,c.body,CASE WHEN deleting THEN 'DELETE' ELSE 'EDIT' END);

  IF deleting THEN
    UPDATE app."Comment" SET body='Comment deleted.',"editedAt"=now(),"deletedAt"=now(),
      "resolvedAt"=CASE WHEN "parentId" IS NULL THEN coalesce("resolvedAt",now()) ELSE "resolvedAt" END
    WHERE id=c.id;
  ELSE
    UPDATE app."Comment" SET body=btrim(new_body),"editedAt"=now() WHERE id=c.id;
  END IF;
  RETURN c.id;
END $$;
REVOKE ALL ON FUNCTION app.edit_comment(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.edit_comment(uuid,text,boolean) TO review_room_user;

CREATE OR REPLACE FUNCTION app.guard_comment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-'resolvedAt'-'body'-'editedAt'-'deletedAt') IS DISTINCT FROM
      (to_jsonb(OLD)-'resolvedAt'-'body'-'editedAt'-'deletedAt') THEN
     RAISE EXCEPTION 'Comment identity and position are immutable';
   END IF;
   IF current_user='review_room_user' AND
      (NEW.body IS DISTINCT FROM OLD.body OR NEW."editedAt" IS DISTINCT FROM OLD."editedAt" OR NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt") THEN
     RAISE EXCEPTION 'Use the audited comment edit operation';
   END IF;
   IF OLD."deletedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
     RAISE EXCEPTION 'Deleted comments are immutable';
   END IF;
 ELSE
   SELECT "displayName" INTO NEW."authorName" FROM app."UserProfile" WHERE id=NEW."authorId";
   IF NEW."parentId" IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM app."Comment" c WHERE c.id=NEW."parentId" AND c."versionId"=NEW."versionId"
       AND c."parentId" IS NULL AND c."deletedAt" IS NULL
   ) THEN RAISE EXCEPTION 'Replies must belong to an active root thread of the same version'; END IF;
 END IF;
 RETURN NEW;
END $$;

COMMIT;
