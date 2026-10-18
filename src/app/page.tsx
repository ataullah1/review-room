import { Brand } from "@/components/brand";
import Link from "next/link";
import Image from "next/image";
import { demoAssets } from "@/features/demo/catalog";
import localFont from "next/font/local";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  GitCompareArrows,
  Layers,
  Link2,
  LockKeyhole,
  MessageSquare,
  Minus,
  MousePointer2,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  UserRound,
} from "lucide-react";
import { seededDemo } from "@/features/demo/state";
import { MarketingNavigation } from "@/features/marketing/navigation";
import { ReviewShowcase } from "@/features/marketing/review-showcase";
import styles from "@/features/marketing/marketing.module.css";

import type { Metadata } from "next";
import {
  productionOrigin,
  isProductionDeployment,
} from "@/lib/config/deployment";

const headingFont = localFont({
  src: "../../public/fonts/manrope-latin-variable.woff2",
  variable: "--marketing-heading",
  display: "swap",
  weight: "200 800",
});

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
const questions = [
  {
    question: "Can I try it without creating an account?",
    answer:
      "Yes. The interactive preview above runs entirely in your browser. For a longer walkthrough, Try demo opens an isolated, 24-hour guest workspace with three sample designs. You only need an account when you want to create your own workspace and upload real work.",
  },
  {
    question: "What can I upload for review?",
    answer:
      "Review Room supports JPG, PNG and WebP images up to 10 MB, subject to image dimension limits. It is built for visual design review: brand identities, editorial layouts, campaign artwork and packaging. Video and PDF annotation are outside the current scope.",
  },
  {
    question: "What happens when I upload a new version?",
    answer:
      "The earlier file, its comments and client decisions stay attached to that version. Historical versions are read only. A new version gets its own feedback and needs a fresh client review; an earlier approval does not silently carry forward.",
  },
  {
    question: "Who can see my projects and files?",
    answer:
      "Workspace owners can see their workspace’s projects. Designers and clients see projects assigned to them. Images are stored in a private bucket and served through access-checked requests. A deliberately created share link exposes only one selected version and its read-only feedback.",
  },
  {
    question: "How do invitations and share links work?",
    answer:
      "An owner creates an email-bound project invitation or an expiring, read-only version link, then copies and sends it. Review Room does not send invitation emails automatically. Invitations require a matching confirmed identity. Revoking a share stops new access; any original download URL already issued remains usable until its short expiry.",
  },
  {
    question: "Does one approval mean the whole project is signed off?",
    answer:
      "Each assigned client records their own decision on a specific image version. Review Room keeps those decisions separate, so you can see who approved and who requested changes. It does not turn one person’s approval into a project-wide sign-off.",
  },
];

