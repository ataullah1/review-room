"use client";

import { Brand } from "@/components/brand";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    setPending(true);
    setError("");

    try {
      const response = await fetch("/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not process request. Please try again.");
        setPending(false);
        return;
      }
      setSubmittedEmail(email);
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <Link className="brand" href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">ACCOUNT RECOVERY</span>
          <h1>
            Get back to
            <br />
            your workspace.
          </h1>
          <p>
            We will send you a secure link to reset your password and recover
            access to your projects.
          </p>
        </div>
        <span className="auth-flower" aria-hidden="true">
          ✳
        </span>
        <small>A little feedback goes a long way.</small>
      </section>

      <main className="auth-card">
        <span className="eyebrow">PASSWORD ASSISTANCE</span>
        <h1>Forgot password?</h1>
        <p>
          Enter the email address associated with your account and we’ll send
          you a link to reset your password.
        </p>

        {submittedEmail ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              marginTop: "20px",
            }}
          >
            <div
              className="auth-error"
              style={{ background: "#edf2e8", color: "#4e6741" }}
              role="status"
            >
              If an account exists for <strong>{submittedEmail}</strong>,
              instructions to reset your password have been sent. Please check
              your inbox.
            </div>
            <p className="auth-switch">
              Remember your password? <Link href="/login">Sign in</Link>
            </p>
          </div>
        ) : (
          <form ref={formRef} onSubmit={submit} aria-busy={pending}>
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@studio.com"
                disabled={pending}
              />
            </label>
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            <Button
              className="auth-submit-button"
              disabled={pending}
              type="submit"
            >
              <span>{pending ? "Sending link…" : "Send reset link"}</span>
              <ArrowRight size={16} />
            </Button>
            <p className="auth-switch">
              Remember your password? <Link href="/login">Sign in</Link>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

export function ResetPasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not update password. Please try again.");
        setPending(false);
        return;
      }
      window.location.assign(data.redirectTo || "/login?reset=success");
    } catch {
      setError("Could not connect. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <Link className="brand" href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">NEW PASSWORD</span>
          <h1>
            Secure your
            <br />
            account.
          </h1>
          <p>
            Choose a strong new password to protect your creative projects and
            client feedback.
          </p>
        </div>
        <span className="auth-flower" aria-hidden="true">
          ✳
        </span>
        <small>A little feedback goes a long way.</small>
      </section>

      <main className="auth-card">
        <span className="eyebrow">SET NEW PASSWORD</span>
        <h1>Create a new password</h1>
        <p>Enter a secure password of at least 10 characters.</p>

        <form ref={formRef} onSubmit={submit} aria-busy={pending}>
          <label>
            New password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              placeholder="At least 10 characters"
              disabled={pending}
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              placeholder="Repeat your new password"
              disabled={pending}
            />
          </label>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <Button
            className="auth-submit-button"
            disabled={pending}
            type="submit"
          >
            <span>{pending ? "Updating password…" : "Update password"}</span>
            <ArrowRight size={16} />
          </Button>
          <p className="auth-switch">
            Need a new reset link?{" "}
            <Link href="/forgot-password">Request reset link</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
