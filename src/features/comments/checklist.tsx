"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { FeedbackChecklistPage } from "@/lib/data/comments";
export function FeedbackChecklist({
  initial,
  base,
  versionId,
  canAddress,
}: {
  initial: FeedbackChecklistPage;
  base: string;
  versionId: string;
  canAddress: boolean;
}) {
  const [page, setPage] = useState(initial),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function more() {
    setPending(true);
    setError("");
    try {
      const r = await fetch(
        `${base}/comments?versionId=${versionId}&checklist=1&after=${page.next}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error || "Could not load previous feedback.");
      setPage((p) => ({ items: [...p.items, ...data.items], next: data.next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  if (!page.items.length) return null;
  return (
    <section
      className="decision-panel"
      aria-label="Previous feedback checklist"
    >
      <h2>What changed in this revision</h2>
      <p>
        Revision notes describe a claimed fix. Original pins and discussions
        stay on their original versions; these notes do not resolve feedback or
        approve this version.
      </p>
      <ol>
        {page.items.map((item) => (
          <li key={item.id}>
            <Link href={`${base}?versionId=${item.versionId}`}>
              Version {item.versionNumber} · Comment {item.threadNumber}
            </Link>
            <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
            <small>{item.authorName}</small>
            {item.claim ? (
              <>
                <p>
                  <strong>Addressed by {item.claim.actorName}</strong>
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{item.claim.note}</p>
              </>
            ) : canAddress ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget,
                    note = String(new FormData(form).get("note") || "");
                  setPending(true);
                  setError("");
                  try {
                    const r = await fetch(
                      `${base}/comments?versionId=${versionId}`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          operation: "address",
                          sourceId: item.id,
                          note,
                        }),
                      },
                    );
                    const result = await r.json();
                    if (!r.ok)
                      throw new Error(
                        result.error || "Could not save revision note.",
                      );
                    setPage((p) => ({
                      ...p,
                      items: p.items.map((i) =>
                        i.id === item.id ? { ...i, claim: result.claim } : i,
                      ),
                    }));
                    router.refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Please try again.",
                    );
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <label className="project-field">
                  How this revision addresses the feedback
                  <textarea
                    name="note"
                    maxLength={1000}
                    required
                    disabled={pending}
                  />
                </label>
                <Button disabled={pending} type="submit">
                  Save revision note
                </Button>
              </form>
            ) : (
              <p>Not yet marked as addressed in this version.</p>
            )}
          </li>
        ))}
      </ol>
      {page.next !== null && (
        <Button type="button" disabled={pending} onClick={more}>
          Load earlier feedback
        </Button>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {pending && <p role="status">Updating checklist…</p>}
    </section>
  );
}
