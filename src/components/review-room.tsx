"use client";
import { Brand } from "@/components/brand";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FolderOpen,
  Grid2X2,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
const projects = [
  {
    name: "Forma brand launch",
    client: "Forma Studio",
    kind: "Brand identity",
    tone: "cream",
    label: "forma",
    assets: 6,
    comments: 12,
    updated: "2 hours ago",
    status: "In review",
  },
  {
    name: "Objects of everyday",
    client: "Object & Co.",
    kind: "Campaign",
    tone: "orange",
    label: "Objects of\neveryday.",
    assets: 4,
    comments: 8,
    updated: "4 hours ago",
    status: "Changes requested",
  },
  {
    name: "A quieter kind of stay",
    client: "Still House",
    kind: "Web design",
    tone: "green",
    label: "STILL\nHOUSE",
    assets: 8,
    comments: 3,
    updated: "Yesterday",
    status: "Approved",
  },
  {
    name: "Good things take root",
    client: "Rooted",
    kind: "Packaging",
    tone: "pink",
    label: "rooted.",
    assets: 3,
    comments: 5,
    updated: "Yesterday",
    status: "In review",
  },
];
const threads = [
  {
    name: "Olivia Chen",
    initials: "OC",
    time: "2 hours ago",
    text: "Love this direction! Could we give the wordmark a little more breathing room?",
    color: "peach",
  },
  {
    name: "James Miller",
    initials: "JM",
    time: "1 hour ago",
    text: "The warm palette feels right. Can we try a slightly darker background for contrast?",
    color: "lavender",
  },
  {
    name: "Olivia Chen",
    initials: "OC",
    time: "45 minutes ago",
    text: "The supporting type looks great at this size.",
    color: "peach",
  },
];
export default function ReviewRoom() {
  const [view, setView] = useState<"projects" | "review">("projects");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All projects");
  const [project, setProject] = useState(projects[0]);
  const [selected, setSelected] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [version, setVersion] = useState("2");
  const [zoom, setZoom] = useState(100);
  const [notice, setNotice] = useState("");
  const [resolved, setResolved] = useState<number[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, [tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    controls()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab") {
        const list = controls();
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [drawer]);
  const filtered = projects.filter(
    (p) =>
      `${p.name} ${p.client}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "All projects" || p.status === filter),
  );
  function open(p: (typeof projects)[number]) {
    setProject(p);
    setView("review");
    setVersion("2");
    setResolved([]);
    setDrawer(false);
    setNotice("");
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Review Room home">
          <Brand />
        </Link>
        <button
          className="workspace"
          onClick={() =>
            setNotice(
              "Sample workspace · Workspace switching comes with authentication.",
            )
          }
        >
          <span className="workspace-icon">S</span>
          <span>
            Studio workspace<small>Free workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button
            className="nav-item active"
            onClick={() => setView("projects")}
          >
            <FolderOpen size={18} />
            Projects<span className="count">4</span>
          </button>
          <button
            className="nav-item"
            onClick={() => setNotice("Activity feed is planned for Step 8.")}
          >
            <Bell size={18} />
            Activity
            <span className="unread" />
          </button>
          <button
            className="nav-item"
            onClick={() =>
              setNotice("Workspace settings are planned after authentication.")
            }
          >
            <Settings size={18} />
            Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="invite-card">
            <span className="little-star">✳</span>
            <strong>Good work is a team sport.</strong>
            <p>Bring your team and clients into the conversation.</p>
            <button
              onClick={() =>
                setNotice(
                  "Invitations are planned for Step 7. No invitation was sent.",
                )
              }
            >
              <Plus size={15} />
              Invite people
            </button>
          </div>
          <button
            className="nav-item"
            onClick={() =>
              setNotice(
                "Prototype tip: open a project, select a pin, and switch versions.",
              )
            }
          >
            <CircleHelp size={17} />
            Help & getting started
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar dark">MA</span>
            <span>
              Md Ataullah<small>Workspace owner · Sample</small>
            </span>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <button onClick={() => setView("projects")}>Projects</button>
            {view === "review" && (
              <>
                <ChevronRight size={14} />
                <span>{project.name}</span>
              </>
            )}
          </div>
          <span className="prototype">
            <span />
            Static prototype · Sample data
          </span>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {view === "projects" ? (
          <div className="projects-page">
            <div className="page-heading">
              <div className="eyebrow">A SPACE FOR YOUR NEXT GREAT THING</div>
              <div className="heading-row">
                <div>
                  <h1>
                    Your projects<span>.</span>
                  </h1>
                  <p>Fresh eyes. Clear feedback. Better work, together.</p>
                </div>
                <Button
                  className="primary"
                  onClick={() =>
                    setNotice(
                      "Project creation comes in Step 3. These four projects are sample data.",
                    )
                  }
                >
                  <Plus size={17} />
                  New project
                </Button>
              </div>
            </div>
            <div className="overview">
              <div className="overview-copy">
                <span className="live-dot" />
                THE BIG PICTURE<strong>Keep the work moving.</strong>
                <span>
                  You have <b>2 projects</b> waiting for a fresh pair of eyes.
                </span>
              </div>
              <div className="overview-stat">
                <strong>04</strong>
                <span>Total projects</span>
              </div>
              <div className="overview-stat">
                <strong>
                  02
                  <span className="tiny-dot amber" />
                </strong>
                <span>In review</span>
              </div>
              <div className="overview-stat">
                <strong>
                  01
                  <span className="tiny-dot sage" />
                </strong>
                <span>Approved</span>
              </div>
              <div className="overview-decoration">✳</div>
            </div>
            <div className="project-toolbar">
              <div className="tabs">
                {["All projects", "In review", "Approved"].map((t) => (
                  <button
                    key={t}
                    className={filter === t ? "selected" : ""}
                    onClick={() => setFilter(t)}
                  >
                    {t}
                    {t === "All projects" && <span>4</span>}
                  </button>
                ))}
              </div>
              <div className="tools">
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search projects"
                    placeholder="Search projects..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="grid-indicator" title="Grid view">
                  <LayoutGrid size={17} />
                </span>
              </div>
            </div>
            <div className="project-grid">
              {filtered.map((p, i) => (
                <button
                  className="project-card"
                  key={p.name}
                  onClick={() => open(p)}
                >
                  <div className={`artwork ${p.tone}`}>
                    <span className="artwork-meta">
                      {p.kind.toUpperCase()}
                      <ArrowUpRight size={17} />
                    </span>
                    <div className="artwork-word">{p.label}</div>
                    {p.tone === "cream" && (
                      <>
                        <span className="forma-flower">✳</span>
                        <span className="artwork-caption">
                          Thoughtfully made. Naturally different.
                        </span>
                      </>
                    )}
                    {p.tone === "orange" && <span className="orange-disc" />}
                    {p.tone === "green" && <span className="green-window" />}
                    {p.tone === "pink" && (
                      <span className="pink-caption">
                        A little closer to nature.
                      </span>
                    )}
                    <span className="asset-pill">
                      <Grid2X2 size={12} />
                      {p.assets} assets
                    </span>
                  </div>
                  <div className="card-details">
                    <div className="card-title">
                      <h2>{p.name}</h2>
                      <MoreHorizontal size={18} />
                    </div>
                    <p>{p.client}</p>
                    <div className="card-footer">
                      <span
                        className={`status ${p.status === "Approved" ? "approved" : p.status === "Changes requested" ? "changes" : "reviewing"}`}
                      >
                        <span />
                        {p.status}
                      </span>
                      <div className="card-people">
                        <span
                          className={`avatar mini ${i % 2 ? "lavender" : "peach"}`}
                        >
                          {i % 2 ? "JM" : "OC"}
                        </span>
                        <span className="avatar mini neutral">+1</span>
                      </div>
                    </div>
                    <div className="card-timestamp">
                      <span>Updated {p.updated}</span>
                      <span>
                        <MessageCircle size={13} />
                        {p.comments}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="empty">
                <Search />
                <h2>No projects found</h2>
                <p>Try a different name or status.</p>
                <button
                  onClick={() => {
                    setQuery("");
                    setFilter("All projects");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
            <footer className="page-footer">
              <span>A little feedback goes a long way.</span>
              <span>
                Made for the back-and-forth. <Sparkles size={13} />
              </span>
            </footer>
          </div>
        ) : (
          <div className="review-page">
            <div className="review-heading">
              <button
                className="back"
                aria-label="Back to projects"
                onClick={() => setView("projects")}
              >
                <ArrowLeft size={19} />
              </button>
              <div>
                <h1>{project.name}</h1>
                <p>Brand exploration · Sample asset</p>
              </div>
              <span className="status reviewing">
                <span />
                In review
              </span>
              <button
                className="outline"
                onClick={() =>
                  setNotice(
                    "This is a static prototype. Share links come in Step 7.",
                  )
                }
              >
                <ArrowUpRight size={15} />
                Share
              </button>
            </div>
            <div className="review-layout">
              <section className="canvas-section">
                <div className="canvas-toolbar">
                  <span>01 / Brand direction</span>
                  <label>
                    Version{" "}
                    <select
                      aria-label="Select version"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                    >
                      <option value="2">2 · Current</option>
                      <option value="1">1 · Previous</option>
                    </select>
                  </label>
                </div>
                <div className="canvas">
                  <div className="canvas-scaler" style={{ width: `${zoom}%` }}>
                    <div
                      className={`review-art ${project.tone} ${version === "1" ? "old-version" : ""}`}
                    >
                      <span className="review-art-top">
                        {project.client.toUpperCase()}
                        <span>BRAND EXPLORATION / 0{version}</span>
                      </span>
                      <span className="review-flower">✳</span>
                      <strong>{project.label}</strong>
                      <span className="review-tagline">
                        Thoughtfully made.
                        <br />
                        Naturally different.
                      </span>
                      <span className="review-art-bottom">
                        A new perspective on the everyday.<span>2026 ©</span>
                      </span>
                    </div>
                    {version === "2" &&
                      threads.map((t, i) => (
                        <button
                          key={t.name + i}
                          aria-label={`Open comment ${i + 1}`}
                          className={`pin pin-${i} ${selected === i ? "chosen" : ""}`}
                          onClick={() => {
                            setSelected(i);
                            setDrawer(true);
                          }}
                        >
                          {resolved.includes(i) ? <Check size={14} /> : i + 1}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="canvas-bottom">
                  <span>Sample artwork · Comments are for preview only</span>
                  <div>
                    <button
                      aria-label="Zoom out"
                      disabled={zoom <= 75}
                      onClick={() => setZoom((z) => Math.max(75, z - 25))}
                    >
                      <ZoomOut size={16} />
                    </button>
                    <span>{zoom}%</span>
                    <button
                      aria-label="Zoom in"
                      disabled={zoom >= 150}
                      onClick={() => setZoom((z) => Math.min(150, z + 25))}
                    >
                      <ZoomIn size={16} />
                    </button>
                    <button onClick={() => setZoom(100)}>Fit</button>
                  </div>
                </div>
                <button
                  className="mobile-comments primary"
                  onClick={() => setDrawer(true)}
                >
                  <MessageCircle size={17} />
                  View comments ({version === "2" ? 3 : 0})
                </button>
              </section>
              {drawer && (
                <button
                  className="drawer-backdrop"
                  aria-label="Close comments"
                  onClick={() => setDrawer(false)}
                />
              )}
              <aside
                ref={panelRef}
                role={drawer ? "dialog" : undefined}
                aria-modal={drawer ? true : undefined}
                className={`comments-panel ${drawer ? "drawer-open" : ""}`}
                aria-label="Comment threads"
              >
                <div className="comments-heading">
                  <h2>
                    Comments <span>{version === "2" ? 3 : 0}</span>
                  </h2>
                  <button
                    className="close-drawer"
                    aria-label="Close comments"
                    onClick={() => setDrawer(false)}
                  >
                    <X size={19} />
                  </button>
                  <SlidersHorizontal className="desktop-filter" size={16} />
                </div>
                <div className="comments-subtitle">
                  {version === "2"
                    ? "A conversation around the details."
                    : "Previous version · Read only"}
                </div>
                {version === "2" ? (
                  threads.map((t, i) => (
                    <div
                      key={i}
                      className={`thread ${selected === i ? "thread-selected" : ""}`}
                    >
                      <button
                        className="thread-select"
                        onClick={() => setSelected(i)}
                        aria-pressed={selected === i}
                      >
                        <span className="thread-number">{i + 1}</span>
                        <span className={`avatar ${t.color}`}>
                          {t.initials}
                        </span>
                        <span className="thread-author">
                          {t.name}
                          <small>{t.time}</small>
                        </span>
                      </button>
                      <p>{t.text}</p>
                      {i === 0 && (
                        <div className="reply">
                          <span className="avatar mini dark">MA</span>
                          <div>
                            <strong>
                              Md Ataullah <small>1 hour ago</small>
                            </strong>
                            <p>
                              Absolutely. I’ll explore more space in the next
                              version.
                            </p>
                          </div>
                        </div>
                      )}
                      <button
                        className="resolve"
                        onClick={() =>
                          setResolved((r) =>
                            r.includes(i)
                              ? r.filter((n) => n !== i)
                              : [...r, i],
                          )
                        }
                      >
                        <Check size={14} />
                        {resolved.includes(i)
                          ? "Resolved · Reopen"
                          : "Mark as resolved"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <MessageCircle />
                    <p>No sample comments on this version.</p>
                  </div>
                )}
                <div className="comment-note">
                  <CircleHelp size={15} />
                  <span>
                    Preview only. Changes reset when you leave this page.
                    Comment saving and approval arrive in later steps.
                  </span>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
