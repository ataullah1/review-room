"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  Plus,
  Minus,
  Maximize,
  MessageCircle,
  Check,
  RotateCcw,
  X,
  Send,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { imagePoint, isPinClick, type ImagePoint } from "./coordinates";
import type { CommentView, ThreadView, ThreadPage } from "./types";
type Draft = ImagePoint & { id: string; body: string };
const merge = (a: CommentView[], b: CommentView[]) =>
  [...new Map([...a, ...b].map((row) => [row.id, row])).values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
export function ReviewWorkspace({
  base,
  versionId,
  imageUrl,
  title,
  width,
  height,
  initial,
  canResolve,
  readOnly,
}: {
  base: string;
  versionId: string;
  imageUrl: string;
  title: string;
  width: number;
  height: number;
  initial: ThreadPage;
  canResolve: boolean;
  readOnly: boolean;
}) {
  const [threads, setThreads] = useState(initial.threads),
    [next, setNext] = useState(initial.next),
    [total, setTotal] = useState(initial.total),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [zoom, setZoom] = useState(1),
    [fit, setFit] = useState(600),
    [imageReady, setImageReady] = useState(false),
    [imageError, setImageError] = useState(false),
    [drawer, setDrawer] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [reply, setReply] = useState({ id: "", body: "" });
  const viewport = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    gesture = useRef<{
      x: number;
      y: number;
      scrollLeft: number;
      scrollTop: number;
      mouse: boolean;
      dragged: boolean;
    } | null>(null);
  const replyDrafts = useRef<Record<string, { id: string; body: string }>>({});
  const endpoint = `${base}/comments?versionId=${encodeURIComponent(versionId)}`;

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = () =>
      setFit(
        Math.max(
          1,
          Math.min(
            node.clientWidth - 48,
            ((node.clientHeight - 48) * width) / height,
          ),
        ),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, [width, height]);
  useEffect(() => {
    if (draft?.id) composer.current?.focus();
  }, [draft?.id]);
  async function request(url: string, body?: unknown) {
    const response = await fetch(url, {
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Please try again.");
    return data;
  }
  function chooseThread(id: string) {
    if (pending) return;
    if (selected) replyDrafts.current[selected] = reply;
    setSelected(id);
    setReply(replyDrafts.current[id] || { id: crypto.randomUUID(), body: "" });
    setDrawer(true);
    setError("");
  }
  function newDraft(point: ImagePoint) {
    if (readOnly || !imageReady || pending) return;
    if (selected) replyDrafts.current[selected] = reply;
    setDraft((previous) =>
      previous
        ? { ...previous, ...point }
        : { ...point, id: crypto.randomUUID(), body: "" },
    );
    setSelected(null);
    setDrawer(true);
    setError("");
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
      return;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
      mouse: event.pointerType === "mouse",
      dragged: false,
    };
    if (event.pointerType === "mouse")
      event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start) return;
    if (!isPinClick(start, { x: event.clientX, y: event.clientY }))
      start.dragged = true;
    if (start.mouse && zoom > 1 && start.dragged) {
      event.currentTarget.scrollLeft =
        start.scrollLeft - (event.clientX - start.x);
      event.currentTarget.scrollTop =
        start.scrollTop - (event.clientY - start.y);
    }
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (
      !start ||
      !surface.current ||
      !isPinClick(start, { x: event.clientX, y: event.clientY }, start.dragged)
    )
      return;
    const point = imagePoint(
      event.clientX,
      event.clientY,
      surface.current.getBoundingClientRect(),
    );
    if (point) newDraft(point);
  }
  async function saveRoot(event: FormEvent) {
    event.preventDefault();
    if (!draft || pending) return;
    setPending(true);
    setError("");
    try {
      const { comment } = await request(endpoint, {
        operation: "create",
        input: draft,
      });
      setThreads((rows) =>
        rows.some((row) => row.id === comment.id)
          ? rows.map((row) =>
              row.id === comment.id ? { ...row, ...comment } : row,
            )
          : [
              ...rows,
              {
                ...comment,
                replies: [],
                replyTotal: 0,
                replyCursor: null,
                moreReplies: false,
              },
            ].sort((a, b) => a.threadNumber! - b.threadNumber!),
      );
      if (!threads.some((row) => row.id === comment.id)) setTotal((n) => n + 1);
      setDraft(null);
      setSelected(comment.id);
      setReply({ id: crypto.randomUUID(), body: "" });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Your draft is still here.",
      );
    } finally {
      setPending(false);
    }
  }
  async function saveReply(event: FormEvent) {
    event.preventDefault();
    if (!selected || pending) return;
    setPending(true);
    setError("");
    try {
      const { comment } = await request(endpoint, {
        operation: "create",
        input: { ...reply, parentId: selected },
      });
      setThreads((rows) =>
        rows.map((row) =>
          row.id === selected
            ? {
                ...row,
                replies: merge(row.replies, [comment]),
                replyTotal:
                  row.replyTotal +
                  (row.replies.some((r) => r.id === comment.id) ? 0 : 1),
              }
            : row,
        ),
      );
      delete replyDrafts.current[selected];
      setReply({ id: crypto.randomUUID(), body: "" });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Your reply is still here.",
      );
    } finally {
      setPending(false);
    }
  }
  async function resolve(root: ThreadView) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const { comment } = await request(endpoint, {
        operation: "resolve",
        id: root.id,
        resolved: !root.resolvedAt,
      });
      setThreads((rows) =>
        rows.map((row) => (row.id === root.id ? { ...row, ...comment } : row)),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update this thread.",
      );
    } finally {
      setPending(false);
    }
  }
  async function moreRoots() {
    setPending(true);
    setError("");
    try {
      const data: ThreadPage = await request(`${endpoint}&after=${next}`);
      setThreads((rows) =>
        [
          ...new Map(
            [...rows, ...data.threads].map((row) => [row.id, row]),
          ).values(),
        ].sort((a, b) => a.threadNumber! - b.threadNumber!),
      );
      setNext(data.next);
      setTotal(data.total);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load threads.",
      );
    } finally {
      setPending(false);
    }
  }
  async function moreReplies(root: ThreadView) {
    setPending(true);
    setError("");
    try {
      const data = await request(
        `${endpoint}&rootId=${root.id}${root.replyCursor ? `&afterReply=${root.replyCursor}` : ""}`,
      );
      setThreads((rows) =>
        rows.map((row) =>
          row.id === root.id
            ? {
                ...row,
                replies: merge(row.replies, data.replies),
                replyCursor: data.next,
                moreReplies: !!data.next,
              }
            : row,
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load replies.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="review-workspace">
      <section className="review-canvas-panel" aria-label="Image review canvas">
        <div className="review-canvas-toolbar">
          <span>
            <MapPin size={14} />
            {readOnly
              ? "Read only · historical or archived"
              : "Click the image to leave feedback"}
          </span>
          <div>
            <button
              aria-label="Zoom out"
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            >
              <Minus size={16} />
            </button>
            <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
            <button
              aria-label="Zoom in"
              disabled={zoom >= 3}
              onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                viewport.current?.scrollTo(0, 0);
              }}
            >
              <Maximize size={14} />
              Fit
            </button>
          </div>
        </div>
        <div
          className={`review-viewport${zoom > 1 ? " can-pan" : ""}`}
          ref={viewport}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            gesture.current = null;
          }}
        >
          <div
            className="review-stage"
            style={{
              width: fit * zoom + 48,
              height: (fit * zoom * height) / width + 48,
            }}
          >
            <div
              className="review-image-surface"
              ref={surface}
              style={{
                width: fit * zoom,
                height: (fit * zoom * height) / width,
              }}
            >
              <Image
                unoptimized
                src={imageUrl}
                alt={title}
                width={width}
                height={height}
                priority
                draggable={false}
                onLoad={() => {
                  setImageReady(true);
                  setImageError(false);
                }}
                onError={() => {
                  setImageReady(false);
                  setImageError(true);
                }}
                referrerPolicy="no-referrer"
              />
              {imageReady &&
                threads.map((root) => (
                  <button
                    key={root.id}
                    className={`review-pin${root.resolvedAt ? " is-resolved" : ""}${selected === root.id ? " is-selected" : ""}`}
                    style={{
                      left: `${root.xRatio! * 100}%`,
                      top: `${root.yRatio! * 100}%`,
                    }}
                    onClick={() => chooseThread(root.id)}
                    aria-label={`Thread ${root.threadNumber}${root.resolvedAt ? ", resolved" : ""}`}
                    aria-pressed={selected === root.id}
                  >
                    {root.threadNumber}
                  </button>
                ))}
              {draft && (
                <span
                  className="review-pin is-draft"
                  style={{
                    left: `${draft.xRatio * 100}%`,
                    top: `${draft.yRatio * 100}%`,
                  }}
                  aria-label="Draft comment position"
                >
                  +
                </span>
              )}
            </div>
          </div>
        </div>
        {imageError && (
          <p className="auth-error" role="alert">
            The image could not load. Refresh to try again.
          </p>
        )}
        <div className="review-canvas-footer">
          <span>
            {width} × {height} px · {zoom > 1 ? "Drag to pan" : "Fit to canvas"}
          </span>
          <Button
            variant="outline"
            disabled={readOnly || !imageReady || pending}
            onClick={() => newDraft({ xRatio: 0.5, yRatio: 0.5 })}
          >
            <Plus size={14} />
            Add comment
          </Button>
          <button
            className="review-mobile-comments"
            onClick={() => setDrawer(true)}
          >
            <MessageCircle size={16} />
            {total}
          </button>
        </div>
      </section>
      <aside
        className={`review-sidebar${drawer ? " is-open" : ""}`}
        aria-label="Image feedback"
      >
        <div className="review-sidebar-heading">
          <div>
            <h2>
              Feedback <span>{total}</span>
            </h2>
            <p>Keep every detail in the conversation.</p>
          </div>
          <button
            className="review-drawer-close"
            aria-label="Close feedback"
            onClick={() => setDrawer(false)}
          >
            <X size={19} />
          </button>
        </div>
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        {draft && (
          <form className="review-composer" onSubmit={saveRoot}>
            <h3>New pinned comment</h3>
            <div className="review-position-controls">
              <label>
                Horizontal position (%)
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={draft.xRatio * 100}
                  disabled={pending}
                  onChange={(event) =>
                    setDraft((d) =>
                      d
                        ? { ...d, xRatio: Number(event.target.value) / 100 }
                        : d,
                    )
                  }
                />
                <output>{Math.round(draft.xRatio * 1000) / 10}%</output>
              </label>
              <label>
                Vertical position (%)
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={draft.yRatio * 100}
                  disabled={pending}
                  onChange={(event) =>
                    setDraft((d) =>
                      d
                        ? { ...d, yRatio: Number(event.target.value) / 100 }
                        : d,
                    )
                  }
                />
                <output>{Math.round(draft.yRatio * 1000) / 10}%</output>
              </label>
            </div>
            <label className="review-text-label">
              Your comment
              <textarea
                ref={composer}
                value={draft.body}
                onChange={(event) =>
                  setDraft((d) => (d ? { ...d, body: event.target.value } : d))
                }
                required
                maxLength={2000}
                rows={4}
                disabled={pending}
                placeholder="What could make this even better?"
              />
            </label>
            <div className="review-composer-actions">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                Cancel
              </button>
              <Button type="submit" disabled={pending || !draft.body.trim()}>
                <Send size={13} />
                {pending ? "Saving…" : "Save comment"}
              </Button>
            </div>
          </form>
        )}
        <div className="review-thread-list">
          {!threads.length && !draft && (
            <div className="review-no-feedback">
              <MessageCircle size={28} />
              <h3>A fresh pair of eyes.</h3>
              <p>
                {readOnly
                  ? "No feedback on this image version."
                  : "Click a detail on the image, or use Add comment to place a pin with your keyboard."}
              </p>
            </div>
          )}
          {threads.map((root) => (
            <article
              key={root.id}
              className={`review-thread${selected === root.id ? " is-active" : ""}`}
            >
              <button
                className="review-thread-select"
                onClick={() => chooseThread(root.id)}
                aria-expanded={selected === root.id}
              >
                <span
                  className={`review-thread-number${root.resolvedAt ? " is-resolved" : ""}`}
                >
                  {root.threadNumber}
                </span>
                <span>
                  <strong>{root.authorName}</strong>
                  <small>
                    {new Date(root.createdAt).toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                    {root.resolvedAt ? " · Resolved" : ""}
                  </small>
                </span>
              </button>
              <p className="review-comment-body">{root.body}</p>
              {selected === root.id && (
                <>
                  <div className="review-replies">
                    {root.replies.map((item) => (
                      <div className="review-reply" key={item.id}>
                        <strong>{item.authorName}</strong>
                        <p className="review-comment-body">{item.body}</p>
                      </div>
                    ))}
                  </div>
                  {root.moreReplies && (
                    <button
                      className="review-load-more"
                      disabled={pending}
                      onClick={() => moreReplies(root)}
                    >
                      Load earlier replies
                    </button>
                  )}
                  {!readOnly && (
                    <form className="review-reply-form" onSubmit={saveReply}>
                      <label className="review-text-label">
                        Reply to thread {root.threadNumber}
                        <textarea
                          value={reply.body}
                          onChange={(event) =>
                            setReply((r) => ({
                              ...r,
                              body: event.target.value,
                            }))
                          }
                          required
                          maxLength={2000}
                          rows={3}
                          disabled={pending}
                          placeholder="Add to the conversation…"
                        />
                      </label>
                      <Button
                        type="submit"
                        disabled={pending || !reply.body.trim()}
                      >
                        {pending ? "Saving…" : "Send reply"}
                        <Send size={13} />
                      </Button>
                    </form>
                  )}
                  {canResolve && !readOnly && (
                    <button
                      className="review-resolve"
                      disabled={pending}
                      onClick={() => resolve(root)}
                    >
                      {root.resolvedAt ? (
                        <RotateCcw size={14} />
                      ) : (
                        <Check size={14} />
                      )}{" "}
                      {root.resolvedAt ? "Reopen thread" : "Resolve thread"}
                    </button>
                  )}
                </>
              )}
              {selected !== root.id && root.replyTotal > 0 && (
                <button
                  className="review-reply-count"
                  onClick={() => chooseThread(root.id)}
                >
                  {root.replyTotal}{" "}
                  {root.replyTotal === 1 ? "reply" : "replies"}
                </button>
              )}
            </article>
          ))}
          {next !== null && (
            <button
              className="review-load-more"
              disabled={pending}
              onClick={moreRoots}
            >
              Load more threads
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
