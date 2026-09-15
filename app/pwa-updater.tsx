"use client";

import { useEffect } from "react";

const CLIENT_BUILD_VERSION = process.env.NEXT_PUBLIC_APP_BUILD_VERSION ?? "development";

export default function PwaUpdater() {
  useEffect(() => {
    const adminMode = window.location.pathname.startsWith("/admin");

    let reloading = false;
    const reloadForUpdate = (targetVersion?: string) => {
      if (reloading) return;
      // Never discard an editor draft just because a new application build is
      // available. The version check will try again after the form is saved.
      if (adminMode && document.documentElement.dataset.adminFormDirty === "true") return;
      reloading = true;
      if (adminMode) {
        const next = new URL(window.location.href);
        next.searchParams.set("admin-update", String(Date.now()));
        if (targetVersion) next.searchParams.set("build", targetVersion);
        window.location.replace(`${next.pathname}${next.search}`);
        return;
      }
      // Keep operational screens (for example /kelner) on the same route.
      // Redirecting every PWA update to "/" could interrupt a login on an
      // iPad while a freshly activated service worker was taking control.
      const next = new URL(window.location.href);
      next.searchParams.set("menu-update", String(Date.now()));
      if (targetVersion) next.searchParams.set("build", targetVersion);
      window.location.replace(`${next.pathname}${next.search}${next.hash}`);
    };

    const checkBuildVersion = async () => {
      if (reloading) return;
      try {
        const response = await fetch(`/api/version?menu-version=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!response.ok) return;
        const body = await response.json() as { version?: string };
        if (!body.version) return;
        if (CLIENT_BUILD_VERSION !== "development" && CLIENT_BUILD_VERSION !== body.version) {
          reloadForUpdate(body.version);
          return;
        }
      } catch {
        // A temporary connection failure must never interrupt kiosk operation.
      }
    };

    let workerRegistration: ServiceWorkerRegistration | null = null;
    const checkForUpdates = () => {
      if (document.visibilityState === "visible") void workerRegistration?.update();
    };
    const timer = window.setInterval(checkForUpdates, 30_000);
    const versionTimer = window.setInterval(checkBuildVersion, 15_000);
    window.addEventListener("focus", checkForUpdates);
    window.addEventListener("focus", checkBuildVersion);
    window.addEventListener("pageshow", checkBuildVersion);
    window.addEventListener("online", checkBuildVersion);
    document.addEventListener("visibilitychange", checkForUpdates);
    document.addEventListener("visibilitychange", checkBuildVersion);
    void checkBuildVersion();

    const reloadForNewWorker = () => reloadForUpdate();
    const reloadFromWorkerMessage = (event: MessageEvent<{ type?: string; version?: string }>) => {
      if (event.data?.type === "MENU_BUILD_OUTDATED" || event.data?.type === "MENU_WORKER_ACTIVATED") {
        reloadForUpdate(event.data.version);
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", reloadForNewWorker);
      navigator.serviceWorker.addEventListener("message", reloadFromWorkerMessage);
      navigator.serviceWorker.register(`/sw.js?build=${encodeURIComponent(CLIENT_BUILD_VERSION)}`, { updateViaCache: "none" }).then((registration) => {
        workerRegistration = registration;
        void registration.update();
      }).catch(() => undefined);
    }

    return () => {
      window.clearInterval(timer);
      window.clearInterval(versionTimer);
      window.removeEventListener("focus", checkForUpdates);
      window.removeEventListener("focus", checkBuildVersion);
      window.removeEventListener("pageshow", checkBuildVersion);
      window.removeEventListener("online", checkBuildVersion);
      document.removeEventListener("visibilitychange", checkForUpdates);
      document.removeEventListener("visibilitychange", checkBuildVersion);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", reloadForNewWorker);
        navigator.serviceWorker.removeEventListener("message", reloadFromWorkerMessage);
      }
    };
  }, []);

  return null;
}
