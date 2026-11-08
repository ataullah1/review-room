BEGIN;
-- Hide review-request metadata together with the removed design. Frozen delivery
-- JSON remains accessible under the existing project/snapshot authorization.
CREATE POLICY removed_round_scope ON app."ReviewRound" AS RESTRICTIVE FOR SELECT TO review_room_user USING(app.asset_available("assetId"));
CREATE POLICY removed_round_reviewer_scope ON app."ReviewRoundReviewer" AS RESTRICTIVE FOR SELECT TO review_room_user USING(EXISTS(SELECT 1 FROM app."ReviewRound" r WHERE r.id="roundId" AND app.asset_available(r."assetId")));
-- Different requesters/completions share the same project-wide capacity lock,
-- preventing a concurrent pair from passing the ten-jobs-per-day cap together.
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('app.request_delivery_package(uuid,boolean)'::regprocedure);
 body:=replace(body,
  'PERFORM pg_advisory_xact_lock(hashtextextended(''package:''',
  'PERFORM pg_advisory_xact_lock(hashtextextended(''package-project:''||c."projectId"::text,0)); PERFORM pg_advisory_xact_lock(hashtextextended(''package:''');
 EXECUTE body;
END $$;
COMMIT;
