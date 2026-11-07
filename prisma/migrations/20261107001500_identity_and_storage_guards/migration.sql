BEGIN;
-- Only verified provider callbacks may record mailbox possession. Browser and
-- request roles cannot manufacture, read or update this evidence.
CREATE TABLE app."EmailVerificationProof" (
  "userId" uuid PRIMARY KEY,
  "emailHash" char(64) NOT NULL,
  "verifiedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "expiresAt" timestamptz(3) NOT NULL
);
ALTER TABLE app."EmailVerificationProof" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."EmailVerificationProof" FROM PUBLIC, review_room_user, review_room_capability;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON app."EmailVerificationProof" FROM anon, authenticated;
 END IF;
END $$;
ALTER FUNCTION app.accept_invitation(text,text,boolean) RENAME TO accept_invitation_confirmed_core;
REVOKE ALL ON FUNCTION app.accept_invitation_confirmed_core(text,text,boolean) FROM PUBLIC, review_room_user;
CREATE FUNCTION app.accept_invitation(token_hash text, verified_email text, email_verified boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF email_verified IS DISTINCT FROM true OR NOT EXISTS (
  SELECT 1 FROM app."EmailVerificationProof" p WHERE p."userId"=app.request_user_id()
  AND p."emailHash"=encode(sha256(convert_to(lower(btrim(verified_email)),'UTF8')),'hex')
  AND p."expiresAt">clock_timestamp()
 ) THEN RETURN jsonb_build_object('error','Verify your email again before accepting this invitation.','status',403); END IF;
 RETURN app.accept_invitation_confirmed_core(token_hash,verified_email,email_verified);
END $$;
REVOKE ALL ON FUNCTION app.accept_invitation(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.accept_invitation(text,text,boolean) TO review_room_user;

-- Check aggregate reservations as the table owner, without exposing hidden
-- projects, pending uploads or metadata to a designer. No per-user RLS undercount.
CREATE FUNCTION app.check_workspace_storage(target uuid, new_bytes bigint, byte_limit bigint, version_limit integer, pending_limit integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE committed bigint; reserved bigint; ready_count bigint; pending_count bigint;
BEGIN
 IF new_bytes<=0 OR byte_limit<=0 OR version_limit<=0 OR pending_limit<=0
 OR NOT EXISTS(SELECT 1 FROM app."Membership" WHERE "workspaceId"=target AND "userId"=app.request_user_id() AND role IN ('OWNER','DESIGNER'))
 OR (app.reviewer_demo_workspace() IS NOT NULL AND app.reviewer_demo_workspace()<>target)
 THEN RAISE EXCEPTION 'Storage reservation is not permitted' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('storage:'||target::text,0));
 SELECT coalesce(sum("fileSize"),0),count(*) INTO committed,ready_count FROM app."AssetVersion" WHERE "workspaceId"=target AND status='READY';
 SELECT coalesce(sum("expectedSize"),0),count(*) INTO reserved,pending_count FROM app."AssetVersion" WHERE "workspaceId"=target AND status='PENDING' AND "expiresAt">now();
 IF committed+reserved+new_bytes>byte_limit THEN RAISE EXCEPTION 'Workspace storage limit reached'; END IF;
 IF ready_count+pending_count+1>version_limit THEN RAISE EXCEPTION 'Workspace version limit reached'; END IF;
 IF pending_count>=pending_limit THEN RAISE EXCEPTION 'Workspace pending upload limit reached'; END IF;
END $$;
REVOKE ALL ON FUNCTION app.check_workspace_storage(uuid,bigint,bigint,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.check_workspace_storage(uuid,bigint,bigint,integer,integer) TO review_room_user;

CREATE TABLE app."RecoveryGrant" (
 "tokenHash" char(64) PRIMARY KEY,
 "userId" uuid NOT NULL,
 "sessionId" text NOT NULL,
 "expiresAt" timestamptz(3) NOT NULL
);
CREATE INDEX "RecoveryGrant_expiresAt_idx" ON app."RecoveryGrant"("expiresAt");
ALTER TABLE app."RecoveryGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."RecoveryGrant" FROM PUBLIC, review_room_user, review_room_capability;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app."RecoveryGrant" FROM anon, authenticated; END IF; END $$;

COMMIT;
