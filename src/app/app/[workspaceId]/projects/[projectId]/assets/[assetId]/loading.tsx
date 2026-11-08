export default function LoadingReview() {
  return (
    <section
      className="image-review-page route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="eyebrow">DESIGN REVIEW</span>
      <h1>Preparing the review canvas…</h1>
      <p>Loading the selected version and its feedback.</p>
      <div className="route-loading-canvas" aria-hidden="true">
        <span />
        <span />
      </div>
    </section>
  );
}
