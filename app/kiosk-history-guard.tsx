"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MARKER = "atelier-public-kiosk";

export default function KioskHistoryGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;
    const guardedState = { ...(window.history.state ?? {}), kioskGuard: MARKER };
    window.history.replaceState(guardedState, "", window.location.href);
    window.history.pushState(guardedState, "", window.location.href);
    const keepPublicScreen = () => {
      if (window.location.pathname !== "/") return;
      window.history.pushState(guardedState, "", window.location.href);
    };
    window.addEventListener("popstate", keepPublicScreen);
    return () => window.removeEventListener("popstate", keepPublicScreen);
  }, [pathname]);

  return null;
}