export default function Page() {
  return (
    <div className={`${headingFont.variable} ${styles.page}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(siteIdentity).replace(/</g, "\\u003c"),
        }}
      />
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <MarketingNavigation />
      <main id="main-content" tabIndex={-1}>
        <section
          id="home-intro"
          className={`${styles.hero} ${styles.container}`}
          aria-labelledby="home-title"
        >
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />A little space for better
            feedback
          </p>
          <h1 id="home-title">
            <span>Good work gets better</span> when feedback{" "}
            <em>finds its place.</em>
          </h1>
          <p className={styles.heroDescription}>
            Pin a thought to the right detail. Keep every revision in context.
            Give good work a calmer way to move forward.
          </p>
          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primaryButton}>
              Create your workspace{" "}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <a href="#product" className={styles.secondaryButton}>
              Take a closer look <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <p className={styles.heroNote}>
            A small preview below. No sign-up, no setup, just a little feedback.
          </p>
        </section>

        <section
          id="product"
          className={`${styles.productSection} ${styles.container}`}
          aria-labelledby="product-title"
        >
          <div className={styles.showcaseCaption}>
            <h2 id="product-title">A good conversation starts here.</h2>
            <span>
              <MousePointer2 size={14} aria-hidden="true" />
              Go on. Try a pin.
            </span>
          </div>
          <ReviewShowcase seed={seededDemo()} />
          <ul className={styles.productValues}>
            <li>
              <MessageSquare size={15} aria-hidden="true" />
              Feedback on the detail
            </li>
            <li>
              <Layers size={15} aria-hidden="true" />
              Every version in context
            </li>
            <li>
              <CheckCheck size={15} aria-hidden="true" />A clear next step
            </li>
          </ul>
        </section>

        <section
          className={`${styles.story} ${styles.container}`}
          aria-labelledby="story-title"
        >
          <div className={styles.storyIntro}>
            <div>
              <p className={styles.eyebrow}>
                For the work between the messages
              </p>
              <h2 id="story-title" className={styles.sectionHeading}>
                Less “which file?”
                <br />
                More <em>“this detail.”</em>
              </h2>
            </div>
            <p>
              Good feedback gets lost in busy inboxes. A screenshot here,
              another revision there, and a “looks great” that could mean
              anything. Bring the work and the conversation back together.
            </p>
          </div>
          <div className={styles.storyColumns}>
            <div className={styles.storyColumn}>
              <h3>The scattered way</h3>
              <ul>
                <li>
                  <Minus size={15} aria-hidden="true" />A comment with no clear
                  image reference.
                </li>
                <li>
                  <Minus size={15} aria-hidden="true" />
                  The latest file, buried in a message thread.
                </li>
                <li>
                  <Minus size={15} aria-hidden="true" />
                  An approval that never names a version.
                </li>
              </ul>
            </div>
            <div className={styles.storyColumn}>
              <h3>A little more room for clarity</h3>
              <ul>
                <li>
                  <Check size={15} aria-hidden="true" />
                  Feedback attached to the detail it describes.
                </li>
                <li>
                  <Check size={15} aria-hidden="true" />
                  Revisions together, with their history intact.
                </li>
                <li>
                  <Check size={15} aria-hidden="true" />A client decision on
                  that specific version.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section
          id="features"
          className={styles.feature}
          aria-labelledby="feedback-title"
        >
          <div className={`${styles.featureGrid} ${styles.container}`}>
            <div className={styles.featureCopy}>
              <p className={styles.eyebrow}>01 / Pinned feedback</p>
              <h2 id="feedback-title" className={styles.sectionHeading}>
                The right thought.
                <br />
                The <em>right place.</em>
              </h2>
              <p>
                “A little more space” makes sense when you can see exactly
                where. Pin a comment to the image, keep replies in a thread, and
                resolve it when the detail is right.
              </p>
              <a className={styles.featureLink} href="#product">
                Leave a sample thought{" "}
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
            <figure className={styles.feedbackIllustration}>
              <div className={styles.miniCanvas}>
                <div className={styles.miniCanvasLabel}>
                  <span>FORMA / BRAND IDENTITY</span>
                  <span>VERSION 1</span>
                </div>
                <div className={styles.miniArt}>
                  <Image
                    src={demoAssets[0].versions[0].src}
                    alt="Original Forma brand identity sample"
                    width={1200}
                    height={800}
                    unoptimized
                  />
                  <span className={styles.staticPin} aria-hidden="true">
                    1
                  </span>
                </div>
              </div>
              <figcaption className={styles.floatingComment}>
                <span>PINNED FEEDBACK · SAMPLE CLIENT</span>
                <p>“Could the wordmark have a little more breathing room?”</p>
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          className={`${styles.feature} ${styles.revisionsFeature}`}
          aria-labelledby="revision-title"
        >
          <div className={`${styles.featureGrid} ${styles.container}`}>
            <div
              className={styles.versionIllustration}
              aria-label="Original Forma sample revision history"
            >
              {demoAssets[0].versions.map((version) => (
                <div className={styles.versionSheet} key={version.number}>
                  <div>
                    Version {version.number}
                    <span>
                      {version.number === 2 ? "Current" : "Historical"}
                    </span>
                  </div>
                  <Image
                    src={version.src}
                    alt={`Forma identity sample revision ${version.number}`}
                    width={version.width}
                    height={version.height}
                    unoptimized
                  />
                  <p>
                    {version.number === 2
                      ? "A little more breathing room."
                      : "The conversation stays here."}
                  </p>
                </div>
              ))}
              <p className={styles.versionFootnote}>
                <GitCompareArrows size={15} aria-hidden="true" />
                Two versions. Nothing lost along the way.
              </p>
            </div>
            <div className={styles.featureCopy}>
              <p className={styles.eyebrow}>02 / Revision history</p>
              <h2 id="revision-title" className={styles.sectionHeading}>
                Move forward.
                <br />
                Keep the <em>context.</em>
              </h2>
              <p>
                A new version is a new chapter, not a rewrite of the
                conversation. Compare changes side by side while earlier files,
                feedback and decisions stay exactly where they belong.
              </p>
              <Link
                className={styles.featureLink}
                href="/demo"
                prefetch={false}
              >
                Explore version comparison{" "}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section
          className={`${styles.feature} ${styles.approvalsFeature}`}
          aria-labelledby="approval-title"
        >
          <div className={`${styles.featureGrid} ${styles.container}`}>
            <div className={styles.featureCopy}>
              <p className={styles.eyebrow}>03 / Client approvals</p>
              <h2 id="approval-title" className={styles.sectionHeading}>
                From “looks good”
                <br />
                to a clear go-ahead.
              </h2>
              <p>
                Give each client a simple next step: approve this version or
                request changes with a note. See their individual decisions, and
                start fresh when a new revision is ready.
              </p>
              <a className={styles.featureLink} href="#product">
                Try an approval in the preview{" "}
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
            <div className={styles.approvalIllustration}>
              <span>A DECISION WITH CONTEXT</span>
              <h3>Good to go. On this version.</h3>
              <div className={styles.approvalDocument}>
                <Image
                  src={demoAssets[1].versions[1].src}
                  alt="Original Sunday Journal editorial sample"
                  width={800}
                  height={1100}
                  unoptimized
                />
                <div>
                  <p>A slower kind of Sunday</p>
                  <span>Version 2 · Original sample design</span>
                </div>
              </div>
              <div className={styles.approvalStamp}>
                <Check size={20} aria-hidden="true" />
                <span>Approved by sample client</span>
              </div>
              <blockquote>“Ready to go.”</blockquote>
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className={styles.workflow}
          aria-labelledby="workflow-title"
        >
          <div className={styles.container}>
            <div className={styles.workflowHeading}>
              <div>
                <p className={styles.eyebrow}>A simpler review rhythm</p>
                <h2 id="workflow-title" className={styles.sectionHeading}>
                  Three steps.
                  <br />A little less back-and-forth.
                </h2>
              </div>
              <p>
                From the first upload to the next clear decision, keep the
                process close to the work.
              </p>
            </div>
            <ol className={styles.steps}>
              <li>
                <div className={styles.stepTop}>
                  <span>01</span>
                  <Upload size={23} strokeWidth={1.4} aria-hidden="true" />
                </div>
                <h3>Put the work in the room.</h3>
                <p>
                  Create a project, upload a JPG, PNG or WebP, and invite the
                  people who need to see it.
                </p>
              </li>
              <li>
                <div className={styles.stepTop}>
                  <span>02</span>
                  <MessageSquare
                    size={23}
                    strokeWidth={1.4}
                    aria-hidden="true"
                  />
                </div>
                <h3>Make the feedback specific.</h3>
                <p>
                  Pin a thought, talk through the details, and compare a new
                  revision with what came before.
                </p>
              </li>
              <li>
                <div className={styles.stepTop}>
                  <span>03</span>
                  <CheckCheck size={23} strokeWidth={1.4} aria-hidden="true" />
                </div>
                <h3>Know what happens next.</h3>
                <p>
                  Each assigned client can approve the version or leave a clear
                  note about the changes they need.
                </p>
              </li>
            </ol>
            <Link className={styles.featureLink} href="/demo" prefetch={false}>
              Walk through the demo <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section
          id="for-you"
          className={styles.useCases}
          aria-labelledby="use-cases-title"
        >
          <div className={styles.container}>
            <div className={styles.centerHeading}>
              <p className={styles.eyebrow}>
                Different teams. The same need for clarity.
              </p>
              <h2 id="use-cases-title" className={styles.sectionHeading}>
                For people who care
                <br />
                about the <em>details.</em>
              </h2>
              <p>
                One considered space for the work you’re putting into the world.
              </p>
            </div>
            <div className={styles.useCaseGrid}>
              <article className={styles.useCase}>
                <UserRound size={24} strokeWidth={1.3} aria-hidden="true" />
                <h3>The independent creative.</h3>
                <p>
                  Give your clients a clear place to review. Keep revisions and
                  decisions together, without turning every project into a new
                  email thread.
                </p>
                <span>Freelancers & independent designers</span>
              </article>
              <article className={styles.useCase}>
                <Layers size={24} strokeWidth={1.3} aria-hidden="true" />
                <h3>The studio with a full plate.</h3>
                <p>
                  Assign the right designers and clients to each project. Owners
                  keep the wider view while the team stays focused on its own
                  work.
                </p>
                <span>Agencies & design studios</span>
              </article>
              <article className={styles.useCase}>
                <Users size={24} strokeWidth={1.3} aria-hidden="true" />
                <h3>The team making it happen.</h3>
                <p>
                  Bring brand, editorial and campaign artwork into a shared
                  review workflow. See the latest revision and the feedback that
                  belongs to it.
                </p>
                <span>In-house & creative teams</span>
              </article>
            </div>
          </div>
        </section>

        <section
          id="privacy"
          className={styles.privacy}
          aria-labelledby="privacy-title"
        >
          <div className={`${styles.privacyGrid} ${styles.container}`}>
            <div className={styles.privacyIntro}>
              <p className={styles.eyebrow}>
                <ShieldCheck size={14} aria-hidden="true" />
                Considered collaboration
              </p>
              <h2 id="privacy-title" className={styles.sectionHeading}>
                The right work.
                <br />
                The <em>right people.</em>
              </h2>
              <p>
                Access is part of the workflow. Keep projects assigned, files
                private, and shared reviews limited to what you choose to show.
              </p>
            </div>
            <ul className={styles.privacyList}>
              <li>
                <LockKeyhole size={21} strokeWidth={1.4} aria-hidden="true" />
                <h3>Private image storage</h3>
                <p>
                  Files live in a private bucket. Image requests check access
                  before serving the work.
                </p>
              </li>
              <li>
                <Users size={21} strokeWidth={1.4} aria-hidden="true" />
                <h3>Project-based access</h3>
                <p>
                  Owners see their workspace. Designers and clients see their
                  assigned projects.
                </p>
              </li>
              <li>
                <Link2 size={21} strokeWidth={1.4} aria-hidden="true" />
                <h3>Sharing with boundaries</h3>
                <p>
                  Read-only links show one version, with expiry and revocation
                  controls.
                </p>
              </li>
              <li>
                <Sparkles size={21} strokeWidth={1.4} aria-hidden="true" />
                <h3>A separate place to try</h3>
                <p>
                  The 24-hour guest demo uses isolated sample data, away from
                  real workspaces.
                </p>
              </li>
            </ul>
          </div>
        </section>

        <section id="faq" className={styles.faq} aria-labelledby="faq-title">
          <div className={`${styles.faqGrid} ${styles.container}`}>
            <div className={styles.faqIntro}>
              <p className={styles.eyebrow}>A few things, before you begin</p>
              <h2 id="faq-title" className={styles.sectionHeading}>
                Room for
                <br />
                <em>questions.</em>
              </h2>
              <p>A little more context about how Review Room works.</p>
            </div>
            <div className={styles.faqList}>
              {questions.map((item) => (
                <details key={item.question} name="review-room-faq">
                  <summary>
                    {item.question}
                    <Plus size={17} aria-hidden="true" />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="start-title">
          <div className={styles.container}>
            <p className={styles.eyebrow}>Make a little room for better work</p>
            <h2 id="start-title" className={styles.sectionHeading}>
              Your next good idea
              <br />
              deserves a <em>better review.</em>
            </h2>
            <p>Bring the work. We’ll give the feedback a place.</p>
            <div className={styles.heroActions}>
              <Link href="/signup" className={styles.primaryButton}>
                Create your workspace{" "}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <Link
                href="/demo"
                prefetch={false}
                className={styles.secondaryButton}
              >
                Try the full demo <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerMain}>
            <div className={styles.footerBrand}>
              <Link href="/" aria-label="Review Room home">
                <Brand />
              </Link>
              <p>
                A thoughtful space for visual feedback, revisions, and a clear
                next step.
              </p>
            </div>
            <nav className={styles.footerGroup} aria-label="Product">
              <h3>The product</h3>
              <a href="#product">Interactive preview</a>
              <a href="#features">Features</a>
              <a href="#workflow">How it works</a>
              <Link href="/demo" prefetch={false}>
                Try demo
              </Link>
            </nav>
            <nav className={styles.footerGroup} aria-label="Learn more">
              <h3>A closer look</h3>
              <a href="#for-you">Who it’s for</a>
              <a href="#privacy">Privacy & collaboration</a>
              <a href="#faq">Questions & answers</a>
              <a href="https://github.com/ataullah1/review-room">
                Project source <span aria-hidden="true">↗</span>
              </a>
            </nav>
            <nav className={styles.footerGroup} aria-label="Workspace">
              <h3>Your workspace</h3>
              <Link href="/signup">Get started</Link>
              <Link href="/login">Sign in</Link>
              <Link href="/app" prefetch={false}>
                Open workspace
              </Link>
            </nav>
          </div>
          <div className={styles.footerBottom}>
            <span>
              © {new Date().getFullYear()} Review Room. A little feedback. A
              better result.
            </span>
            <span>
              Designed &amp; built by
              <a
                className={styles.creatorLink}
                href="https://ataullah.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ataullah’s portfolio (opens in a new tab)"
              >
                Ataullah
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
