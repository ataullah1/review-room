"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VersionPage, VersionView } from "./types";
import { Button } from "@/components/ui/button";

function versionLabel(version: VersionView) {
  const uploadedAt = new Date(version.createdAt).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return `Version ${version.versionNumber} · ${version.uploader} · ${uploadedAt} UTC`;
}

export function VersionControls({
  base,
  currentId,
  selected,
  initial,
  comparison,
}: {
  base: string;
  currentId: string;
  selected: VersionView;
  initial: VersionPage;
  comparison?: VersionView;
}) {
  const [versions, setVersions] = useState(
      [
        ...new Map(
          [
            ...initial.versions,
            selected,
            ...(comparison ? [comparison] : []),
          ].map((v) => [v.id, v]),
        ).values(),
      ].sort((a, b) => b.versionNumber - a.versionNumber),
    ),
    [next, setNext] = useState(initial.next),
    [compare, setCompare] = useState(
      comparison?.id ||
        initial.versions.find((v) => v.id !== selected.id)?.id ||
        "",
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function loadOlderVersions() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${base}/versions?before=${next}`, {
          cache: "no-store",
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setVersions((rows) =>
        [
          ...new Map(
            [...rows, ...data.versions].map((v) => [v.id, v]),
          ).values(),
        ].sort((a, b) => b.versionNumber - a.versionNumber),
      );
      setNext(data.next);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load versions.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="version-controls">
      <div>
        <label htmlFor="review-version">Viewing version</label>
        <select
          id="review-version"
          value={selected.id}
          onChange={(e) => router.push(`${base}?versionId=${e.target.value}`)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {versionLabel(v)}
              {v.id === currentId ? " · Current" : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="compare-version">Compare with</label>
        <select
          id="compare-version"
          value={compare}
          onChange={(e) => setCompare(e.target.value)}
        >
          <option value="">Choose a version</option>
          {versions
            .filter((v) => v.id !== selected.id)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {versionLabel(v)}
              </option>
            ))}
        </select>
      </div>
      <Button
        variant="outline"
        disabled={!compare || compare === selected.id}
        onClick={() =>
          router.push(`${base}?versionId=${selected.id}&compareId=${compare}`)
        }
      >
        Compare versions
      </Button>
      {comparison && (
        <Link
          className="version-text-link"
          href={`${base}?versionId=${selected.id}`}
        >
          Back to comments
        </Link>
      )}
      {next && (
        <button
          className="version-text-link"
          disabled={pending}
          onClick={loadOlderVersions}
        >
          {pending ? "Loading…" : "Load older versions"}
        </button>
      )}
      {selected.id !== currentId && (
        <p className="version-historical">
          Historical version · read only.{" "}
          <Link href={`${base}?versionId=${currentId}`}>
            Open current version
          </Link>
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
