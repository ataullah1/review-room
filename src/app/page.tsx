import Link from "next/link";
import Image from "next/image";
import { demoAssets } from "@/features/demo/catalog";
import type { Metadata } from "next";
import {
  productionOrigin,
  isProductionDeployment,
} from "@/lib/config/deployment";
export const metadata: Metadata = {
  title: "Review Room — Visual Review and Client Approval",
  description:
    "An image review workspace with pinned feedback, version comparison and client approvals. Explore the interactive demo without signing in.",
  alternates: { canonical: productionOrigin },
  robots: { index: isProductionDeployment(), follow: isProductionDeployment() },
  openGraph: {
    type: "website",
    siteName: "Review Room",
    url: productionOrigin,
    title: "Review Room — Visual Review and Client Approval",
    description:
      "Pinned feedback, version comparison and client approvals for creative projects.",
  },
  twitter: {
    card: "summary",
    title: "Review Room",
    description: "Visual review and client approval for creative projects.",
  },
};
export default function Page() {
  return (
    <main className="landing">
      <header>
        <Link className="capability-brand" href="/">
          review room.
        </Link>
        <Link href="/login">Sign in →</Link>
      </header>
      <section className="landing-hero">
        <span className="eyebrow">A LITTLE SPACE FOR BETTER FEEDBACK</span>
        <h1>
          Good work gets better
          <br />
          when feedback finds its place.
        </h1>
        <p>
          Pin a thought to the right detail. Keep every version in context. Give
          your next creative project a calmer place to be reviewed.
        </p>
        <div>
          <Link className="landing-primary" href="/demo">
            Try demo →
          </Link>
          <Link className="landing-secondary" href="/app">
            Open your workspace
          </Link>
        </div>
        <small>
          No login needed for the demo. Your sample changes stay in your own
          guest session.
        </small>
      </section>
      <section className="landing-designs" aria-label="Original sample designs">
        {demoAssets.map((a) => (
          <Link key={a.id} href="/demo">
            <div>
              <Image
                unoptimized
                src={a.versions[1].src}
                width={a.versions[1].width}
                height={a.versions[1].height}
                alt={a.title}
              />
            </div>
            <h2>{a.title}</h2>
            <p>{a.category} · original demo artwork</p>
          </Link>
        ))}
      </section>
      <section className="landing-steps">
        <div>
          <span>01</span>
          <h2>Leave it on the detail.</h2>
          <p>Image pins and threaded replies make feedback easy to follow.</p>
        </div>
        <div>
          <span>02</span>
          <h2>Keep the versions together.</h2>
          <p>Compare changes without losing the earlier conversation.</p>
        </div>
        <div>
          <span>03</span>
          <h2>Know the next step.</h2>
          <p>
            Individual client decisions and project activity keep the work
            moving.
          </p>
        </div>
      </section>
      <footer>
        review room. · A little feedback. A better result.
        <Link href="/signup">Create a workspace →</Link>
      </footer>
    </main>
  );
}
