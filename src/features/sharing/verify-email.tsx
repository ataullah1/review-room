"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function VerifyInviteEmail() {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div>
      <p>
        Before accepting a new invitation, verify that you can receive email at
        this address. Existing project access is unchanged.
      </p>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const response = await fetch("/auth/verify-email", {
              method: "POST",
            });
            const data = await response.json();
            setMessage(data.message || data.error || "Please try again.");
          } catch {
            setMessage("Could not connect. Please try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Sending…" : "Verify my email"}
      </Button>
      <p role="status">{message}</p>
    </div>
  );
}
