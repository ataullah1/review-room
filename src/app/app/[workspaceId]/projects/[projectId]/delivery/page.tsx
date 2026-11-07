import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { withUserDatabase } from "@/lib/data/context";
import { getDb } from "@/lib/server/db";
import { deliverySnapshot } from "@/lib/data/completion";
import { AccessError } from "@/lib/auth/errors";
import { PrintSummary } from "@/features/projects/print-summary";
export default async function DeliveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ completionId?: string }>;
}) {
  const p = await params,
    q = await searchParams;
  let data;
  try {
    const user = await requireUser();
    data = await withUserDatabase(getDb(), user.id, (tx) =>
      deliverySnapshot(tx, user.id, p.workspaceId, p.projectId, q.completionId),
    );
  } catch (e) {
    if (e instanceof AccessError) {
      if (e.status === 401) redirect("/login");
      notFound();
    }
    throw e;
  }
  const base = `/app/${p.workspaceId}/projects/${p.projectId}`,
    snapshot = data.snapshot;
  return (
    <section className="private-content delivery-summary">
      <Link href={base}>← Project</Link>
      <h1>{snapshot?.manifest.projectName || data.project.name} — delivery</h1>
      {!snapshot ? (
        <p>
          No completed delivery yet. Request a review for every current design,
          obtain the required approvals, resolve feedback, then ask the owner to
          complete the project.
        </p>
      ) : (
        <>
          <p>
            {data.project.completionId === snapshot.id
              ? "Current completed delivery"
              : "Historical delivery — project has been reopened or completed again"}
          </p>
          <p>
            Completed by {snapshot.completedByName} ·{" "}
            <time dateTime={snapshot.createdAt.toISOString()}>
              {snapshot.createdAt.toISOString()} UTC
            </time>
          </p>
          <p>
            This is a version-specific review record, not a legal electronic
            signature. Original files retain their uploaded metadata.
          </p>
          <div className="upload-actions">
            <PrintSummary />
            <a
              className="project-text-link"
              href={`${base}/delivery/manifest?completionId=${snapshot.id}`}
            >
              Download JSON manifest
            </a>
          </div>
          <ol>
            {snapshot.manifest.files.map((file) => (
              <li key={file.versionId}>
                <h2>
                  {file.title} · Version {file.versionNumber}
                </h2>
                <p>
                  {file.width} × {file.height} px ·{" "}
                  {(file.fileSize / 1024 / 1024).toFixed(2)} MB ·{" "}
                  {file.mimeType}
                </p>
                <p>
                  SHA-256:{" "}
                  <code style={{ overflowWrap: "anywhere" }}>
                    {file.contentHash}
                  </code>
                </p>
                <ul>
                  {file.review.reviewers.map((r) => (
                    <li key={r.userId}>
                      {r.name}:{" "}
                      {r.decision === "APPROVED"
                        ? "Approved"
                        : r.decision || "Pending"}
                      {r.decidedAt && (
                        <span>
                          {" "}
                          · {new Date(r.decidedAt).toISOString()} UTC
                        </span>
                      )}
                      {r.note && <p>{r.note}</p>}
                    </li>
                  ))}
                </ul>
                <a
                  href={`${base}/delivery/file?completionId=${snapshot.id}&versionId=${file.versionId}`}
                >
                  Download approved original — {file.originalName}
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
      <h2>Completion history</h2>
      <ul>
        {data.history.map((record) => (
          <li key={record.id}>
            <Link href={`${base}/delivery?completionId=${record.id}`}>
              {record.createdAt.toISOString()} UTC
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
