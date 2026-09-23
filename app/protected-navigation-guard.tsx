"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clearWaiterSessionToken, waiterSessionHeaders } from "./kelner/waiter-session-client";

type ProtectedArea = "admin" | "waiter";

function protectedArea(pathname: string): ProtectedArea | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/kelner" || pathname.startsWith("/kelner/")) return "waiter";
  return null;
}

export default function ProtectedNavigationGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const area = protectedArea(pathname);
    if (!area) {
      delete document.documentElement.dataset.protectedPageCheck;
      return;
    }
    let checking = false;
    let disposed = false;
    const loginPath = area === "admin" ? "/admin?session=expired" : "/kelner?session=expired";
    const endpoint = area === "admin" ? "/api/admin/session" : "/api/waiter/session";

    const verify = async () => {
      if (checking || disposed) return;
      checking = true;
      document.documentElement.dataset.protectedPageCheck = "pending";
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          credentials: "same-origin",
          headers: area === "waiter" ? waiterSessionHeaders({ "cache-control": "no-cache" }) : { "cache-control": "no-cache" },
        });
        if (response.status === 401) {
          if (area === "waiter") clearWaiterSessionToken();
          window.location.replace(loginPath);
          return;
        }
      } catch {
        // Keep the protected view covered when its session cannot be verified.
        window.location.replace(loginPath);
        return;
      } finally {
        checking = false;
      }
      if (!disposed) delete document.documentElement.dataset.protectedPageCheck;
    };

    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) void verify(); };
    const pageHide = () => { document.documentElement.dataset.protectedPageCheck = "pending"; };
    const historyNavigation = () => { void verify(); };
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("popstate", historyNavigation);
    return () => {
      disposed = true;
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("popstate", historyNavigation);
      delete document.documentElement.dataset.protectedPageCheck;
    };
  }, [pathname]);

  return null;
}
