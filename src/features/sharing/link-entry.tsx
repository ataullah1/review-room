"use client";
import { useEffect, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
export function LinkEntry({ kind }: { kind: "invite" | "share" }) {
  const token = useRef(""),
    started = useRef(false),
    [error, setError] = useState("");
  const open = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/${kind}/access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.current }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.replace(data.redirectTo);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not open this link.",
      );
    }
  }, [kind]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = window.location.hash.slice(1);
    history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      if (!/^[a-f0-9]{64}$/.test(token.current)) {
        setError("This link is incomplete. Ask the owner for the full link.");
        return;
      }
      void open();
    });
  }, [open]);
  return (
    <main className="capability-entry">
      <span className="capability-brand">review room.</span>
      <h1>
        {kind === "invite" ? "A place on the project." : "A closer look."}
      </h1>
      <p>{error || "Opening your private link…"}</p>
      {error && <Button onClick={open}>Try again</Button>}
    </main>
  );
}
