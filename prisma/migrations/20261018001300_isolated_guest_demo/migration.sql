BEGIN;
-- CreateTable
CREATE TABLE "DemoSession" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "marker" VARCHAR(32) NOT NULL DEFAULT 'REVIEW_ROOM_DEMO_V1',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "view" VARCHAR(8) NOT NULL DEFAULT 'DESIGNER',
    "state" JSONB NOT NULL,
    "receipts" JSONB NOT NULL DEFAULT '{}',
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "actionCount" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoSession_tokenHash_key" ON "DemoSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DemoSession_marker_expiresAt_idx" ON "DemoSession"("marker", "expiresAt");

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='review_room_demo') THEN CREATE ROLE review_room_demo NOLOGIN NOINHERIT NOBYPASSRLS; END IF;
 EXECUTE format('GRANT review_room_demo TO %I',current_user);
END $$;
GRANT USAGE ON SCHEMA app TO review_room_demo;
ALTER TABLE app."DemoSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."DemoSession" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app."DemoSession" FROM anon,authenticated; END IF;
END $$;
GRANT SELECT,INSERT ON app."DemoSession" TO review_room_demo;
GRANT UPDATE(view,state,receipts,"commentCount","actionCount",generation) ON app."DemoSession" TO review_room_demo;
ALTER TABLE app."DemoSession" ADD CONSTRAINT demo_marker CHECK(marker='REVIEW_ROOM_DEMO_V1');
ALTER TABLE app."DemoSession" ADD CONSTRAINT demo_limits CHECK("commentCount" BETWEEN 0 AND 20 AND "actionCount" BETWEEN 0 AND 100 AND generation BETWEEN 0 AND 100 AND view IN ('DESIGNER','CLIENT') AND "tokenHash" ~ '^[a-f0-9]{64}$');
CREATE POLICY demo_read ON app."DemoSession" FOR SELECT TO review_room_demo USING(id=nullif(current_setting('demo.session_id',true),'')::uuid AND "tokenHash"=current_setting('demo.token_hash',true) AND marker='REVIEW_ROOM_DEMO_V1' AND "expiresAt">clock_timestamp());
CREATE POLICY demo_create ON app."DemoSession" FOR INSERT TO review_room_demo WITH CHECK(id=nullif(current_setting('demo.session_id',true),'')::uuid AND "tokenHash"=current_setting('demo.token_hash',true) AND marker='REVIEW_ROOM_DEMO_V1' AND "expiresAt">now() AND "expiresAt"<=now()+interval '24 hours' AND "commentCount"=0 AND "actionCount"=0 AND generation=0 AND view='DESIGNER' AND receipts='{}'::jsonb);
CREATE POLICY demo_update ON app."DemoSession" FOR UPDATE TO review_room_demo USING(id=nullif(current_setting('demo.session_id',true),'')::uuid AND "tokenHash"=current_setting('demo.token_hash',true) AND marker='REVIEW_ROOM_DEMO_V1' AND "expiresAt">clock_timestamp()) WITH CHECK(id=nullif(current_setting('demo.session_id',true),'')::uuid AND "tokenHash"=current_setting('demo.token_hash',true) AND marker='REVIEW_ROOM_DEMO_V1' AND "expiresAt">clock_timestamp());
CREATE FUNCTION app.guard_demo_quota() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW."actionCount"<>OLD."actionCount"+1 OR NEW."commentCount" NOT BETWEEN OLD."commentCount" AND OLD."commentCount"+1 OR NEW.generation NOT BETWEEN OLD.generation AND OLD.generation+1 THEN RAISE EXCEPTION 'Demo quotas cannot be reset or bypassed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_demo_quota BEFORE UPDATE ON app."DemoSession" FOR EACH ROW EXECUTE FUNCTION app.guard_demo_quota();
REVOKE ALL ON FUNCTION app.guard_demo_quota() FROM PUBLIC;

COMMIT;
