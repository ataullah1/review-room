-- PostgreSQL text values cannot contain a null byte. The application validator
-- rejects it before this function, so avoid constructing chr(0) inside SQL.
CREATE OR REPLACE FUNCTION app.edit_comment(target uuid, new_body text, deleting boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE c app."Comment"; v app."AssetVersion"; a app."Asset"; p app."Project"; actor uuid;
BEGIN
  actor:=app.request_user_id();
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM app."Comment" WHERE id=target FOR UPDATE;
  IF c.id IS NULL OR c."authorId"<>actor OR c."deletedAt" IS NOT NULL THEN RETURN NULL; END IF;
  SELECT * INTO v FROM app."AssetVersion" WHERE id=c."versionId" AND status='READY';
  SELECT * INTO a FROM app."Asset" WHERE id=v."assetId";
  SELECT * INTO p FROM app."Project" WHERE id=v."projectId" AND "workspaceId"=v."workspaceId";
  IF v.id IS NULL OR a.id IS NULL OR p.id IS NULL OR a."currentVersionId"<>v.id
     OR p."archivedAt" IS NOT NULL OR p."completionId" IS NOT NULL
     OR NOT app.can_access_project(p.id,p."workspaceId")
     OR (app.reviewer_demo_workspace() IS NOT NULL AND p."workspaceId"<>app.reviewer_demo_workspace()) THEN
    RETURN NULL;
  END IF;
  IF NOT deleting AND (new_body IS NULL OR length(btrim(new_body)) NOT BETWEEN 1 AND 2000) THEN
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
