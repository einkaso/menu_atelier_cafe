"use client";

import { useEffect } from "react";
import { desiredAppOrientation, lockAppLandscapeOrientation, lockAppOrientation } from "./kelner/guest-orientation";

export default function OrientationLock() {
  useEffect(() => {
    void lockAppLandscapeOrientation();
    const reapply = () => { void lockAppOrientation(desiredAppOrientation()); };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") reapply(); };
    window.addEventListener("orientationchange", reapply);
    window.addEventListener("pageshow", reapply);
    window.addEventListener("pointerup", reapply, { capture: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("orientationchange", reapply);
      window.removeEventListener("pageshow", reapply);
      window.removeEventListener("pointerup", reapply, { capture: true });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <aside className="app-landscape-required" role="status" aria-live="polite"><b>Obróć tablet poziomo</b><span>Menu i strefa obsługi działają w układzie poziomym.</span></aside>;
}
