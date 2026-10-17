"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
type Pane = {
  id: string;
  number: number;
  width: number;
  height: number;
  uploader: string;
};
function Pane({ base, version }: { base: string; version: Pane }) {
  const viewport = useRef<HTMLDivElement>(null),
    [fit, setFit] = useState(1),
    [scale, setScale] = useState(1);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = () =>
      setFit(
        Math.max(
          1,
          Math.min(
            node.clientWidth - 40,
            ((node.clientHeight - 40) * version.width) / version.height,
          ),
        ),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, [version.width, version.height]);
  return (
    <section
      className="comparison-pane"
      aria-label={`Compare version ${version.number}`}
    >
      <header>
        <div>
          <strong>Version {version.number}</strong>
          <span>{version.uploader}</span>
        </div>
        <button
          onClick={() => {
            setScale(1);
            viewport.current?.scrollTo(0, 0);
          }}
        >
          <Maximize size={14} /> Fit
        </button>
        <button
          aria-label={`Zoom version ${version.number}`}
          onClick={() => setScale((s) => (s >= 3 ? 1 : s + 0.5))}
        >
          {Math.round(scale * 100)}%
        </button>
      </header>
      <div ref={viewport} className="comparison-image-viewport">
        <div
          style={{
            width: fit * scale + 40,
            height: (fit * scale * version.height) / version.width + 40,
            minWidth: "100%",
            minHeight: "100%",
          }}
        >
          <Image
            unoptimized
            src={`${base}/file?versionId=${version.id}`}
            width={version.width}
            height={version.height}
            alt={`Version ${version.number}`}
            style={{
              width: fit * scale,
              height: (fit * scale * version.height) / version.width,
            }}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
      <footer>
        {version.width} × {version.height} px
        <Link href={`${base}?versionId=${version.id}`}>
          Read version comments →
        </Link>
      </footer>
    </section>
  );
}
export function VersionComparison({
  base,
  left,
  right,
}: {
  base: string;
  left: Pane;
  right: Pane;
}) {
  return (
    <div className="version-comparison">
      <Pane base={base} version={left} />
      <Pane base={base} version={right} />
    </div>
  );
}
