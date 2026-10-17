"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DecisionPage, DecisionView } from "./types";
const wording = (decision: DecisionView) =>
  decision.decision === "APPROVED" ? "Approved" : "Changes requested";
export function DecisionPanel({
  base,
  versionId,
  currentId,
  userId,
  canDecide,
  archived,
  initial,
}: {
  base: string;
  versionId: string;
  currentId: string;
  userId: string;
  canDecide: boolean;
  archived: boolean;
  initial: DecisionPage;
}) {
  const [page, setPage] = useState(initial),
    [decision, setDecision] = useState<DecisionView["decision"]>("APPROVED"),
    [note, setNote] = useState(""),
    [submission, setSubmission] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setSaved(false);
    const id = submission || crypto.randomUUID();
    setSubmission(id);
    try {
      const response = await fetch(`${base}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            expectedCurrentVersionId: versionId,
            decision,
            note,
          }),
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save this decision.");
      const canonical: DecisionView = data.decision;
      setPage((p) => ({
        ...p,
        history: [
          canonical,
          ...p.history.filter((r) => r.id !== canonical.id),
        ].sort((a, b) => b.decisionNumber - a.decisionNumber),
        latest: p.latest.some(
          (r) =>
            r.reviewerId === canonical.reviewerId &&
            r.decisionNumber > canonical.decisionNumber,
        )
          ? p.latest
          : [
              canonical,
              ...p.latest.filter((r) => r.reviewerId !== canonical.reviewerId),
            ],
      }));
      setSubmission(null);
      setNote("");
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save this decision. Your note is still here.",
      );
    } finally {
      setPending(false);
    }
  }
  async function more() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
          `${base}/decisions?versionId=${versionId}&before=${page.next}`,
          { cache: "no-store" },
        ),
        data: DecisionPage & { error?: string } = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load decision history.");
      setPage((p) => ({
        ...data,
        history: [
          ...new Map(
            [...p.history, ...data.history].map((d) => [d.id, d]),
          ).values(),
        ].sort((a, b) => b.decisionNumber - a.decisionNumber),
      }));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not load decision history.",
      );
    } finally {
      setPending(false);
    }
  }
  const historical = versionId !== currentId;
  return (
    <section className="decision-panel" aria-label="Client review decisions">
      <div className="decision-heading">
        <div>
          <h2>Client review</h2>
          <p>
            {historical
              ? "Decision history for this version."
              : page.latest.length
                ? "Each reviewer’s latest decision on this version."
                : "Review required · no client decision on this version yet."}
          </p>
        </div>
        <span className="decision-scope">
          Version only · individual decisions
        </span>
      </div>
      {!!page.latest.length && (
        <div className="decision-reviewers">
          {page.latest.map((row) => (
            <article
              key={row.reviewerId}
              className={`decision-reviewer ${row.decision === "APPROVED" ? "is-approved" : "needs-changes"}`}
            >
              <div>
                {row.decision === "APPROVED" ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <MessageSquareText size={17} />
                )}
                <strong>
                  {row.reviewerName}
                  {row.reviewerId === userId ? " (you)" : ""}
                </strong>
                <span>{wording(row)}</span>
              </div>
              {row.note && <p>{row.note}</p>}
            </article>
          ))}
        </div>
      )}
      {historical ? (
        <p className="version-historical">
          This version is read only.{" "}
          <Link href={`${base}?versionId=${currentId}`}>
            Review current version →
          </Link>
        </p>
      ) : archived ? (
        <p className="version-historical">
          Archived project · reviews are read only.
        </p>
      ) : canDecide ? (
        <form className="decision-form" onSubmit={submit}>
          <fieldset disabled={pending}>
            <legend>Your decision</legend>
            <label>
              <input
                type="radio"
                name="review-decision"
                checked={decision === "APPROVED"}
                onChange={() => {
                  setDecision("APPROVED");
                  setSubmission(null);
                  setSaved(false);
                }}
              />
              Approve this version
            </label>
            <label>
              <input
                type="radio"
                name="review-decision"
                checked={decision === "CHANGES_REQUESTED"}
                onChange={() => {
                  setDecision("CHANGES_REQUESTED");
                  setSubmission(null);
                  setSaved(false);
                }}
              />
              Request changes
            </label>
          </fieldset>
          <label className="review-text-label">
            {decision === "CHANGES_REQUESTED"
              ? "What needs to change? (required)"
              : "Review note (optional)"}
            <textarea
              rows={2}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSubmission(null);
                setSaved(false);
              }}
              maxLength={2000}
              required={decision === "CHANGES_REQUESTED"}
              disabled={pending}
              placeholder="Keep the next step clear and specific."
            />
          </label>
          <Button
            type="submit"
            disabled={
              pending || (decision === "CHANGES_REQUESTED" && !note.trim())
            }
          >
            {pending ? "Saving decision…" : "Save decision"}
          </Button>
        </form>
      ) : (
        <p className="decision-role-note">
          Assigned clients make review decisions. Owners and designers can read
          each reviewer’s response here.
        </p>
      )}
      {saved && (
        <p className="project-success" role="status">
          Your decision was saved for this version.
        </p>
      )}
      {error && (
        <div className="auth-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="version-text-link"
            disabled={pending}
            onClick={() => router.refresh()}
          >
            Refresh review
          </button>
        </div>
      )}
      {!!page.history.length && (
        <details className="decision-history">
          <summary>Decision history</summary>
          <ol>
            {page.history.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.reviewerName}</strong>
                  <span>{wording(row)}</span>
                  <time dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleString("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </time>
                </div>
                {row.note && <p>{row.note}</p>}
              </li>
            ))}
          </ol>
          {page.next && (
            <button
              className="version-text-link"
              disabled={pending}
              onClick={more}
            >
              {pending ? "Loading…" : "Load earlier decisions"}
            </button>
          )}
        </details>
      )}
    </section>
  );
}
