CREATE OR REPLACE FUNCTION app.accept_invitation(token_hash text, verified_email text, email_verified boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i app."ProjectInvitation"; uid uuid; existing_role app."WorkspaceRole"; archived timestamptz;
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
 SELECT role INTO existing_role FROM app."Membership" WHERE "workspaceId"=i."workspaceId" AND "userId"=uid;
 IF existing_role IS NOT NULL AND existing_role<>i.role THEN RETURN jsonb_build_object('error','Your existing workspace role conflicts with this invitation. Ask the owner for help.','status',409); END IF;
 INSERT INTO app."Membership"("workspaceId","userId",role) VALUES(i."workspaceId",uid,i.role) ON CONFLICT DO NOTHING;
 INSERT INTO app."ProjectMember"("projectId","workspaceId","userId") VALUES(i."projectId",i."workspaceId",uid) ON CONFLICT DO NOTHING;
 UPDATE app."ProjectInvitation" SET "acceptedAt"=clock_timestamp(),"acceptedById"=uid WHERE id=i.id;
 RETURN jsonb_build_object('workspaceId',i."workspaceId",'projectId',i."projectId");
END $$;
