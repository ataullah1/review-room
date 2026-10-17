-- AlterTable
ALTER TABLE "app"."Workspace" ADD COLUMN     "createdById" UUID;

-- CreateTable
CREATE TABLE "app"."SignupRateBucket" (
    "keyHash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SignupRateBucket_pkey" PRIMARY KEY ("keyHash")
);

-- CreateTable
CREATE TABLE "app"."SignupPermit" (
    "tokenHash" CHAR(64) NOT NULL,
    "emailHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SignupPermit_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "SignupRateBucket_expiresAt_idx" ON "app"."SignupRateBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "SignupPermit_expiresAt_idx" ON "app"."SignupPermit"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_createdById_key" ON "app"."Workspace"("createdById");

-- AddForeignKey
ALTER TABLE "app"."Workspace" ADD CONSTRAINT "Workspace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app"."UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only request role. Never grant it to anon/authenticated. Runtime MUST
-- switch to it inside a transaction before any identity-scoped application query.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'review_room_user') THEN
    CREATE ROLE review_room_user NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'review_room_user' AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
    RAISE EXCEPTION 'review_room_user must be a non-login, non-bypass role';
  END IF;
  EXECUTE format('GRANT review_room_user TO %I', current_user);
END $$;
GRANT USAGE ON SCHEMA app TO review_room_user;
GRANT SELECT, INSERT, UPDATE ON app."UserProfile" TO review_room_user;
GRANT SELECT, INSERT ON app."Workspace" TO review_room_user;
GRANT UPDATE (name) ON app."Workspace" TO review_room_user;
GRANT SELECT, INSERT ON app."Membership" TO review_room_user;
GRANT SELECT ON app."Project", app."ProjectMember" TO review_room_user;

ALTER TABLE app."SignupRateBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."SignupPermit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."SignupRateBucket", app."SignupPermit" FROM PUBLIC;

CREATE FUNCTION app.request_user_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- These small membership predicates avoid recursive RLS. Their definer is the
-- migration/table owner; locked search_path and explicit schemas prevent hijacks.
-- They accept resource IDs only; identity always comes from transaction context.
CREATE FUNCTION app.is_workspace_owner(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM app."Membership" WHERE "workspaceId" = target AND "userId" = app.request_user_id() AND role = 'OWNER') $$;

CREATE FUNCTION app.is_workspace_member(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM app."Membership" WHERE "workspaceId" = target AND "userId" = app.request_user_id()) $$;

CREATE FUNCTION app.can_access_project(target uuid, tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app."Project" p JOIN app."Membership" m ON m."workspaceId" = p."workspaceId"
    WHERE p.id = target AND p."workspaceId" = tenant AND m."userId" = app.request_user_id()
      AND (m.role = 'OWNER' OR EXISTS (
        SELECT 1 FROM app."ProjectMember" pm WHERE pm."projectId" = p.id
        AND pm."workspaceId" = tenant AND pm."userId" = app.request_user_id()
      ))
  )
$$;
REVOKE ALL ON FUNCTION app.request_user_id(), app.is_workspace_owner(uuid), app.is_workspace_member(uuid), app.can_access_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.request_user_id(), app.is_workspace_owner(uuid), app.is_workspace_member(uuid), app.can_access_project(uuid, uuid) TO review_room_user;

CREATE POLICY profile_read ON app."UserProfile" FOR SELECT TO review_room_user USING (id = app.request_user_id());
CREATE POLICY profile_create ON app."UserProfile" FOR INSERT TO review_room_user WITH CHECK (id = app.request_user_id());
CREATE POLICY profile_update ON app."UserProfile" FOR UPDATE TO review_room_user USING (id = app.request_user_id()) WITH CHECK (id = app.request_user_id());

CREATE POLICY workspace_read ON app."Workspace" FOR SELECT TO review_room_user
  USING ("createdById" = app.request_user_id() OR app.is_workspace_member(id));
CREATE POLICY workspace_create ON app."Workspace" FOR INSERT TO review_room_user WITH CHECK ("createdById" = app.request_user_id());
CREATE POLICY workspace_update ON app."Workspace" FOR UPDATE TO review_room_user USING (app.is_workspace_owner(id)) WITH CHECK (app.is_workspace_owner(id));

CREATE POLICY membership_read ON app."Membership" FOR SELECT TO review_room_user USING ("userId" = app.request_user_id() OR app.is_workspace_owner("workspaceId"));
CREATE POLICY membership_bootstrap ON app."Membership" FOR INSERT TO review_room_user
  WITH CHECK ("userId" = app.request_user_id() AND role = 'OWNER' AND EXISTS (
    SELECT 1 FROM app."Workspace" w WHERE w.id = "workspaceId" AND w."createdById" = app.request_user_id()
  ));
CREATE POLICY project_read ON app."Project" FOR SELECT TO review_room_user USING (app.can_access_project(id, "workspaceId"));
CREATE POLICY project_member_read ON app."ProjectMember" FOR SELECT TO review_room_user USING (app.can_access_project("projectId", "workspaceId"));

-- Free Postgres Before User Created hook. A random one-use permit binds an Auth
-- signup to the server's already-consumed durable IP quota. Calling Supabase
-- directly without this permit is rejected once the hook is enabled in Dashboard.
-- SECURITY INVOKER: supabase_auth_admin gets ONLY the necessary permit access.
CREATE FUNCTION app.before_user_created(event jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE accepted text;
BEGIN
  DELETE FROM app."SignupPermit"
  WHERE "tokenHash" = encode(sha256(convert_to(coalesce(event->'user'->'user_metadata'->>'signup_permit', ''), 'UTF8')), 'hex')
    AND "emailHash" = encode(sha256(convert_to(lower(coalesce(event->'user'->>'email', '')), 'UTF8')), 'hex')
    AND "expiresAt" > NOW()
  RETURNING "tokenHash" INTO accepted;
  IF accepted IS NULL THEN
    RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Please sign up through Review Room.'));
  END IF;
  RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION app.before_user_created(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA app TO supabase_auth_admin;
    GRANT SELECT, DELETE ON app."SignupPermit" TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION app.before_user_created(jsonb) TO supabase_auth_admin;
    CREATE POLICY signup_hook_read ON app."SignupPermit" FOR SELECT TO supabase_auth_admin USING (true);
    CREATE POLICY signup_hook_consume ON app."SignupPermit" FOR DELETE TO supabase_auth_admin USING (true);
  END IF;
END $$;
