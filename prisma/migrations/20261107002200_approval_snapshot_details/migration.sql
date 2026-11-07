-- Include actual decision timestamps/notes in future immutable delivery snapshots.
CREATE OR REPLACE FUNCTION app.review_round_status(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v app."AssetVersion"; r app."ReviewRound"; required jsonb; open_count integer; state text;
BEGIN
 SELECT * INTO v FROM app."AssetVersion" WHERE id=target AND status='READY';
 IF v.id IS NULL OR NOT app.can_access_project(v."projectId",v."workspaceId") OR (app.reviewer_demo_workspace() IS NOT NULL AND v."workspaceId"<>app.reviewer_demo_workspace()) THEN RETURN jsonb_build_object('error','Review unavailable.','status',404); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project:'||v."projectId"::text,0));
 SELECT * INTO r FROM app."ReviewRound" WHERE "versionId"=target ORDER BY "createdAt" DESC,id DESC LIMIT 1;
 IF r.id IS NULL THEN RETURN jsonb_build_object('state','UNCONFIGURED','reviewers','[]'::jsonb,'openComments',0,'roundId',null); END IF;
 SELECT count(*) INTO open_count FROM app."Comment" WHERE "versionId"=target AND "parentId" IS NULL AND "resolvedAt" IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',q."userId",'name',q."reviewerName",'hasAccess',EXISTS(SELECT 1 FROM app."ProjectMember" pm JOIN app."Membership" m ON m."userId"=pm."userId" AND m."workspaceId"=pm."workspaceId" WHERE pm."projectId"=r."projectId" AND pm."userId"=q."userId" AND m.role='CLIENT'),'decision',(SELECT d.decision::text FROM app."ReviewDecision" d WHERE d."versionId"=target AND d."reviewerId"=q."userId" AND d."createdAt">=r."createdAt" ORDER BY d."decisionNumber" DESC LIMIT 1),'decidedAt',(SELECT d."createdAt" FROM app."ReviewDecision" d WHERE d."versionId"=target AND d."reviewerId"=q."userId" AND d."createdAt">=r."createdAt" ORDER BY d."decisionNumber" DESC LIMIT 1),'note',(SELECT d.note FROM app."ReviewDecision" d WHERE d."versionId"=target AND d."reviewerId"=q."userId" AND d."createdAt">=r."createdAt" ORDER BY d."decisionNumber" DESC LIMIT 1)) ORDER BY q."reviewerName",q."userId"),'[]'::jsonb) INTO required FROM app."ReviewRoundReviewer" q WHERE q."roundId"=r.id;
 IF jsonb_array_length(required)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(required) e WHERE (e->>'hasAccess')::boolean IS NOT TRUE) THEN state:='REVIEWERS_REQUIRED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(required)e WHERE e->>'decision'='CHANGES_REQUESTED') THEN state:='CHANGES_REQUESTED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(required)e WHERE e->>'decision' IS NULL) THEN state:='AWAITING_REVIEW';
 ELSIF open_count>0 THEN state:='FEEDBACK_OPEN'; ELSE state:='APPROVED'; END IF;
 RETURN jsonb_build_object('state',state,'roundId',r.id,'requestedAt',r."createdAt",'reviewers',required,'openComments',open_count);
END $$;
