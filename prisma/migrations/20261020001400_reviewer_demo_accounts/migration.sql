BEGIN;
CREATE TABLE app."ReviewerDemoAccount" (
  "userId" uuid PRIMARY KEY REFERENCES app."UserProfile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId" uuid NOT NULL REFERENCES app."Workspace"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "legacyWorkspaceId" uuid,
  "allowAuthChanges" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX "ReviewerDemoAccount_workspaceId_idx" ON app."ReviewerDemoAccount"("workspaceId");
CREATE TABLE app."ReviewerDemoQuota" (
  "userId" uuid PRIMARY KEY,
  day timestamptz(3) NOT NULL,
  mutations integer NOT NULL DEFAULT 0,
  uploads integer NOT NULL DEFAULT 0
);
ALTER TABLE app."ReviewerDemoAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ReviewerDemoQuota" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."ReviewerDemoAccount", app."ReviewerDemoQuota" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON app."ReviewerDemoAccount", app."ReviewerDemoQuota" FROM anon, authenticated;
  END IF;
END $$;
GRANT SELECT ("userId", "workspaceId", "legacyWorkspaceId") ON app."ReviewerDemoAccount" TO review_room_user;
CREATE POLICY reviewer_account_read ON app."ReviewerDemoAccount" FOR SELECT TO review_room_user USING ("userId"=app.request_user_id());

CREATE FUNCTION app.reviewer_demo_workspace() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT "workspaceId" FROM app."ReviewerDemoAccount" WHERE "userId"=app.request_user_id()
$$;
REVOKE ALL ON FUNCTION app.reviewer_demo_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reviewer_demo_workspace() TO review_room_user;

-- Restrictive policies supplement, rather than replace, the existing role and
-- project-membership policies. Even an accidentally added membership cannot
-- expose a different tenant to an intentionally public account.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['Project','ProjectMember','Asset','AssetVersion','ProjectInvitation','ActivityEvent','ProjectActivityRead'] LOOP
    EXECUTE format('CREATE POLICY reviewer_tenant_scope ON app.%I AS RESTRICTIVE FOR ALL TO review_room_user USING (app.reviewer_demo_workspace() IS NULL OR "workspaceId"=app.reviewer_demo_workspace()) WITH CHECK (app.reviewer_demo_workspace() IS NULL OR "workspaceId"=app.reviewer_demo_workspace())',t);
  END LOOP;
END $$;
CREATE POLICY reviewer_workspace_scope ON app."Workspace" AS RESTRICTIVE FOR ALL TO review_room_user
USING (app.reviewer_demo_workspace() IS NULL OR id=app.reviewer_demo_workspace() OR EXISTS(SELECT 1 FROM app."ReviewerDemoAccount" d WHERE d."userId"=app.request_user_id() AND d."legacyWorkspaceId"=id))
WITH CHECK (app.reviewer_demo_workspace() IS NULL OR id=app.reviewer_demo_workspace());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['Comment','ReviewDecision','ShareLink'] LOOP
    EXECUTE format('CREATE POLICY reviewer_version_scope ON app.%I AS RESTRICTIVE FOR ALL TO review_room_user USING (app.reviewer_demo_workspace() IS NULL OR EXISTS(SELECT 1 FROM app."AssetVersion" v WHERE v.id="versionId" AND v."workspaceId"=app.reviewer_demo_workspace())) WITH CHECK (app.reviewer_demo_workspace() IS NULL OR EXISTS(SELECT 1 FROM app."AssetVersion" v WHERE v.id="versionId" AND v."workspaceId"=app.reviewer_demo_workspace()))',t);
  END LOOP;
END $$;
CREATE POLICY reviewer_profile_scope ON app."UserProfile" AS RESTRICTIVE FOR SELECT TO review_room_user
USING (app.reviewer_demo_workspace() IS NULL OR id=app.request_user_id() OR EXISTS(SELECT 1 FROM app."Membership" m WHERE m."userId"=id AND m."workspaceId"=app.reviewer_demo_workspace()));

-- Preserve the empty personal-workspace lookup used by already deployed login
-- code until the new shared-workspace bootstrap is deployed. This exception
-- grants no project/data access and cannot create or edit legacy memberships.
CREATE POLICY reviewer_membership_scope ON app."Membership" AS RESTRICTIVE FOR ALL TO review_room_user
USING (app.reviewer_demo_workspace() IS NULL OR "workspaceId"=app.reviewer_demo_workspace() OR ("userId"=app.request_user_id() AND EXISTS(SELECT 1 FROM app."ReviewerDemoAccount" d WHERE d."userId"=app.request_user_id() AND d."legacyWorkspaceId"="Membership"."workspaceId")))
WITH CHECK (app.reviewer_demo_workspace() IS NULL OR "workspaceId"=app.reviewer_demo_workspace());

-- Protect the shared workspace structure. Users can still browse owner tools,
-- upload revisions, discuss and review through the normal application.
CREATE FUNCTION app.guard_reviewer_demo_structure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; actor_tenant uuid;
BEGIN
  IF current_setting('role',true) NOT IN ('review_room_user','review_room_capability') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  actor_tenant := app.reviewer_demo_workspace();
  IF TG_TABLE_NAME='Workspace' THEN
    IF TG_OP='DELETE' THEN tenant:=OLD.id; ELSE tenant:=NEW.id; END IF;
  ELSIF TG_TABLE_NAME='ShareLink' THEN
    SELECT "workspaceId" INTO tenant FROM app."AssetVersion" WHERE id=NEW."versionId";
  ELSE
    IF TG_OP='DELETE' THEN tenant:=OLD."workspaceId"; ELSE tenant:=NEW."workspaceId"; END IF;
  END IF;
  IF TG_TABLE_NAME IN ('Membership','ProjectMember') AND TG_OP<>'DELETE' THEN
    IF EXISTS(SELECT 1 FROM app."ReviewerDemoAccount" WHERE "userId"=NEW."userId") THEN
      RAISE EXCEPTION 'Shared demo: project management, invitations and sharing are read only.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF actor_tenant IS NOT NULL OR EXISTS(SELECT 1 FROM app."ReviewerDemoAccount" WHERE "workspaceId"=tenant) THEN
    RAISE EXCEPTION 'Shared demo: project management, invitations and sharing are read only.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION app.guard_reviewer_demo_structure() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['Workspace','Membership','Project','ProjectMember','ProjectInvitation','ShareLink'] LOOP
    EXECUTE format('CREATE TRIGGER reviewer_structure BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_structure()',t);
  END LOOP;
END $$;

CREATE FUNCTION app.guard_reviewer_demo_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; actor uuid; total integer; used app."ReviewerDemoQuota";
BEGIN
  IF current_setting('role',true)<>'review_room_user' THEN RETURN NEW; END IF;
  actor:=app.request_user_id();
  SELECT "workspaceId" INTO tenant FROM app."ReviewerDemoAccount" WHERE "userId"=actor;
  IF tenant IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reviewer-demo:'||tenant::text,0));
  INSERT INTO app."ReviewerDemoQuota"("userId",day,mutations,uploads)
  VALUES(actor,date_trunc('day',now(),'UTC'),1,CASE WHEN TG_TABLE_NAME='AssetVersion' THEN 1 ELSE 0 END)
  ON CONFLICT("userId") DO UPDATE SET
    day=EXCLUDED.day,
    mutations=CASE WHEN "ReviewerDemoQuota".day=EXCLUDED.day THEN "ReviewerDemoQuota".mutations+1 ELSE 1 END,
    uploads=CASE WHEN "ReviewerDemoQuota".day=EXCLUDED.day THEN "ReviewerDemoQuota".uploads+EXCLUDED.uploads ELSE EXCLUDED.uploads END
  RETURNING * INTO used;
  IF used.mutations>100 OR used.uploads>4 THEN
    RAISE EXCEPTION 'Shared demo daily limit reached. Try again tomorrow.' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='AssetVersion' THEN
    SELECT count(*) INTO total FROM app."AssetVersion" WHERE "workspaceId"=tenant;
    IF total>=18 THEN RAISE EXCEPTION 'Shared demo upload capacity reached. Contact the demo operator.' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='Comment' AND TG_OP='INSERT' THEN
    SELECT count(*) INTO total FROM app."Comment" c JOIN app."AssetVersion" v ON v.id=c."versionId" WHERE v."workspaceId"=tenant;
    IF total>=200 THEN RAISE EXCEPTION 'Shared demo conversation capacity reached.' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='ReviewDecision' THEN
    SELECT count(*) INTO total FROM app."ReviewDecision" d JOIN app."AssetVersion" v ON v.id=d."versionId" WHERE v."workspaceId"=tenant;
    IF total>=100 THEN RAISE EXCEPTION 'Shared demo decision capacity reached.' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_reviewer_demo_mutation() FROM PUBLIC;
CREATE TRIGGER reviewer_quota BEFORE INSERT OR UPDATE ON app."Comment" FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_mutation();
CREATE TRIGGER reviewer_quota BEFORE INSERT ON app."ReviewDecision" FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_mutation();
CREATE TRIGGER reviewer_quota BEFORE INSERT ON app."AssetVersion" FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_mutation();

-- Protect public Auth identities from password/email takeover through Supabase's
-- direct user-update API. Only an operator can temporarily enable rotation.
CREATE FUNCTION app.guard_reviewer_demo_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM app."ReviewerDemoAccount" WHERE "userId"=OLD.id AND NOT "allowAuthChanges") THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Public demo accounts are protected'; END IF;
    IF NEW.email IS DISTINCT FROM OLD.email OR NEW.email_change IS DISTINCT FROM OLD.email_change OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.phone_change IS DISTINCT FROM OLD.phone_change OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Public demo account credentials are managed by the demo operator';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION app.guard_reviewer_demo_auth() FROM PUBLIC;
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    CREATE TRIGGER reviewer_demo_identity BEFORE UPDATE OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_auth();
  END IF;
END $$;

CREATE FUNCTION app.guard_reviewer_demo_mfa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM app."ReviewerDemoAccount" WHERE "userId"=NEW.user_id AND NOT "allowAuthChanges") THEN
    RAISE EXCEPTION 'MFA enrollment is disabled for shared public demo accounts';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_reviewer_demo_mfa() FROM PUBLIC;
DO $$ BEGIN
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    CREATE TRIGGER reviewer_demo_mfa BEFORE INSERT ON auth.mfa_factors FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_mfa();
  END IF;
END $$;

COMMIT;
