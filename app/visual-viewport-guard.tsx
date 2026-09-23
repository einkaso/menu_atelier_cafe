"use client";

import { useEffect } from "react";

export default function VisualViewportGuard() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const viewport = window.visualViewport;
      root.style.setProperty("--app-viewport-left", `${viewport?.offsetLeft ?? 0}px`);
      root.style.setProperty("--app-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      root.style.setProperty("--app-viewport-width", `${viewport?.width ?? window.innerWidth}px`);
      root.style.setProperty("--app-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty("--app-viewport-center-x", `${(viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) / 2}px`);
      root.style.setProperty("--app-viewport-center-y", `${(viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) / 2}px`);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
