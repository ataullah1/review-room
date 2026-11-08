export default function LoadingProject() {
  return (
    <section
      className="private-content route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="eyebrow">PROJECT SPACE</span>
      <h1>Opening the project…</h1>
      <p>Gathering the latest designs, people and review progress.</p>
      <div className="route-loading-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
