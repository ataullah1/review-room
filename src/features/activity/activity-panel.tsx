"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, CheckCheck, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activityDescription } from "./description";
import type { ActivityPage } from "./types";
export function ActivityPanel({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [page, setPage] = useState<ActivityPage | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false),
    alive = useRef(true),
    base = `/app/${workspaceId}/projects/${projectId}`,
    endpoint = `${base}/activity`;
  const request = useCallback(
    async (operation: "refresh" | "more" | "read", value?: string) => {
      if (running.current) return;
      running.current = true;
      setPending(true);
      setError("");
      try {
        const response = await fetch(
            operation === "more" ? `${endpoint}?before=${value}` : endpoint,
            {
              cache: "no-store",
              ...(operation === "read"
                ? {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ through: value }),
                  }
                : {}),
            },
          ),
          data: ActivityPage & { error?: string } = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load activity.");
        if (alive.current)
          setPage((previous) =>
            operation === "more" && previous
              ? {
                  ...data,
                  headId: previous.headId,
                  items: [
                    ...new Map(
                      [...previous.items, ...data.items].map((item) => [
                        item.id,
                        item,
                      ]),
                    ).values(),
                  ],
                }
              : data,
          );
      } catch (error) {
        if (alive.current)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load activity. Please try again.",
          );
      } finally {
        running.current = false;
        if (alive.current) setPending(false);
      }
    },
    [endpoint],
  );
  useEffect(() => {
    alive.current = true;
    const refresh = () => {
      if (document.visibilityState === "visible") void request("refresh");
    };
    const timer = setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [request]);
  return (
    <section
      className="activity-panel"
      id="activity"
      aria-label="Project activity"
      aria-busy={pending}
    >
      <header>
        <div>
          <h2>
            <Clock3 size={18} /> Project activity{" "}
            <span
              className={`activity-unread${page?.unreadCount ? " has-unread" : ""}`}
              role="status"
            >
              {page ? `${page.unreadCount} unread` : "Loading…"}
            </span>
          </h2>
          <p>The latest changes, kept in one place.</p>
        </div>
        <div>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void request("refresh")}
          >
            <RefreshCw size={14} /> Refresh activity
          </Button>
          <Button
            variant="outline"
            disabled={pending || !page?.unreadCount}
            onClick={() => void request("read", page!.headId)}
          >
            <CheckCheck size={14} /> Mark as read
          </Button>
        </div>
      </header>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {page && !page.items.length && (
        <p className="activity-empty">
          No activity yet. New uploads, feedback, decisions and accepted
          invitations will appear here.
        </p>
      )}
      <ol>
        {page?.items.map((item) => (
          <li key={item.id} className={item.unread ? "is-unread" : ""}>
            <span
              className="activity-dot"
              aria-label={item.unread ? "Unread activity" : "Read activity"}
            />
            <div>
              <p>
                <strong>{item.actorName}</strong> {activityDescription(item)}.
              </p>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </time>
            </div>
            {item.assetId && item.versionId && (
              <Link
                href={`${base}/assets/${item.assetId}?versionId=${item.versionId}`}
              >
                View version →
              </Link>
            )}
          </li>
        ))}
      </ol>
      {page?.next && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => void request("more", page.next!)}
        >
          Load older activity
        </Button>
      )}
    </section>
  );
}
