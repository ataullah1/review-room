export default function LoadingProjects() {
  return (
    <section
      className="private-content project-loading"
      role="status"
      aria-live="polite"
    >
      <span className="eyebrow">YOUR WORKSPACE</span>
      <h1>Making room for your work…</h1>
      <p>Loading your projects.</p>
      <div className="project-grid" aria-hidden="true">
        {[1, 2, 3].map((key) => (
          <div className="project-card project-skeleton" key={key} />
        ))}
      </div>
    </section>
  );
}
