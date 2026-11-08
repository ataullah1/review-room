export default function LoadingDelivery() {
  return (
    <section
      className="private-content route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="eyebrow">APPROVED DELIVERY</span>
      <h1>Preparing the delivery record…</h1>
      <p>Collecting approved versions and their review history.</p>
      <div className="route-loading-list" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
