"use client";

import { useEffect, useRef, useState } from "react";

/** Width of an element, kept current as it resizes; charts draw at real pixel size. */
export function useWidth<T extends HTMLElement>(initial = 300) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
