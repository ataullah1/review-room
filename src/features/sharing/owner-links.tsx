"use client";
import { useCallback, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
type Row = {
  id: string;
  email?: string;
  role?: string;
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt?: string | null;
};
export function OwnerLinks({
  endpoint,
  kind,
  versionId,
  disabled = false,
}: {
  endpoint: string;
  kind: "invite" | "share";
  versionId?: string;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [link, setLink] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [now, setNow] = useState(0);
  const load = useCallback(async () => {
    try {
      const response = await fetch(
          `${endpoint}${versionId ? `?versionId=${versionId}` : ""}`,
          { cache: "no-store" },
        ),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.invitations || data.shares);
      setNow(Date.now());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load links.",
      );
    }
  }, [endpoint, versionId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setCopied(false);
    setLink("");
    try {
      const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "create",
            ...(kind === "invite"
              ? { email: form.get("email"), role: form.get("role") }
              : { versionId }),
          }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLink(`${window.location.origin}/${kind}#${data.token}`);
      await load();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not create this link.",
      );
    } finally {
      setPending(false);
    }
  }
  async function revoke(id: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "revoke", id, versionId }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLink("");
      await load();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not revoke this link.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <details
      className="owner-links"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>
        {kind === "invite"
          ? "Invite someone to this project"
          : "Share this version · read only"}
      </summary>
      <p>
        {kind === "invite"
          ? "Invite a designer or client by email. Links expire in 7 days. Copy and send the link yourself. Revoking an invitation stops acceptance; remove existing access with Project people."
          : "Anyone with this link can read this version and its comments for 24 hours. They cannot comment, approve or open other projects."}
      </p>
      {!disabled && (
        <form onSubmit={create} className="owner-link-form">
          {kind === "invite" && (
            <>
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  disabled={pending}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                Project role
                <select name="role" disabled={pending}>
                  <option value="CLIENT">Client</option>
                  <option value="DESIGNER">Designer</option>
                </select>
              </label>
            </>
          )}
          <Button type="submit" disabled={pending}>
            {pending
              ? "Working…"
              : kind === "invite"
                ? "Create invitation"
                : "Create share link"}
          </Button>
        </form>
      )}
      {link && (
        <div className="owner-copy-link">
          <label>
            Copy this link now
            <input
              aria-label="Generated link"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setError("Select and copy the link above.");
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <p>
            The full link is shown once. It cannot be recovered from the saved
            record.
          </p>
        </div>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <div>
              <strong>{row.email || "Read-only version link"}</strong>
              <span>
                {row.role ? `${row.role.toLowerCase()} · ` : ""}
                {row.revokedAt
                  ? "Revoked"
                  : row.acceptedAt
                    ? "Accepted"
                    : new Date(row.expiresAt).getTime() < now
                      ? "Expired"
                      : `Expires ${new Date(row.expiresAt).toLocaleDateString("en", { timeZone: "UTC" })}`}
              </span>
            </div>
            {!row.revokedAt && (
              <button
                disabled={pending}
                type="button"
                onClick={() => revoke(row.id)}
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      {!rows.length && <p>No links created yet.</p>}
    </details>
  );
}
