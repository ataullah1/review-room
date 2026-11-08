import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found — Review Room",
};

export default function NotFound() {
  return (
    <main className="route-not-found">
      <Link href="/" aria-label="Review Room home">
        <Brand />
      </Link>
      <span className="eyebrow">404 / PAGE NOT FOUND</span>
      <h1>This room isn’t here.</h1>
      <p>The link may have expired, been revoked, or moved somewhere else.</p>
      <div className="route-not-found-actions">
        <Button asChild>
          <Link href="/app">Open workspaces</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </main>
  );
}
