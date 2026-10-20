"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Palette,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";
import type { PublicDemoAccount } from "@/features/reviewer-demo/config";
import styles from "./demo-accounts.module.css";

const personas = {
  OWNER: {
    name: "Creator",
    description: "Explore projects, collaborators and the review overview.",
    icon: ShieldCheck,
  },
  DESIGNER: {
    name: "Designer",
    description: "Review feedback, compare revisions and respond to clients.",
    icon: Palette,
  },
  CLIENT: {
    name: "Client",
    description: "Pin feedback, request changes and approve designs.",
    icon: MessageSquare,
  },
};

export function DemoAccounts({
  accounts,
  onSelect,
  disabled,
}: {
  accounts: PublicDemoAccount[];
  onSelect: (account: PublicDemoAccount) => void;
  disabled: boolean;
}) {
  const [visible, setVisible] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const [status, setStatus] = useState("");
  async function copy(account: PublicDemoAccount, field: "email" | "password") {
    try {
      await navigator.clipboard.writeText(account[field]);
      setCopied(`${account.role}-${field}`);
      setStatus(`${personas[account.role].name} ${field} copied.`);
    } catch {
      setStatus("Copy unavailable. Select and copy the credential manually.");
    }
  }
  return (
    <section className={styles.section} aria-labelledby="demo-accounts-title">
      <span className={styles.eyebrow}>A WORKSPACE, THREE PERSPECTIVES</span>
      <h2 id="demo-accounts-title">Explore Review Room</h2>
      <p>Choose a demo role and explore how Review Room works.</p>
      <div className={styles.grid}>
        {["OWNER", "DESIGNER", "CLIENT"]
          .map((role) => accounts.find((a) => a.role === role)!)
          .map((account) => {
            const persona = personas[account.role],
              Icon = persona.icon;
            const shown = visible.includes(account.role);
            return (
              <article className={styles.card} key={account.role}>
                <span className={styles.icon}>
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3>{persona.name} Demo</h3>
                <p>{persona.description}</p>
                <div className={styles.credentials}>
                  <span>Email</span>
                  <div>
                    <code>{account.email}</code>
                    <button
                      type="button"
                      aria-label={`Copy ${persona.name} demo email`}
                      onClick={() => copy(account, "email")}
                    >
                      {copied === `${account.role}-email` ? (
                        <Check size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                    </button>
                  </div>
                  <span>Password</span>
                  <div>
                    <code>{shown ? account.password : "••••••••••••"}</code>
                    <button
                      type="button"
                      aria-label={`${shown ? "Hide" : "Show"} ${persona.name} demo password`}
                      aria-pressed={shown}
                      onClick={() =>
                        setVisible(
                          shown
                            ? visible.filter((v) => v !== account.role)
                            : [...visible, account.role],
                        )
                      }
                    >
                      {shown ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      type="button"
                      aria-label={`Copy ${persona.name} demo password`}
                      onClick={() => copy(account, "password")}
                    >
                      {copied === `${account.role}-password` ? (
                        <Check size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  className={styles.tryButton}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelect(account);
                    setStatus(
                      `${persona.name} credentials filled in. Select Log in to continue.`,
                    );
                  }}
                >
                  Try as {persona.name}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </article>
            );
          })}
      </div>
      <p className={styles.notice}>
        Public, shared sample accounts. Please do not enter personal or
        confidential information. Workspace management and invitations are read
        only; uploads and review actions have shared limits. Changes may be
        restored by the demo operator.
      </p>
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
