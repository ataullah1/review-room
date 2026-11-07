"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  CheckCircle2,
  X,
  RefreshCw,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadStatus } from "@/lib/data/uploads";
import { uploadInput } from "./validation";
type Stage =
  | "idle"
  | "preparing"
  | "uploading"
  | "checking"
  | "success"
  | "failed"
  | "cancelled";
export function UploadPanel({
  workspaceId,
  projectId,
  assetId,
}: {
  workspaceId: string;
  projectId: string;
  assetId?: string;
}) {
  const [file, setFile] = useState<File | null>(null),
    [stage, setStage] = useState<Stage>("idle"),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState<UploadStatus | null>(null);
  const active = useRef<{
      xhr?: XMLHttpRequest;
      controller?: AbortController;
      versionId?: string;
      cancelled: boolean;
    }>({ cancelled: false }),
    router = useRouter(),
    input = useRef<HTMLInputElement>(null);
  const busy = ["preparing", "uploading", "checking"].includes(stage);
  const base = `/app/${workspaceId}/projects/${projectId}/uploads`;
  const recoveryKey = `review-room:upload:${workspaceId}:${projectId}:${assetId || "new"}`;
  function remember(versionId?: string) {
    try {
      if (versionId) sessionStorage.setItem(recoveryKey, versionId);
      else sessionStorage.removeItem(recoveryKey);
    } catch {
      /* Server status remains authoritative. */
    }
  }
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const id = sessionStorage.getItem(recoveryKey);
        if (!id) return;
        const response = await fetch(
          `${base}/status?versionId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!stopped && response.ok) setRecovery(data.upload);
        if ([403, 404].includes(response.status))
          sessionStorage.removeItem(recoveryKey);
      } catch {
        /* User can explicitly check again after a network failure. */
      }
    };
    void load();
    return () => {
      stopped = true;
    };
  }, [base, recoveryKey]);
  async function checkPrevious(versionId: string) {
    const response = await fetch(
      `${base}/status?versionId=${encodeURIComponent(versionId)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not check upload status.");
    setRecovery(data.upload);
    return data.upload as UploadStatus;
  }
  async function recoverUpload(finalize: boolean) {
    if (!recovery || busy) return;
    setStage("checking");
    setError("");
    try {
      const saved = finalize
        ? await post("finalize", { versionId: recovery.versionId })
        : await checkPrevious(recovery.versionId);
      if (finalize || saved.status === "READY") {
        remember();
        setRecovery(null);
        setStage("success");
        router.refresh();
      } else setStage("idle");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not recover upload.",
      );
      setStage("failed");
    }
  }
  async function post(operation: string, body: unknown, signal?: AbortSignal) {
    const response = await fetch(`${base}/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Upload failed. Please try again.");
    return data;
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const parsed = uploadInput.safeParse({
      name: selected.name,
      mimeType: selected.type,
      size: selected.size,
    });
    if (!parsed.success) {
      setError("Choose a JPG, PNG or static WebP of 10 MB or less.");
      setFile(null);
      setStage("failed");
      return;
    }
    setFile(selected);
    setError("");
    setStage("idle");
    setProgress(0);
  }
  async function upload() {
    if (!file || busy) return;
    setError("");
    setProgress(0);
    setStage("preparing");
    const job: {
      xhr?: XMLHttpRequest;
      controller?: AbortController;
      versionId?: string;
      cancelled: boolean;
    } = { cancelled: false, controller: new AbortController() };
    active.current = job;
    try {
      const prepared = await post("prepare", {
        assetId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      });
      job.versionId = prepared.versionId;
      remember(prepared.versionId);
      if (job.cancelled) {
        await post("cancel", { versionId: prepared.versionId });
        return;
      }
      setStage("uploading");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        job.xhr = xhr;
        xhr.open("PUT", prepared.uploadUrl);
        xhr.timeout = 120000;
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && active.current === job)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(
                new Error("Could not upload this file. Please try again."),
              );
        xhr.onerror = () =>
          reject(new Error("Connection lost. Please try again."));
        xhr.ontimeout = () =>
          reject(new Error("Upload timed out. Please try again."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.send(file);
      });
      if (job.cancelled || active.current !== job) return;
      setStage("checking");
      const saved = await post(
        "finalize",
        { versionId: prepared.versionId },
        job.controller?.signal,
      );
      if (job.cancelled || active.current !== job) return;
      remember();
      setRecovery(null);
      setStage("success");
      setFile(null);
      if (input.current) input.current.value = "";
      if (assetId)
        router.push(
          `/app/${workspaceId}/projects/${projectId}/assets/${assetId}?versionId=${saved.versionId}`,
        );
      router.refresh();
    } catch (error) {
      if (active.current !== job) return;
      if (job.versionId && !job.cancelled) {
        const status = await checkPrevious(job.versionId).catch(() => null);
        if (status?.status === "READY") {
          remember();
          setRecovery(null);
          setStage("success");
          setFile(null);
          router.refresh();
          return;
        }
      }
      if (job.cancelled) {
        setStage("cancelled");
        return;
      }
      setError(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
      setStage("failed");
    }
  }
  function cancel() {
    const job = active.current;
    job.cancelled = true;
    job.xhr?.abort();
    job.controller?.abort();
    if (job.versionId)
      void post("cancel", { versionId: job.versionId })
        .then((result) => {
          if (result.cancelled === false && active.current === job) {
            setStage("success");
            setFile(null);
            router.refresh();
          }
        })
        .catch(() => undefined);
    remember();
    setRecovery(null);
    setStage("cancelled");
    setError("");
  }
  return (
    <section
      className="upload-panel"
      aria-label={assetId ? "Upload a new version" : "Upload an image"}
      aria-busy={busy}
    >
      <div className="upload-panel-heading">
        <span className="project-folder">
          <ImagePlus size={22} />
        </span>
        <div>
          <h2>
            {assetId
              ? "A fresh version, same conversation."
              : "Add your first impression."}
          </h2>
          <p>
            JPG, PNG or static WebP · up to 10 MB · 20 MP · 8192 px per side
          </p>
        </div>
      </div>
      {recovery && (
        <div className="project-notice" role="status">
          <strong>Previous upload: {recovery.originalName}</strong>
          <p>
            {recovery.status === "READY"
              ? "This image was already published."
              : recovery.status === "PROCESSING"
                ? "Your image is still being checked. Check its status before starting again."
                : recovery.nextAction === "restart"
                  ? recovery.failureReason || "Start a fresh upload."
                  : "An upload was interrupted. Retry checking it if the file finished uploading."}
          </p>
          <div className="upload-actions">
            {recovery.canRetry && (
              <Button disabled={busy} onClick={() => void recoverUpload(true)}>
                Retry checking image
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void recoverUpload(false)}
            >
              Check status
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (recovery.canCancel) {
                  try {
                    await post("cancel", { versionId: recovery.versionId });
                  } catch {
                    setError("Could not cancel. Check status and try again.");
                    return;
                  }
                }
                remember();
                setRecovery(null);
              }}
            >
              Dismiss{recovery.canCancel ? " and cancel" : ""}
            </Button>
          </div>
        </div>
      )}
      <label className={`upload-dropzone${busy ? " is-busy" : ""}`}>
        <UploadCloud size={24} />
        <strong>{file?.name || "Choose an image to upload"}</strong>
        <span>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready to upload`
            : "One image at a time. Your files stay private."}
        </span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={choose}
        />
      </label>
      {busy && (
        <div className="upload-progress" role="status" aria-live="polite">
          <div>
            <span>
              {stage === "preparing"
                ? "Preparing a private upload…"
                : stage === "checking"
                  ? "Checking your image…"
                  : "Uploading your image…"}
            </span>
            <span>{stage === "uploading" ? `${progress}%` : ""}</span>
          </div>
          <progress
            max="100"
            value={stage === "uploading" ? progress : undefined}
          />
        </div>
      )}
      {stage === "success" && (
        <p className="project-success" role="status">
          <CheckCircle2 size={16} />
          {assetId
            ? "New version published. Client review is required again."
            : "Image uploaded. It’s ready to view below."}
        </p>
      )}
      {stage === "cancelled" && (
        <p className="upload-cancelled" role="status">
          Upload stopped. Refresh to check if it had already finished, or try
          again.
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="upload-actions">
        {busy ? (
          <Button variant="outline" onClick={cancel}>
            <X size={15} />
            Cancel upload
          </Button>
        ) : (
          <Button disabled={!file} onClick={upload}>
            {stage === "failed" || stage === "cancelled" ? (
              <RefreshCw size={15} />
            ) : (
              <UploadCloud size={15} />
            )}{" "}
            {stage === "failed" || stage === "cancelled"
              ? "Try upload again"
              : assetId
                ? "Upload new version"
                : "Upload image"}
          </Button>
        )}
      </div>
    </section>
  );
}
