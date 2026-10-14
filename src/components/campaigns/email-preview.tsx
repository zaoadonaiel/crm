"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders email HTML in a sandboxed iframe (no scripts). In builder mode,
 * clicking a `[data-block-id]` element selects that block.
 */
export function EmailPreview({
  html,
  device = "desktop",
  selectedId,
  onSelect,
  brandColor = "#f26b4e",
  title = "Email preview",
  className,
}: {
  html: string;
  device?: "desktop" | "mobile";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  brandColor?: string;
  title?: string;
  className?: string;
}) {
  const deferred = useDeferredValue(html);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(640);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selectedId;
  });

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.documentElement) return;
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    if (h > 0) setHeight(h);
  }, []);

  const applySelection = useCallback(
    (scroll: boolean) => {
      const doc = frameRef.current?.contentDocument;
      if (!doc?.head) return;
      let style = doc.getElementById("dc-selection") as HTMLStyleElement | null;
      if (!style) {
        style = doc.createElement("style");
        style.id = "dc-selection";
        doc.head.appendChild(style);
      }
      const id = selectedRef.current;
      style.textContent = id
        ? `[data-block-id="${CSS.escape(id)}"]{outline:2px solid ${brandColor}!important;outline-offset:-2px;background-image:linear-gradient(${brandColor}0d,${brandColor}0d)}`
        : "";
      if (scroll && id) {
        const el = doc.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
    [brandColor],
  );

  const onLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    measure();
    doc.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", measure, { once: true });
    });
    doc.addEventListener("click", (e) => {
      const target = e.target as Element | null;
      if (target?.closest("a")) e.preventDefault();
      if (!onSelectRef.current) return;
      const el = target?.closest("[data-block-id]");
      onSelectRef.current(el?.getAttribute("data-block-id") ?? null);
    });
    applySelection(false);
  }, [applySelection, measure]);

  useEffect(() => {
    applySelection(true);
  }, [selectedId, applySelection]);

  useEffect(() => {
    // Width change reflows the email.
    const t = setTimeout(measure, 60);
    return () => clearTimeout(t);
  }, [device, measure]);

  return (
    <div className={cn("mx-auto transition-[width] duration-300", device === "mobile" ? "w-[375px] max-w-full" : "w-full", className)}>
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={deferred}
        onLoad={onLoad}
        sandbox="allow-same-origin"
        className={cn("block w-full border-0 bg-transparent", device === "mobile" && "rounded-[28px] shadow-[0_0_0_10px_#1c1d21]")}
        style={{ height }}
      />
    </div>
  );
}
