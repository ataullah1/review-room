"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuthForm({
  mode,
  next,
  initialError = "",
}: {
  mode: "signup" | "login";
  next?: string;
  initialError?: string;
}) {
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const signup = mode === "signup";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          ...(signup ? { displayName: form.get("displayName") } : {}),
          next,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Please try again.");
        setPending(false);
        return;
      }
      window.location.assign(data.redirectTo);
    } catch {
      setError("Could not connect. Please try again.");
      setPending(false);
    }
  }
  async function google() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/auth/google", {
        method: "POST",
        headers: { "x-review-return-to": next || "/app" },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not start Google sign-in.");
      window.location.assign(data.redirectTo);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not connect. Please try again.",
      );
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-intro">
        <Link className="brand" href="/">
          <span className="brandmark">
            <MessageCircle size={20} />
          </span>
          review room<span className="branddot">.</span>
        </Link>
        <div>
          <span className="eyebrow">LESS BACK-AND-FORTH. BETTER WORK.</span>
          <h1>
            A fresh perspective
            <br />
            starts here.
          </h1>
          <p>
            One space for your work, your team, and the conversations that move
            it forward.
          </p>
        </div>
        <span className="auth-flower" aria-hidden="true">
          ✳
        </span>
        <small>A little feedback goes a long way.</small>
      </section>
      <main className="auth-card">
        <span className="eyebrow">YOUR CREATIVE WORKSPACE</span>
        <h1>{signup ? "Make room for better work." : "Welcome back."}</h1>
        <p>
          {signup
            ? "Create your account and go straight to your workspace."
            : "Log in to pick up where you left off."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="auth-google-button"
          disabled={pending}
          onClick={google}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 48 48"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="#4285F4"
              d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.17v5.13h6.61c3.87-3.56 6.08-8.8 6.08-14.8Z"
            />
            <path
              fill="#34A853"
              d="M24 44c5.51 0 10.13-1.83 13.53-4.94l-6.61-5.13c-1.83 1.23-4.18 1.97-6.92 1.97-5.32 0-9.83-3.59-11.44-8.42H5.73v5.29A20 20 0 0 0 24 44Z"
            />
            <path
              fill="#FBBC05"
              d="M12.56 27.48a12 12 0 0 1 0-7.66v-5.29H5.73a20 20 0 0 0 0 18.24l6.83-5.29Z"
            />
            <path
              fill="#EA4335"
              d="M24 12.1c3 0 5.68 1.03 7.8 3.06l5.85-5.85C34.12 6.03 29.51 4 24 4A20 20 0 0 0 5.73 14.53l6.83 5.29C14.17 15.69 18.68 12.1 24 12.1Z"
            />
          </svg>
          <span>Continue with Google</span>
        </Button>
        <div className="auth-divider">
          <span>or continue with email</span>
        </div>
        <form onSubmit={submit} aria-busy={pending}>
          {signup && (
            <label>
              Your name
              <input
                name="displayName"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="Alex Morgan"
                disabled={pending}
              />
            </label>
          )}
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
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 10 : 1}
              maxLength={128}
              placeholder={signup ? "At least 10 characters" : "Your password"}
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
            <span>
              {pending ? "Please wait…" : signup ? "Create account" : "Log in"}
            </span>
            <ArrowRight size={16} />
          </Button>
        </form>
        <p className="auth-switch">
          {signup ? "Already have an account?" : "New to Review Room?"}{" "}
          <Link
            href={`${signup ? "/login" : "/signup"}${next === "/invite/accept" ? "?next=%2Finvite%2Faccept" : ""}`}
          >
            {signup ? "Log in" : "Create an account"}
          </Link>
        </p>
        <Link className="auth-demo-link" href="/">
          Explore the sample workspace <ArrowRight size={13} />
        </Link>
      </main>
    </div>
  );
}
export function SessionButton({
  operation = "logout",
}: {
  operation?: "logout" | "bootstrap";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/auth/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Please try again.");
        setPending(false);
        return;
      }
      window.location.assign(data.redirectTo);
    } catch {
      setError("Could not connect. Please try again.");
      setPending(false);
    }
  }
  return (
    <div>
      <Button variant="outline" disabled={pending} onClick={submit}>
        {pending
          ? "Please wait…"
          : operation === "logout"
            ? "Log out"
            : "Finish workspace setup"}
      </Button>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
