"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function NotificationPreferences() {
  const [value, setValue] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <details
      onToggle={async (event) => {
        if (!event.currentTarget.open || value !== null || pending) return;
        setPending(true);
        try {
          const response = await fetch("/app/notifications", {
            cache: "no-store",
          });
          if (!response.ok) throw new Error();
          setValue((await response.json()).emailEnabled);
        } catch {
          setMessage("Could not load preferences.");
        } finally {
          setPending(false);
        }
      }}
    >
      <summary>Email notification preferences</summary>
      <p>
        Review updates can be muted. Invitation and account-security emails are
        separate.
      </p>
      {value !== null && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              const response = await fetch("/app/notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emailEnabled: !value }),
              });
              if (!response.ok) throw new Error();
              setValue(!value);
              setMessage("Preference saved.");
            } catch {
              setMessage("Could not save. Please try again.");
            } finally {
              setPending(false);
            }
          }}
        >
          {value ? "Mute review emails" : "Enable review emails"}
        </Button>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
