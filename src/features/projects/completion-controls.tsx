"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function CompletionControls({
  base,
  completed,
  owner,
  archived,
}: {
  base: string;
  completed: boolean;
  owner: boolean;
  archived: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const id = useRef<string | null>(null),
    router = useRouter();
  return (
    <section className="decision-panel">
      <h2>{completed ? "Project completed" : "Final delivery"}</h2>
      <p>
        {completed
          ? "Approved versions are frozen. The owner must reopen the project before further review or revision."
          : "Resolve feedback and obtain every required client approval for all current designs before completing this project."}
      </p>
      <Link href={`${base}/delivery`}>View delivery & approval history →</Link>
      {owner && !archived && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (pending) return;
            const form = new FormData(e.currentTarget);
            id.current ||= crypto.randomUUID();
            setPending(true);
            setError("");
            try {
              const response = await fetch(`${base}/completion`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: id.current,
                  operation: completed ? "reopen" : "complete",
                  reason: form.get("reason") || undefined,
                }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              id.current = null;
              router.refresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not update completion.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          {completed && (
            <label className="review-text-label">
              Reason to reopen
              <textarea
                name="reason"
                required
                maxLength={500}
                disabled={pending}
              />
            </label>
          )}
          <Button disabled={pending}>
            {pending
              ? "Saving…"
              : completed
                ? "Reopen project"
                : "Complete approved project"}
          </Button>
        </form>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
