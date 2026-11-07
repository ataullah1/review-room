"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { RoundStatus } from "@/lib/data/review-rounds";
const labels: Record<RoundStatus["state"], string> = {
  UNCONFIGURED: "Review round not configured",
  REVIEWERS_REQUIRED: "Reviewer access needs attention",
  CHANGES_REQUESTED: "Changes requested",
  AWAITING_REVIEW: "Awaiting required reviews",
  FEEDBACK_OPEN: "Approvals received · feedback remains open",
  APPROVED: "Approved by all required reviewers",
};
export function ReviewRoundPanel({
  status,
  candidates,
  base,
  versionId,
  canRequest,
}: {
  status: RoundStatus;
  candidates: { id: string; name: string }[];
  base: string;
  versionId: string;
  canRequest: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const id = useRef<string | null>(null),
    router = useRouter();
  return (
    <section className="decision-panel" aria-label="Required reviewers">
      <h2>{labels[status.state]}</h2>
      {status.state === "UNCONFIGURED" && (
        <p>
          Earlier individual decisions remain history. Request a fresh review to
          define the required reviewers for this version.
        </p>
      )}
      <p>
        {status.openComments} unresolved comments. Every required client must
        approve and feedback must be resolved before completion.
      </p>
      <ul>
        {status.reviewers.map((r) => (
          <li key={r.userId}>
            {r.name} ·{" "}
            {!r.hasAccess
              ? "Access removed — owner must request a replacement review"
              : r.decision === "APPROVED"
                ? "Approved"
                : r.decision === "CHANGES_REQUESTED"
                  ? "Changes requested"
                  : "Pending"}
          </li>
        ))}
      </ul>
      {canRequest && (
        <details>
          <summary>
            {status.roundId
              ? "Start a fresh review round / update reviewers"
              : "Request review"}
          </summary>
          <p>
            A fresh round requires new decisions. Previous rounds remain in
            history.
          </p>
          {candidates.length ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (pending) return;
                const form = new FormData(event.currentTarget);
                id.current ||= crypto.randomUUID();
                setPending(true);
                setError("");
                try {
                  const response = await fetch(`${base}/review-request`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: id.current,
                      versionId,
                      reviewerIds: form.getAll("reviewerIds"),
                      reason: form.get("reason"),
                    }),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  id.current = null;
                  router.refresh();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not request review.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              <fieldset
                disabled={pending}
                onChange={() => {
                  id.current = null;
                }}
              >
                <legend>Required clients</legend>
                {candidates.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      name="reviewerIds"
                      value={c.id}
                      defaultChecked
                    />
                    {c.name}
                  </label>
                ))}
                <label className="review-text-label">
                  Review instructions / reason
                  <textarea
                    name="reason"
                    required
                    maxLength={500}
                    defaultValue="Please review this version and record your decision."
                  />
                </label>
                <Button disabled={pending}>
                  {pending ? "Requesting…" : "Request review"}
                </Button>
              </fieldset>
            </form>
          ) : (
            <p>
              Ask the owner to assign at least one client to this project first.
            </p>
          )}
        </details>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </section>
  );
}
