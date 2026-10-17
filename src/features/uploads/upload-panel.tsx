"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  CheckCircle2,
  X,
  RefreshCw,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    [error, setError] = useState("");
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
      setStage("success");
      setFile(null);
      if (input.current) input.current.value = "";
      if (assetId)
        router.push(
          `/app/${workspaceId}/projects/${projectId}/assets/${assetId}?versionId=${saved.versionId}`,
        );
      router.refresh();
    } catch (error) {
      const cancellation = job.versionId
        ? await post("cancel", { versionId: job.versionId }).catch(() => null)
        : null;
      if (active.current !== job) return;
      if (cancellation?.cancelled === false) {
        setStage("success");
        setFile(null);
        router.refresh();
        return;
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
