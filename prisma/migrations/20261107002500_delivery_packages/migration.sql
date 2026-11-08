BEGIN;
CREATE TABLE app."DeliveryPackage" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workspaceId" uuid NOT NULL, "projectId" uuid NOT NULL, "completionId" uuid NOT NULL,
 "requestedById" uuid NOT NULL, status varchar(12) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','READY','FAILED','CANCELLED','EXPIRED')),
 attempts integer NOT NULL DEFAULT 0, "leaseToken" uuid, "leaseUntil" timestamptz(3),
 "expiresAt" timestamptz(3) NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL DEFAULT now(), "cleanedAt" timestamptz(3),
 "artifactBytes" integer, "artifactHash" char(64)
);
CREATE UNIQUE INDEX "DeliveryPackage_completionId_requestedById_key" ON app."DeliveryPackage"("completionId","requestedById");
CREATE INDEX "DeliveryPackage_status_expiresAt_idx" ON app."DeliveryPackage"(status,"expiresAt");
ALTER TABLE app."DeliveryPackage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."DeliveryPackage" FROM PUBLIC,review_room_user,review_room_capability;
GRANT SELECT ON app."DeliveryPackage" TO review_room_user;
CREATE POLICY package_read ON app."DeliveryPackage" FOR SELECT TO review_room_user USING("requestedById"=app.request_user_id() AND app.can_access_project("projectId","workspaceId") AND app.reviewer_demo_workspace() IS NULL);
CREATE FUNCTION app.request_delivery_package(target uuid, cancelling boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c app."ProjectCompletion"; job app."DeliveryPackage"; uid uuid:=app.request_user_id(); total_bytes bigint; files integer;
BEGIN
 SELECT * INTO c FROM app."ProjectCompletion" WHERE id=target;
 IF c.id IS NULL OR NOT app.can_access_project(c."projectId",c."workspaceId") OR app.reviewer_demo_workspace() IS NOT NULL THEN RETURN jsonb_build_object('error','This delivery is not available.','status',403); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('package:'||c.id::text||':'||uid::text,0));
 SELECT * INTO job FROM app."DeliveryPackage" WHERE "completionId"=target AND "requestedById"=uid FOR UPDATE;
 IF cancelling THEN
  IF job.id IS NOT NULL THEN UPDATE app."DeliveryPackage" SET status='CANCELLED',"updatedAt"=now() WHERE id=job.id; END IF;
  RETURN jsonb_build_object('cancelled',true);
 END IF;
 SELECT count(*),coalesce(sum((f->>'fileSize')::bigint),0) INTO files,total_bytes FROM jsonb_array_elements(c.manifest->'files') f;
 IF files NOT BETWEEN 1 AND 20 OR total_bytes>104857600 THEN RETURN jsonb_build_object('error','ZIP supports up to 20 files and 100 MiB. Download originals individually for larger deliveries.','status',413); END IF;
 IF job.id IS NOT NULL THEN
  IF job.status IN ('QUEUED','PROCESSING','READY') AND job."expiresAt">now() THEN RETURN jsonb_build_object('id',job.id); END IF;
  IF job."leaseUntil">now() OR job."cleanedAt" IS NULL THEN RETURN jsonb_build_object('error','The previous package is awaiting cleanup. Try again after maintenance.','status',409); END IF;
  IF job.attempts>=3 AND job."createdAt">now()-interval '1 day' THEN RETURN jsonb_build_object('error','Package retry limit reached. Use individual downloads or retry tomorrow.','status',429); END IF;
  UPDATE app."DeliveryPackage" SET status='QUEUED',"expiresAt"=now()+interval '24 hours',"cleanedAt"=null,"artifactBytes"=null,"artifactHash"=null,"leaseToken"=null,"leaseUntil"=null,"updatedAt"=now(),attempts=CASE WHEN "createdAt"<=now()-interval '1 day' THEN 0 ELSE attempts END,"createdAt"=CASE WHEN "createdAt"<=now()-interval '1 day' THEN now() ELSE "createdAt" END WHERE id=job.id;
  RETURN jsonb_build_object('id',job.id);
 END IF;
 IF (SELECT count(*) FROM app."DeliveryPackage" WHERE "projectId"=c."projectId" AND "createdAt">now()-interval '1 day')>=10 THEN RETURN jsonb_build_object('error','Project package limit reached. Use individual downloads.','status',429); END IF;
 INSERT INTO app."DeliveryPackage"("workspaceId","projectId","completionId","requestedById","expiresAt") VALUES(c."workspaceId",c."projectId",c.id,uid,now()+interval '24 hours') RETURNING * INTO job;
 RETURN jsonb_build_object('id',job.id);
END $$;
REVOKE ALL ON FUNCTION app.request_delivery_package(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.request_delivery_package(uuid,boolean) TO review_room_user;
COMMIT;
