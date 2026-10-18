"use client";

import Image from "next/image";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  Check,
  CheckCheck,
  MessageSquare,
  MousePointer2,
  Plus,
  RotateCcw,
} from "lucide-react";
import { demoAssets } from "@/features/demo/catalog";
import type { DemoState } from "@/features/demo/state";
import { imagePoint } from "@/features/comments/coordinates";
import { createShowcaseState, showcaseReducer } from "./showcase-state";
import styles from "./marketing.module.css";

export function ReviewShowcase({ seed }: { seed: DemoState }) {
  const [state, dispatch] = useReducer(
    showcaseReducer,
    seed,
    createShowcaseState,
  );
  const [body, setBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const restoreConversationFocus = useRef(false);
  const asset = demoAssets.find((item) => item.id === state.assetId)!;
  const version = asset.versions[state.version - 1];
  const roots = state.comments.filter(
    (comment) =>
      comment.assetId === state.assetId &&
      comment.version === state.version &&
      !comment.parentId,
  );
  const selected = roots.find((comment) => comment.id === state.selectedId);
  const replies = state.comments.filter(
    (comment) => comment.parentId === selected?.id,
  );
  const decision = state.decisions.find(
    (item) => item.assetId === state.assetId && item.version === state.version,
  );
  const approved = decision?.decision === "APPROVED";
  const historical = state.version === 1;
  const designer = state.view === "DESIGNER";
  const changesRequested = decision?.decision === "CHANGES_REQUESTED";

  function switchView(view: "DESIGNER" | "CLIENT") {
    dispatch({ type: "view", view });
    setBody("");
    setReplyBody("");
    setAnnouncement(
      `${view === "DESIGNER" ? "Designer" : "Client"} view. ${view === "DESIGNER" ? "Reply to feedback and resolve threads." : "Leave feedback, request changes or approve the current version."}`,
    );
  }

  useEffect(() => {
    if (state.draft) input.current?.focus();
    else if (restoreConversationFocus.current) {
      conversation.current?.focus();
      restoreConversationFocus.current = false;
    }
  }, [state.draft, state.selectedId]);

  function addPin(event: MouseEvent<HTMLButtonElement>) {
    if (historical) return;
    const point =
      event.detail === 0
        ? { xRatio: 0.5, yRatio: 0.5 }
        : imagePoint(
            event.clientX,
            event.clientY,
            event.currentTarget.getBoundingClientRect(),
          );
    if (point) {
      dispatch({ type: "pin", point });
      setBody("");
      setAnnouncement("Pin placed. Write your sample feedback.");
    }
  }

  function saveComment(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    restoreConversationFocus.current = true;
    dispatch({ type: "comment", id: crypto.randomUUID(), body });
    setBody("");
    setAnnouncement(
      "Your pinned comment was added to this browser preview. Nothing was sent to a server.",
    );
  }

  return (
    <div className={styles.showcase}>
      <div className={styles.showcaseToolbar}>
        <span className={styles.projectBreadcrumb}>
          <span className={styles.projectIcon}>F</span>
          <span>
            Forma studio <span aria-hidden="true">/</span>{" "}
            <strong>Design review</strong>
          </span>
        </span>
        <span className={styles.sampleLabel}>Sample project</span>
      </div>
      <div className={styles.previewRoleBar}>
        <div>
          <span className={styles.fileType}>EXPLORE BOTH SIDES</span>
          <p>
            {designer
              ? "Review the conversation. Reply and resolve the details."
              : "Pin your feedback. Give the next version a clear direction."}
          </p>
        </div>
        <div
          className={styles.previewViewToggle}
          role="group"
          aria-label="Sample project view"
        >
          {(["DESIGNER", "CLIENT"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={state.view === view}
              onClick={() => switchView(view)}
            >
              {view === "DESIGNER" ? "Designer view" : "Client view"}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.showcaseBody}>
        <nav className={styles.assetRail} aria-label="Sample designs">
          <span className={styles.railLabel}>FILES</span>
          {demoAssets.map((item) => (
            <button
              key={item.id}
              aria-label={`Review ${item.title}`}
              aria-pressed={state.assetId === item.id}
              onClick={() => {
                dispatch({ type: "asset", assetId: item.id });
                setBody("");
                setReplyBody("");
                setAnnouncement(`Opened ${item.title}, version 2.`);
              }}
            >
              <Image
                src={item.versions[1].src}
                width={76}
                height={76}
                alt=""
                unoptimized
              />
              <span>
                {item.id === "identity"
                  ? "Identity"
                  : item.id === "journal"
                    ? "Editorial"
                    : "Packaging"}
              </span>
            </button>
          ))}
        </nav>
        <div className={styles.showcaseWorkspace}>
          <div className={styles.canvasHeader}>
            <div>
              <span className={styles.fileType}>{asset.category}</span>
              <h3>{asset.title}</h3>
            </div>
            <label className={styles.versionSelect}>
              <span className={styles.srOnly}>Preview version</span>
              <select
                value={state.version}
                onChange={(event) => {
                  const value = Number(event.target.value) as 1 | 2;
                  dispatch({ type: "version", version: value });
                  setBody("");
                  setReplyBody("");
                  setAnnouncement(
                    `Viewing version ${value}. ${value === 1 ? "Historical version is read only." : "Current version is ready for feedback."}`,
                  );
                }}
              >
                <option value={2}>Version 2 · Current</option>
                <option value={1}>Version 1 · Historical</option>
              </select>
            </label>
          </div>
          <div className={styles.artStage}>
            <div
              className={styles.artSurface}
              style={{
                width: `min(100%, ${(360 * version.width) / version.height}px)`,
              }}
            >
              <Image
                src={version.src}
                width={version.width}
                height={version.height}
                alt={`${asset.title}, original fictional sample, version ${state.version}`}
                unoptimized
                preload={state.assetId === "identity" && state.version === 2}
              />
              <button
                className={styles.artHotspot}
                disabled={historical || state.comments.length >= 40}
                aria-label="Place a sample feedback pin on the image"
                onClick={addPin}
              />
              {roots.map((root) => (
                <button
                  key={root.id}
                  className={`${styles.pin} ${root.id === state.selectedId ? styles.selectedPin : ""}`}
                  style={{
                    left: `${root.xRatio! * 100}%`,
                    top: `${root.yRatio! * 100}%`,
                  }}
                  aria-label={`Open comment ${root.threadNumber}: ${root.body}`}
                  aria-pressed={root.id === state.selectedId}
                  aria-controls="preview-conversation"
                  onClick={() => {
                    dispatch({ type: "select", id: root.id });
                    setReplyBody("");
                    setAnnouncement(`Comment ${root.threadNumber} selected.`);
                  }}
                >
                  {root.threadNumber}
                </button>
              ))}
              {state.draft && (
                <span
                  className={`${styles.pin} ${styles.draftPin}`}
                  style={{
                    left: `${state.draft.xRatio * 100}%`,
                    top: `${state.draft.yRatio * 100}%`,
                  }}
                  aria-hidden="true"
                >
                  <Plus size={16} />
                </span>
              )}
            </div>
          </div>
          <div className={styles.canvasFooter}>
            <span>
              <MousePointer2 size={14} aria-hidden="true" />
              {historical
                ? "Earlier feedback, kept in context"
                : "Click the image to leave a thought"}
            </span>
            <button
              disabled={historical || state.comments.length >= 40}
              onClick={() => {
                dispatch({ type: "pin", point: { xRatio: 0.5, yRatio: 0.5 } });
                setBody("");
                setAnnouncement(
                  "Pin placed at the center. Write your sample feedback.",
                );
              }}
            >
              <Plus size={15} aria-hidden="true" /> Add a pin
            </button>
          </div>
        </div>
        <aside
          className={styles.conversation}
          aria-label="Sample feedback and approval"
        >
          <div className={styles.conversationTitle}>
            <h3>Conversation</h3>
            <span>
              {roots.length} {roots.length === 1 ? "thread" : "threads"}
            </span>
          </div>
          <div
            ref={conversation}
            className={styles.conversationContent}
            id="preview-conversation"
            tabIndex={-1}
          >
            {state.draft ? (
              <form onSubmit={saveComment} className={styles.previewForm}>
                <label htmlFor="preview-comment">
                  Your thought, in the right place.
                </label>
                <p>This comment stays in this page only.</p>
                <textarea
                  ref={input}
                  id="preview-comment"
                  value={body}
                  maxLength={300}
                  required
                  rows={4}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="A little more breathing room, perhaps?"
                />
                <div>
                  <button
                    className={styles.smallPrimary}
                    type="submit"
                    disabled={!body.trim()}
                  >
                    Add feedback <Plus size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      restoreConversationFocus.current = true;
                      dispatch({ type: "cancel" });
                      setBody("");
                      setAnnouncement("Draft cancelled.");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : selected ? (
              <>
                <div className={styles.commentAuthor}>
                  <span className={styles.avatar} aria-hidden="true">
                    {selected.author === "DESIGNER" ? "D" : "C"}
                  </span>
                  <div>
                    <strong>Sample {selected.author.toLowerCase()}</strong>
                    <span>
                      Version {state.version} ·{" "}
                      {selected.resolved ? "Resolved" : "Feedback"}
                    </span>
                  </div>
                  <span className={styles.threadNumber}>
                    #{selected.threadNumber}
                  </span>
                </div>
                <p className={styles.commentBody}>{selected.body}</p>
                {replies.map((reply) => (
                  <div className={styles.sampleReply} key={reply.id}>
                    <strong>Sample {reply.author.toLowerCase()}</strong>
                    <p>{reply.body}</p>
                  </div>
                ))}
                {!historical && (
                  <form
                    className={`${styles.previewForm} ${styles.replyForm}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!replyBody.trim()) return;
                      dispatch({
                        type: "reply",
                        id: crypto.randomUUID(),
                        body: replyBody,
                      });
                      setReplyBody("");
                      setAnnouncement(
                        `Reply added as sample ${state.view.toLowerCase()}. Browser preview only.`,
                      );
                    }}
                  >
                    <label htmlFor="preview-reply">
                      Reply as {designer ? "designer" : "client"}
                    </label>
                    <textarea
                      id="preview-reply"
                      rows={2}
                      maxLength={300}
                      required
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      placeholder={
                        designer
                          ? "Updated in the next revision…"
                          : "Thanks, this is getting closer…"
                      }
                    />
                    <div>
                      <button
                        className={styles.smallPrimary}
                        disabled={
                          !replyBody.trim() || state.comments.length >= 40
                        }
                      >
                        Send reply
                      </button>
                      {designer && (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => {
                            dispatch({ type: "resolve" });
                            setAnnouncement(
                              selected.resolved
                                ? "Thread reopened."
                                : "Thread resolved.",
                            );
                          }}
                        >
                          {selected.resolved
                            ? "Reopen thread"
                            : "Resolve thread"}
                        </button>
                      )}
                    </div>
                  </form>
                )}
                <div className={styles.threadHint}>
                  <MessageSquare size={14} aria-hidden="true" />
                  Attached to the detail. Always.
                </div>
              </>
            ) : (
              <p className={styles.commentBody}>
                Every good conversation starts somewhere. Add a pin to try it.
              </p>
            )}
          </div>
          <div className={styles.approvalPanel}>
            <span className={styles.fileType}>
              {designer ? "CLIENT REVIEW STATUS" : "YOUR REVIEW DECISION"}
            </span>
            <h4>
              {historical
                ? "A little history."
                : approved
                  ? "A clear go-ahead."
                  : changesRequested
                    ? "Another round, with direction."
                    : designer
                      ? "Ready for client review."
                      : "Ready for your review."}
            </h4>
            <p>
              {historical
                ? "Earlier versions stay read only. Switch to version 2 to continue."
                : approved
                  ? "Approved by the sample client, for this version."
                  : changesRequested
                    ? "The sample client requested changes to this version."
                    : designer
                      ? "Respond to feedback, then see the handoff from the client’s side."
                      : "Approve this version or request another round of changes."}
            </p>
            {!historical &&
              (designer ? (
                <button
                  className={styles.approveButton}
                  onClick={() => switchView("CLIENT")}
                >
                  Try client view
                </button>
              ) : (
                <>
                  <button
                    className={`${styles.approveButton} ${approved ? styles.isApproved : ""}`}
                    disabled={approved}
                    onClick={() => {
                      dispatch({ type: "approve" });
                      setAnnouncement(
                        `Version ${state.version} approved in this browser preview only.`,
                      );
                    }}
                  >
                    {approved ? (
                      <CheckCheck size={17} aria-hidden="true" />
                    ) : (
                      <Check size={17} aria-hidden="true" />
                    )}
                    {approved ? "Approved in preview" : "Approve version"}
                  </button>
                  <button
                    className={styles.requestChanges}
                    disabled={changesRequested}
                    onClick={() => {
                      dispatch({ type: "request-changes" });
                      setAnnouncement(
                        `Changes requested for version ${state.version}. Browser preview only.`,
                      );
                    }}
                  >
                    {changesRequested ? "Changes requested" : "Request changes"}
                  </button>
                </>
              ))}
          </div>
        </aside>
      </div>
      <div className={styles.showcaseBottom}>
        <span>
          <span className={styles.liveDot} />
          Interactive preview{" "}
          <span className={styles.previewDisclaimer}>
            · Browser only. No changes are saved.
          </span>
        </span>
        <button
          onClick={() => {
            dispatch({ type: "reset", seed });
            setBody("");
            setReplyBody("");
            setAnnouncement("Preview reset. All sample data restored.");
          }}
        >
          <RotateCcw size={13} aria-hidden="true" /> Reset preview
        </button>
      </div>
      <p
        className={styles.srOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
    </div>
  );
}
