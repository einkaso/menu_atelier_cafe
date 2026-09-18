type GuestOrientationController = {
  lock?: (orientation: "landscape") => Promise<void>;
};

function orientationController() {
  if (typeof window === "undefined") return null;
  return window.screen.orientation as unknown as GuestOrientationController | undefined;
}

function isTabletSurface() {
  if (typeof window === "undefined") return false;
  return Math.min(window.screen.width, window.screen.height) >= 600 && window.matchMedia("(any-pointer: coarse)").matches;
}

export async function lockAppLandscapeOrientation() {
  if (typeof document !== "undefined") document.documentElement.dataset.appOrientation = "landscape";
  if (!isTabletSurface()) return false;
  const orientation = orientationController();
  if (typeof orientation?.lock !== "function") return false;
  try {
    await orientation.lock("landscape");
    return true;
  } catch {
    return false;
  }
}
