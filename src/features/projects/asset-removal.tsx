"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { mutateProject, removeDesignAction } from "./actions";
import type { RemovalImpact, RemovedAsset } from "@/lib/data/asset-removal";
export function AssetRemovalForm({
  workspaceId,
  projectId,
  assetId,
  impact,
}: {
  workspaceId: string;
  projectId: string;
  assetId: string;
  impact: RemovalImpact;
}) {
  const [state, action, pending] = useActionState(
    removeDesignAction.bind(null, workspaceId, projectId),
    {},
  );
  return (
    <details className="new-version-panel">
      <summary>Remove this design</summary>
      <form action={action} aria-busy={pending} className="project-form">
        <p>
          {impact.versions} versions · {impact.comments} comments ·{" "}
          {impact.links} active share links. Removal hides the design and
          revokes those links. Existing signed downloads can remain valid for up
          to 60 seconds.
        </p>
        <p>
          Restore within 30 days. {impact.retainedDeliveries} completed
          deliveries retain their approved originals. Permanent deletion is
          disabled; {(impact.bytes / 1024 / 1024).toFixed(2)} MB remains counted
          toward storage.
        </p>
        <input type="hidden" name="assetId" value={assetId} />
        <label className="project-field">
          Reason
          <textarea name="reason" required maxLength={500} disabled={pending} />
        </label>
        <label>
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            disabled={pending}
          />{" "}
          I understand the removal and retention policy.
        </label>
        <Button type="submit" disabled={pending}>
          Remove design
        </Button>
        {state.error && (
          <p role="alert" className="auth-error">
            {state.error}
          </p>
        )}
        {state.success && <p role="status">{state.success}</p>}
      </form>
    </details>
  );
}
function RestoreAsset({
  workspaceId,
  projectId,
  asset,
}: {
  workspaceId: string;
  projectId: string;
  asset: RemovedAsset;
}) {
  const [state, action, pending] = useActionState(
    mutateProject.bind(null, workspaceId, projectId, "asset-restore"),
    {},
  );
  return (
    <li>
      <strong>{asset.title}</strong>
      <p>
        {asset.reason} · Removed by {asset.actorName}
      </p>
      <p>
        Restore until{" "}
        <time dateTime={asset.restoreUntil}>
          {asset.restoreUntil.slice(0, 10)} UTC
        </time>
        . Original files are retained.
      </p>
      <form action={action}>
        <input type="hidden" name="assetId" value={asset.assetId} />
        <Button type="submit" disabled={pending}>
          Restore design
        </Button>
      </form>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </li>
  );
}
export function RemovedAssets({
  workspaceId,
  projectId,
  assets,
}: {
  workspaceId: string;
  projectId: string;
  assets: RemovedAsset[];
}) {
  if (!assets.length) return null;
  return (
    <details className="new-version-panel">
      <summary>Removed designs · {assets.length}</summary>
      <p>
        Removal does not reclaim storage. Restoring never reactivates old share
        links. Showing up to 100 most recent removed designs.
      </p>
      <ul>
        {assets.map((asset) => (
          <RestoreAsset
            key={asset.id}
            workspaceId={workspaceId}
            projectId={projectId}
            asset={asset}
          />
        ))}
      </ul>
    </details>
  );
}
