"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  imagePoint,
  isPinClick,
  type ImagePoint,
} from "@/features/comments/coordinates";
import type { DemoComment } from "./state";
export function DemoCanvas({
  src,
  width,
  height,
  roots,
  selected,
  draft,
  onSelect,
  onPin,
  readOnly = false,
}: {
  src: string;
  width: number;
  height: number;
  roots: DemoComment[];
  selected: string | null;
  draft: ImagePoint | null;
  onSelect: (id: string) => void;
  onPin: (point: ImagePoint) => void;
  readOnly?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    gesture = useRef<{
      x: number;
      y: number;
      left: number;
      top: number;
      dragged: boolean;
      mouse: boolean;
    } | null>(null),
    [fit, setFit] = useState(400),
    [zoom, setZoom] = useState(1),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = () =>
      setFit(
        Math.max(
          1,
          Math.min(
            node.clientWidth - 48,
            ((node.clientHeight - 48) * width) / height,
          ),
        ),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, [width, height]);
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
      return;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
      dragged: false,
      mouse: event.pointerType === "mouse",
    };
    if (event.pointerType === "mouse")
      event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    if (!isPinClick(g, { x: event.clientX, y: event.clientY }))
      g.dragged = true;
    if (g.dragged && g.mouse && zoom > 1) {
      event.currentTarget.scrollLeft = g.left - (event.clientX - g.x);
      event.currentTarget.scrollTop = g.top - (event.clientY - g.y);
    }
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (
      !g ||
      !ready ||
      readOnly ||
      !surface.current ||
      !isPinClick(g, { x: event.clientX, y: event.clientY }, g.dragged)
    )
      return;
    const point = imagePoint(
      event.clientX,
      event.clientY,
      surface.current.getBoundingClientRect(),
    );
    if (point) onPin(point);
  }
  return (
    <section className="demo-canvas">
      <div className="demo-canvas-tools">
        <span>
          {readOnly
            ? "Read-only version"
            : "Click an image detail to add feedback"}
        </span>
        <div>
          <button
            aria-label="Demo zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          >
            −
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button
            aria-label="Demo zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
          >
            +
          </button>
          <button
            onClick={() => {
              setZoom(1);
              viewport.current?.scrollTo(0, 0);
            }}
          >
            Fit
          </button>
        </div>
      </div>
      <div
        className="demo-viewport"
        ref={viewport}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        <div
          className="demo-image-stage"
          style={{
            width: fit * zoom + 48,
            height: (fit * zoom * height) / width + 48,
          }}
        >
          <div
            className="demo-image-surface"
            ref={surface}
            style={{ width: fit * zoom, height: (fit * zoom * height) / width }}
          >
            <Image
              src={src}
              alt="Original fictional demo design"
              width={width}
              height={height}
              unoptimized
              draggable={false}
              onLoad={() => setReady(true)}
            />
            {ready &&
              roots.map((root) => (
                <button
                  key={root.id}
                  className={`review-pin${root.resolved ? " is-resolved" : ""}${selected === root.id ? " is-selected" : ""}`}
                  style={{
                    left: `${root.xRatio! * 100}%`,
                    top: `${root.yRatio! * 100}%`,
                  }}
                  aria-label={`Demo thread ${root.threadNumber}`}
                  onClick={() => onSelect(root.id)}
                >
                  {root.threadNumber}
                </button>
              ))}
            {draft && (
              <span
                className="review-pin is-draft"
                style={{
                  left: `${draft.xRatio * 100}%`,
                  top: `${draft.yRatio * 100}%`,
                }}
              >
                +
              </span>
            )}
          </div>
        </div>
      </div>
      <footer>
        <span>
          {width} × {height} px · {zoom > 1 ? "Drag to pan" : "Fit to canvas"}
        </span>
        <button
          disabled={readOnly || !ready}
          onClick={() => onPin({ xRatio: 0.5, yRatio: 0.5 })}
        >
          ＋ Add comment
        </button>
      </footer>
    </section>
  );
}
