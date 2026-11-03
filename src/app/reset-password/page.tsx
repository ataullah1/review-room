import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth/user";
import { isExistingDemoEmail } from "@/features/reviewer-demo/config";
import { ResetPasswordForm } from "@/components/auth/recovery-forms";

export const metadata: Metadata = {
  title: "Reset password — Review Room",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const user = await requireUser().catch(() => null);

  if (!user) {
    return (
      <div className="auth-page">
        <section className="auth-intro">
          <Link className="brand" href="/">
            <Brand />
          </Link>
          <div>
            <span className="eyebrow">RECOVERY LINK EXPIRED</span>
            <h1>Link unavailable</h1>
            <p>
              Your password reset session has expired or is invalid. Please
              request a fresh link to reset your password.
            </p>
          </div>
          <span className="auth-flower" aria-hidden="true">
            ✳
          </span>
          <small>A little feedback goes a long way.</small>
        </section>

        <main className="auth-card">
          <span className="eyebrow">SESSION EXPIRED</span>
          <h1>Reset link expired</h1>
          <p>
            This password recovery link is no longer valid. Password reset links
            expire quickly for security reasons.
          </p>
          <div style={{ marginTop: "24px" }}>
            <Link className="auth-submit-button" href="/forgot-password">
              <span>Request a new link</span>
            </Link>
          </div>
          <p className="auth-switch">
            Remember your password? <Link href="/login">Sign in</Link>
          </p>
        </main>
      </div>
    );
  }

  if (isExistingDemoEmail(user.email)) {
    return (
      <div className="auth-page">
        <section className="auth-intro">
          <Link className="brand" href="/">
            <Brand />
          </Link>
          <div>
            <span className="eyebrow">DEMO ACCOUNT PROTECTED</span>
            <h1>Not allowed</h1>
            <p>
              Public demo accounts have fixed credentials and their passwords
              cannot be reset.
            </p>
          </div>
          <span className="auth-flower" aria-hidden="true">
            ✳
          </span>
          <small>A little feedback goes a long way.</small>
        </section>

        <main className="auth-card">
          <span className="eyebrow">ACCESS RESTRICTED</span>
          <h1>Demo account</h1>
          <p>
            Public reviewer demo accounts cannot change passwords. Please sign
            in with your personal account to manage credentials.
          </p>
          <p className="auth-switch" style={{ marginTop: "24px" }}>
            <Link href="/login">Back to sign in</Link>
          </p>
        </main>
      </div>
    );
  }

  return <ResetPasswordForm />;
}

