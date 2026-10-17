"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function AcceptInvitation() {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function accept() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/invite/decision", { method: "POST" }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.assign(data.redirectTo);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not accept this invitation.",
      );
      setPending(false);
    }
  }
  return (
    <div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <Button onClick={accept} disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
