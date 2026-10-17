-- INSERT ... RETURNING must see a new project immediately. The existing helper
-- re-queries Project under a statement snapshot and cannot see that row yet.
DROP POLICY project_read ON app."Project";
CREATE POLICY project_read ON app."Project" FOR SELECT TO review_room_user
  USING (app.is_workspace_owner("workspaceId") OR app.can_access_project(id, "workspaceId"));
