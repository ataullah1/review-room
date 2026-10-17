"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuthForm({
  mode,
  next,
}: {
  mode: "signup" | "login";
  next?: string;
}) {
  const [error, setError] = useState("");
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
          <Button disabled={pending} type="submit">
            {pending ? "Please wait…" : signup ? "Create account" : "Log in"}
            <ArrowRight size={16} />
          </Button>
        </form>
        <p className="auth-switch">
          {signup ? "Already have an account?" : "New to Review Room?"}{" "}
          <Link href={signup ? "/login" : "/signup"}>
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
