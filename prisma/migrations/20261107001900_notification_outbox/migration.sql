BEGIN;
CREATE TABLE app."NotificationJob" (
 id uuid PRIMARY KEY, "dedupeKey" text NOT NULL UNIQUE,
 "workspaceId" uuid NOT NULL, "projectId" uuid NOT NULL,
 kind varchar(20) NOT NULL CHECK(kind IN ('INVITATION','REVIEW_READY','COMMENT','DECISION')),
 "recipientId" uuid, "sourceId" uuid NOT NULL,
 payload text, "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "expiresAt" timestamptz(3) NOT NULL,
 attempts integer NOT NULL DEFAULT 0, "nextAttemptAt" timestamptz(3) NOT NULL DEFAULT now(),
 "leaseToken" uuid, "leaseUntil" timestamptz(3), "sentAt" timestamptz(3), "cancelledAt" timestamptz(3), "lastCode" varchar(40)
);
CREATE INDEX "NotificationJob_nextAttemptAt_idx" ON app."NotificationJob"("nextAttemptAt");
CREATE TABLE app."NotificationPreference" (
 "userId" uuid PRIMARY KEY, "emailEnabled" boolean NOT NULL DEFAULT true
);
ALTER TABLE app."NotificationJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."NotificationPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app."NotificationJob",app."NotificationPreference" FROM PUBLIC;
GRANT SELECT ON app."NotificationJob" TO review_room_user;
GRANT SELECT,INSERT,UPDATE ON app."NotificationPreference" TO review_room_user;
CREATE POLICY notification_owner_read ON app."NotificationJob" FOR SELECT TO review_room_user USING(app.is_workspace_owner("workspaceId") AND (app.reviewer_demo_workspace() IS NULL OR "workspaceId"=app.reviewer_demo_workspace()));
-- Encrypted delivery payloads and recipient IDs are never returned by app APIs.
CREATE POLICY preference_self ON app."NotificationPreference" FOR ALL TO review_room_user USING("userId"=app.request_user_id()) WITH CHECK("userId"=app.request_user_id());
CREATE FUNCTION app.enqueue_notification(job_id uuid, dedupe text, tenant uuid, project uuid, event_kind text, recipient uuid, source uuid, encrypted_payload text, expiry timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT app.can_access_project(project,tenant) OR app.reviewer_demo_workspace() IS NOT NULL THEN RETURN; END IF;
 IF event_kind='INVITATION' AND NOT app.is_workspace_owner(tenant) THEN RAISE EXCEPTION 'Only owners can send invitations'; END IF;
 IF length(encrypted_payload)>16000 OR expiry>now()+interval '8 days' OR expiry<=now() THEN RAISE EXCEPTION 'Invalid notification intent'; END IF;
 IF (SELECT count(*) FROM app."NotificationJob" WHERE "workspaceId"=tenant AND "createdAt">now()-interval '1 day')>=1000 THEN RETURN; END IF;
 INSERT INTO app."NotificationJob"(id,"dedupeKey","workspaceId","projectId",kind,"recipientId","sourceId",payload,"expiresAt") VALUES(job_id,dedupe,tenant,project,event_kind,recipient,source,encrypted_payload,expiry) ON CONFLICT("dedupeKey") DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION app.enqueue_notification(uuid,text,uuid,uuid,text,uuid,uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enqueue_notification(uuid,text,uuid,uuid,text,uuid,uuid,text,timestamptz) TO review_room_user;
CREATE FUNCTION app.project_notification_recipients(target uuid) RETURNS TABLE("userId" uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT DISTINCT m."userId" FROM app."Project" p JOIN app."Membership" m ON m."workspaceId"=p."workspaceId"
 WHERE p.id=target AND app.can_access_project(p.id,p."workspaceId") AND app.reviewer_demo_workspace() IS NULL
 AND (m.role='OWNER' OR EXISTS(SELECT 1 FROM app."ProjectMember" pm WHERE pm."projectId"=p.id AND pm."userId"=m."userId"))
$$;
REVOKE ALL ON FUNCTION app.project_notification_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_notification_recipients(uuid) TO review_room_user;
COMMIT;
