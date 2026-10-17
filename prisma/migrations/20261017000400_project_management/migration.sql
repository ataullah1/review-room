-- Project writes remain confined to the server's non-bypass request role.
GRANT INSERT ON app."Project" TO review_room_user;
GRANT UPDATE ("archivedAt") ON app."Project" TO review_room_user;
GRANT INSERT, DELETE ON app."ProjectMember" TO review_room_user;

CREATE POLICY project_create ON app."Project" FOR INSERT TO review_room_user
  WITH CHECK (app.is_workspace_owner("workspaceId"));
CREATE POLICY project_update ON app."Project" FOR UPDATE TO review_room_user
  USING (app.is_workspace_owner("workspaceId"))
  WITH CHECK (app.is_workspace_owner("workspaceId"));

CREATE POLICY project_member_create ON app."ProjectMember" FOR INSERT TO review_room_user
  WITH CHECK (
    app.is_workspace_owner("workspaceId")
    AND EXISTS (SELECT 1 FROM app."Project" p WHERE p.id = "projectId" AND p."workspaceId" = "ProjectMember"."workspaceId" AND p."archivedAt" IS NULL)
    AND EXISTS (SELECT 1 FROM app."Membership" m WHERE m."workspaceId" = "ProjectMember"."workspaceId" AND m."userId" = "ProjectMember"."userId" AND m.role IN ('DESIGNER', 'CLIENT'))
  );
CREATE POLICY project_member_remove ON app."ProjectMember" FOR DELETE TO review_room_user
  USING (app.is_workspace_owner("workspaceId") AND EXISTS (
    SELECT 1 FROM app."Project" p WHERE p.id = "projectId" AND p."workspaceId" = "ProjectMember"."workspaceId" AND p."archivedAt" IS NULL
  ));

-- Owners need names for their own membership picker; no global profile listing.
CREATE POLICY profile_workspace_owner_read ON app."UserProfile" FOR SELECT TO review_room_user
  USING (EXISTS (SELECT 1 FROM app."Membership" m WHERE m."userId" = "UserProfile".id AND app.is_workspace_owner(m."workspaceId")));
