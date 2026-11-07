ALTER TABLE app."AssetVersion" ADD COLUMN "cleanupToken" uuid, ADD COLUMN "cleanupUntil" timestamptz(3), ADD COLUMN "cleanupRetryAt" timestamptz(3);
CREATE OR REPLACE FUNCTION app.guard_asset_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_setting('role',true)='review_room_user' AND (NEW."cleanupToken",NEW."cleanupUntil",NEW."cleanupRetryAt") IS DISTINCT FROM (OLD."cleanupToken",OLD."cleanupUntil",OLD."cleanupRetryAt") THEN RAISE EXCEPTION 'Cleanup metadata is server managed'; END IF;
 IF OLD.status='READY' AND (to_jsonb(NEW)-ARRAY['cleanedAt','cleanupToken','cleanupUntil','cleanupRetryAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['cleanedAt','cleanupToken','cleanupUntil','cleanupRetryAt']) THEN RAISE EXCEPTION 'READY asset versions are immutable'; END IF;
 IF OLD.status='FAILED' AND NEW.status<>'FAILED' THEN RAISE EXCEPTION 'Failed uploads cannot be published'; END IF;
 RETURN NEW;
END $$;
