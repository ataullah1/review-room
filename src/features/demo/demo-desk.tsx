"use client";
import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { DemoCanvas } from "./demo-canvas";
import { demoAssets, type DemoAssetId } from "./catalog";
import type { DemoSnapshot } from "./state";
import type { ImagePoint } from "@/features/comments/coordinates";
export function DemoDesk() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [expired, setExpired] = useState(false),
    [assetId, setAssetId] = useState<DemoAssetId>("identity"),
    [version, setVersion] = useState<1 | 2>(2),
    [compare, setCompare] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<ImagePoint | null>(null),
    [body, setBody] = useState(""),
    [reply, setReply] = useState(""),
    [note, setNote] = useState(""),
    [confirm, setConfirm] = useState(false);
  const pendingAction = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const inFlight = useRef(false),
    commentKey = useRef<string | null>(null),
    replyKey = useRef<string | null>(null),
    decisionKey = useRef<{ id: string; kind: string; note: string } | null>(
      null,
    );
  const start = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/demo/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSnapshot(data);
      setExpired(false);
      setDraft(null);
      setSelected(null);
      setBody("");
      setReply("");
      setNote("");
      setConfirm(false);
      pendingAction.current = null;
      commentKey.current = null;
      replyKey.current = null;
      decisionKey.current = null;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open demo.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void start(), 0);
    return () => clearTimeout(timer);
  }, [start]);
  async function send(payload: Record<string, unknown>, requestId?: string) {
    if (!snapshot || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({
      ...payload,
      generation: snapshot.generation,
    });
    if (!requestId) {
      if (pendingAction.current?.fingerprint !== fingerprint)
        pendingAction.current = { fingerprint, id: crypto.randomUUID() };
      requestId = pendingAction.current!.id;
    }
    try {
      const response = await fetch("/demo/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            requestId,
            generation: snapshot.generation,
          }),
          cache: "no-store",
        }),
        data = await response.json();
      if (!response.ok) {
        if (response.status === 410) setExpired(true);
        throw new Error(data.error);
      }
      setSnapshot(data);
      pendingAction.current = null;
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save your demo change. Try again.",
      );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/demo/state", { cache: "no-store" }),
        data = await response.json();
      if (!response.ok) {
        if (response.status === 410) setExpired(true);
        throw new Error(data.error);
      }
      setSnapshot(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not refresh demo.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const asset = demoAssets.find((a) => a.id === assetId)!,
    image = asset.versions.find((v) => v.number === version)!,
    roots =
      snapshot?.state.comments.filter(
        (c) => c.assetId === assetId && c.version === version && !c.parentId,
      ) || [],
    decision = snapshot?.state.decisions.findLast(
      (d) => d.assetId === assetId && d.version === version,
    ),
    readOnly = busy || expired || version !== 2;
  function navigate(id: DemoAssetId, next: 1 | 2 = 2) {
    if (busy) return;
    setAssetId(id);
    setVersion(next);
    setSelected(null);
    setDraft(null);
    setBody("");
    setReply("");
    commentKey.current = null;
    replyKey.current = null;
    setError("");
  }
  function pin(point: ImagePoint) {
    if (readOnly) return;
    setDraft(point);
    setSelected(null);
    setCompare(false);
  }
  async function saveComment(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const key = commentKey.current || crypto.randomUUID();
    commentKey.current = key;
    if (
      await send(
        { operation: "comment", assetId, version, body, ...draft },
        key,
      )
    ) {
      setDraft(null);
      setBody("");
      commentKey.current = null;
    }
  }
  async function saveReply(event: FormEvent) {
    event.preventDefault();
    const key = replyKey.current || crypto.randomUUID();
    replyKey.current = key;
    if (
      await send(
        {
          operation: "comment",
          assetId,
          version,
          body: reply,
          parentId: selected,
        },
        key,
      )
    ) {
      setReply("");
      replyKey.current = null;
    }
  }
  async function review(kind: "APPROVED" | "CHANGES_REQUESTED") {
    const key = decisionKey.current;
    if (!key || key.kind !== kind || key.note !== note)
      decisionKey.current = { id: crypto.randomUUID(), kind, note };
    if (
      await send(
        {
          operation: "decision",
          assetId,
          version,
          decision: kind,
          note: note.trim() || null,
        },
        decisionKey.current!.id,
      )
    ) {
      setNote("");
      decisionKey.current = null;
    }
  }
  if (!snapshot)
    return (
      <main className="capability-entry">
        <span className="capability-brand">review room.</span>
        <h1>Your own little review room.</h1>
        <p>{error || "Preparing three sample designs for your demo…"}</p>
        {error && (
          <Button onClick={() => void start()} disabled={busy}>
            Try again
          </Button>
        )}
        <Link href="/">← Back home</Link>
      </main>
    );
  return (
    <main className="demo-desk">
      <header className="demo-topbar">
        <Link className="capability-brand" href="/">
          review room.
        </Link>
        <span className="demo-badge">Isolated demo · sample data</span>
        <Link href="/signup">Create your workspace →</Link>
      </header>
      <div className="demo-intro">
        <div>
          <span className="eyebrow">FORMA / SAMPLE STUDIO</span>
          <h1>A little feedback. A better result.</h1>
          <p>
            Explore as a designer, then switch to client to leave a review. Your
            changes belong only to this guest session.
          </p>
        </div>
        <div className="demo-view-toggle" role="group" aria-label="Demo view">
          <button
            aria-pressed={snapshot.view === "DESIGNER"}
            disabled={busy || expired}
            onClick={() => void send({ operation: "view", view: "DESIGNER" })}
          >
            Designer view
          </button>
          <button
            aria-pressed={snapshot.view === "CLIENT"}
            disabled={busy || expired}
            onClick={() => void send({ operation: "view", view: "CLIENT" })}
          >
            Client view
          </button>
        </div>
      </div>
      <div className="demo-session-bar">
        <span>
          {snapshot.commentCount}/20 comments · {snapshot.actionCount}/100
          actions · expires{" "}
          {new Date(snapshot.expiresAt).toLocaleString("en", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "UTC",
          })}{" "}
          UTC
        </span>
        <div>
          <button disabled={busy} onClick={() => void refresh()}>
            Refresh demo
          </button>
          <button disabled={busy || expired} onClick={() => setConfirm(true)}>
            Reset demo
          </button>
        </div>
      </div>
      {confirm && (
        <div className="demo-reset-confirm" role="alert">
          <p>
            Reset your demo feedback and decisions? Other visitors will keep
            their own changes. Your session quotas stay in place.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await send({ operation: "reset", confirm: true })) {
                setConfirm(false);
                setDraft(null);
                setSelected(null);
                setBody("");
                setReply("");
                setNote("");
                commentKey.current = null;
                replyKey.current = null;
              }
            }}
          >
            {busy ? "Resetting…" : "Confirm reset"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Cancel reset
          </Button>
        </div>
      )}
      {error && (
        <div className="auth-error demo-error" role="alert">
          {error}
          {expired && (
            <Button disabled={busy} onClick={() => void start()}>
              Start a fresh demo
            </Button>
          )}
        </div>
      )}
      <nav className="demo-assets" aria-label="Sample designs">
        {demoAssets.map((a) => (
          <button
            key={a.id}
            className={a.id === assetId ? "is-active" : ""}
            disabled={busy}
            onClick={() => navigate(a.id)}
          >
            <Image
              unoptimized
              src={a.versions[1].src}
              width={120}
              height={90}
              alt=""
            />
            <span>
              <strong>{a.title}</strong>
              <small>{a.category}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="demo-review-heading">
        <div>
          <h2>{asset.title}</h2>
          <p>
            {version === 1
              ? "Historical version · read only"
              : decision?.decision === "APPROVED"
                ? "Client approved this version"
                : decision?.decision === "CHANGES_REQUESTED"
                  ? "Changes requested"
                  : "Review required · awaiting client decision"}
          </p>
        </div>
        <div>
          <label>
            Viewing version
            <select
              value={version}
              disabled={busy}
              onChange={(e) =>
                navigate(assetId, Number(e.target.value) as 1 | 2)
              }
            >
              <option value={2}>Version 2 · Current</option>
              <option value={1}>Version 1 · Historical</option>
            </select>
          </label>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setCompare((c) => !c);
              setDraft(null);
            }}
          >
            {compare ? "Back to feedback" : "Compare versions"}
          </Button>
        </div>
      </div>
      {compare ? (
        <div className="demo-comparison">
          {asset.versions.map((v) => (
            <div key={v.number}>
              <h3>Version {v.number}</h3>
              <DemoCanvas
                src={v.src}
                width={v.width}
                height={v.height}
                roots={[]}
                selected={null}
                draft={null}
                onSelect={() => undefined}
                onPin={() => undefined}
                readOnly
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="demo-review-layout">
          <DemoCanvas
            key={`${assetId}:${version}`}
            src={image.src}
            width={image.width}
            height={image.height}
            roots={roots}
            selected={selected}
            draft={draft}
            onSelect={(id) => {
              if (busy) return;
              setSelected(id);
              setDraft(null);
              setReply("");
              replyKey.current = null;
            }}
            onPin={pin}
            readOnly={readOnly}
          />
          <aside className="demo-feedback" aria-label="Demo feedback">
            <h3>
              Feedback <span>{roots.length}</span>
            </h3>
            <p>
              {version === 1
                ? "Old pins stay on their original version."
                : "Click a pin to explore its thread, or add your own."}
            </p>
            {draft && (
              <form onSubmit={saveComment} className="demo-comment-form">
                <h4>New pinned comment</h4>
                <div className="demo-position-controls">
                  {(["xRatio", "yRatio"] as const).map((axis, i) => (
                    <label key={axis}>
                      {i === 0 ? "Horizontal" : "Vertical"} position
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={0.1}
                        disabled={busy}
                        value={draft[axis] * 100}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? { ...d, [axis]: Number(e.target.value) / 100 }
                              : d,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Your comment
                  <textarea
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      commentKey.current = null;
                    }}
                    required
                    maxLength={1000}
                    rows={3}
                    disabled={busy}
                  />
                </label>
                <div>
                  <Button type="submit" disabled={busy || !body.trim()}>
                    Save comment
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setDraft(null);
                      setBody("");
                      commentKey.current = null;
                    }}
                  >
                    Cancel comment
                  </Button>
                </div>
              </form>
            )}
            {roots.map((root) => (
              <article
                key={root.id}
                className={`demo-thread${selected === root.id ? " is-selected" : ""}`}
              >
                <button
                  className="demo-thread-heading"
                  disabled={busy}
                  onClick={() => setSelected(root.id)}
                >
                  <span>{root.threadNumber}</span>
                  <strong>Demo {root.author.toLowerCase()}</strong>
                  <small>{root.resolved ? "Resolved" : "Open"}</small>
                </button>
                <p>{root.body}</p>
                {selected === root.id && (
                  <>
                    <div className="demo-replies">
                      {snapshot.state.comments
                        .filter((c) => c.parentId === root.id)
                        .map((r) => (
                          <div key={r.id}>
                            <strong>Demo {r.author.toLowerCase()}</strong>
                            <p>{r.body}</p>
                          </div>
                        ))}
                    </div>
                    {!readOnly && (
                      <form onSubmit={saveReply} className="demo-comment-form">
                        <label>
                          Reply to thread {root.threadNumber}
                          <textarea
                            value={reply}
                            onChange={(e) => {
                              setReply(e.target.value);
                              replyKey.current = null;
                            }}
                            maxLength={1000}
                            required
                            rows={2}
                            disabled={busy}
                          />
                        </label>
                        <Button type="submit" disabled={busy || !reply.trim()}>
                          Send reply
                        </Button>
                      </form>
                    )}
                    {snapshot.view === "DESIGNER" && version === 2 && (
                      <Button
                        variant="outline"
                        disabled={busy || expired}
                        onClick={() =>
                          void send({
                            operation: "resolve",
                            assetId,
                            version,
                            id: root.id,
                            resolved: !root.resolved,
                          })
                        }
                      >
                        {root.resolved ? "Reopen thread" : "Resolve thread"}
                      </Button>
                    )}
                  </>
                )}
              </article>
            ))}
            <div className="demo-decision">
              <h3>Client review</h3>
              <p>
                {decision
                  ? `${decision.decision === "APPROVED" ? "Approved" : "Changes requested"} by demo client`
                  : "No decision on this version yet."}
              </p>
              {decision?.note && <p>{decision.note}</p>}
              {snapshot.view === "CLIENT" && version === 2 ? (
                <>
                  <label>
                    Review note
                    <textarea
                      rows={2}
                      value={note}
                      maxLength={1000}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <div>
                    <Button
                      disabled={busy || expired}
                      onClick={() => void review("APPROVED")}
                    >
                      Approve version
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || expired || !note.trim()}
                      onClick={() => void review("CHANGES_REQUESTED")}
                    >
                      Request changes
                    </Button>
                  </div>
                </>
              ) : (
                <p className="demo-hint">
                  {version === 1
                    ? "Historical decisions stay on this version."
                    : "Switch to Client view to approve or request changes."}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
      <footer className="demo-footnote">
        Original fictional artwork · uploads, invitations and external messages
        are disabled · this is a guest demo, separate from real workspaces.
      </footer>
    </main>
  );
}
