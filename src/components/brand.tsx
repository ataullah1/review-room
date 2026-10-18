/** Original Review Room artwork: an image frame with a pinned conversation. */
export function BrandMark({
  size = 36,
  decorative = true,
}: {
  size?: number;
  decorative?: boolean;
}) {
  return (
    <svg
      className="rr-brand__mark"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      focusable="false"
    >
      {!decorative && <title>Review Room — image frame and feedback pin</title>}
      <rect width="48" height="48" rx="14" fill="#59734d" />
      <path
        d="M29 11H15a4 4 0 0 0-4 4v18a4 4 0 0 0 4 4h18a4 4 0 0 0 4-4v-7"
        stroke="#f7f5ec"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M38 16c0 5-7 11-7 11s-7-6-7-11a7 7 0 1 1 14 0Z" fill="#f7f5ec" />
      <circle cx="31" cy="16" r="2.4" fill="#59734d" />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`rr-brand${compact ? " rr-brand--compact" : ""}`}>
      <BrandMark size={compact ? 30 : 36} />
      <span className="rr-brand__wordmark">
        review room<span className="rr-brand__dot">.</span>
      </span>
    </span>
  );
}
