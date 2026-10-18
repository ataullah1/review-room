import { Brand } from "@/components/brand";
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
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
  robots: { index: isProductionDeployment(), follow: isProductionDeployment() },
  openGraph: {
    type: "website",
    images: [
      {
        url: "/brand/social-preview.png",
        width: 1200,
        height: 630,
        alt: "Review Room — a little feedback, a better result. Image pins, version comparison and client approvals.",
      },
    ],
    siteName: "Review Room",
    url: productionOrigin,
    title: "Review Room — Visual Review and Client Approval",
    description:
      "Pinned feedback, version comparison and client approvals for creative projects.",
  },
  twitter: {
    card: "summary_large_image",
    images: [
      {
        url: "/brand/social-preview.png",
        alt: "Review Room visual review and client approval workspace",
      },
    ],
    title: "Review Room",
    description: "Visual review and client approval for creative projects.",
  },
};
const siteIdentity = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${productionOrigin}/#website`,
  name: "Review Room",
  url: productionOrigin,
  inLanguage: "en",
  description:
    "An image review workspace with pinned feedback, version comparison and client approvals.",
};
export default function Page() {
  return (
    <main className="landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(siteIdentity).replace(/</g, "\\u003c"),
        }}
      />
      <header>
        <Link className="capability-brand" href="/">
          <Brand />
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
        <div className="landing-signoff">
          <Brand compact />
          <p>A little feedback. A better result.</p>
        </div>
        <Link href="/signup">Create a workspace →</Link>
      </footer>
    </main>
  );
}
