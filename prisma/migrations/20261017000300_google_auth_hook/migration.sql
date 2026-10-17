CREATE OR REPLACE FUNCTION app.before_user_created(event jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE accepted text;
BEGIN
  -- app_metadata.provider is assigned by Supabase, never by signup user metadata.
  -- Google accounts still require the durable app quota before provisioning.
  IF event->'user'->'app_metadata'->>'provider' = 'google'
    AND event->'user'->'user_metadata'->>'email_verified' = 'true'
    AND length(coalesce(event->'user'->>'email', '')) > 0 THEN
    RETURN '{}'::jsonb;
  END IF;
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
