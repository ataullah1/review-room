"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { packageStatus } from "@/lib/data/delivery-packages";
type Status = Awaited<ReturnType<typeof packageStatus>>;
export function PackagePanel({
  base,
  completionId,
  enabled,
}: {
  base: string;
  completionId: string;
  enabled: boolean;
}) {
  const [job, setJob] = useState<Status>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function update(operation?: "request" | "cancel") {
    setPending(true);
    setError("");
    try {
      if (operation) {
        const r = await fetch(`${base}/delivery/package`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completionId, operation }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Package request failed.");
      }
      const r = await fetch(
        `${base}/delivery/package?completionId=${completionId}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not check package.");
      setJob(data.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="decision-panel" aria-label="Delivery ZIP">
      <h2>Download as ZIP</h2>
      <p>
        Up to 20 originals and 100 MiB. Private packages expire after 24 hours;
        individual downloads remain available. Downloads already issued may
        remain valid for 60 seconds.
      </p>
      {!enabled && (
        <p>
          ZIP preparation is currently unavailable. You can check an existing
          package or download originals individually below.
        </p>
      )}
      <div className="upload-actions">
        {enabled && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => update("request")}
          >
            Prepare / retry ZIP
          </Button>
        )}
        <Button type="button" disabled={pending} onClick={() => update()}>
          Check ZIP status
        </Button>
        {job && ["QUEUED", "PROCESSING", "READY"].includes(job.status) && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => update("cancel")}
          >
            Cancel package
          </Button>
        )}
      </div>
      {job && (
        <p role="status">
          Package: {job.status.toLowerCase()} · expires{" "}
          {new Date(job.expiresAt).toISOString()} UTC
        </p>
      )}
      {job?.status === "READY" && (
        <a
          href={`${base}/delivery/package?completionId=${completionId}&download=1`}
        >
          Download approved originals ZIP
        </a>
      )}
      {job?.status === "FAILED" && (
        <p>
          Generation did not finish. Maintenance will clean partial output
          before you retry. Download originals individually in the meantime.
        </p>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {pending && <p role="status">Updating package…</p>}
    </section>
  );
}
