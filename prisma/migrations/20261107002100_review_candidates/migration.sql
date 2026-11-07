-- Designers can choose required clients without broadening Membership/Profile RLS.
CREATE FUNCTION app.review_candidates(target uuid) RETURNS TABLE(id uuid,name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m."userId",u."displayName"::text FROM app."Project" p
 JOIN app."ProjectMember" pm ON pm."projectId"=p.id AND pm."workspaceId"=p."workspaceId"
 JOIN app."Membership" m ON m."workspaceId"=pm."workspaceId" AND m."userId"=pm."userId"
 JOIN app."UserProfile" u ON u.id=m."userId"
 WHERE p.id=target AND m.role='CLIENT' AND app.can_upload_project(p.id,p."workspaceId")
 AND (app.reviewer_demo_workspace() IS NULL OR p."workspaceId"=app.reviewer_demo_workspace())
 ORDER BY u."displayName",m."userId"
$$;
REVOKE ALL ON FUNCTION app.review_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.review_candidates(uuid) TO review_room_user;
