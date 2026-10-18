"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import styles from "./marketing.module.css";

const links = [
  { href: "#product", label: "The product" },
  { href: "#workflow", label: "How it works" },
  { href: "#for-you", label: "Who it’s for" },
  { href: "#faq", label: "FAQs" },
];

export function MarketingNavigation() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      setOpen(false);
      toggle.current?.focus();
    }
  }

  return (
    <header className={styles.navigation} onKeyDown={handleKeyDown}>
      <div className={styles.navigationInner}>
        <Link href="/" aria-label="Review Room home">
          <Brand />
        </Link>
        <nav className={styles.desktopLinks} aria-label="Main navigation">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className={styles.navigationActions}>
          <Link href="/login">Sign in</Link>
          <Link href="/signup" className={styles.navigationCta}>
            Start a review <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <button
            ref={toggle}
            className={styles.menuToggle}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <X size={22} aria-hidden="true" />
            ) : (
              <Menu size={22} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        className={styles.mobileLinks}
        aria-label="Mobile navigation"
        hidden={!open}
      >
        {links.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        ))}
        <Link href="/signup" onClick={() => setOpen(false)}>
          Create your workspace <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
