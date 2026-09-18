type GuestOrientationController = {
  lock?: (orientation: "portrait" | "landscape") => Promise<void>;
  unlock?: () => void;
};

export type AppOrientation = "portrait" | "landscape";

function orientationController() {
  if (typeof window === "undefined") return null;
  return window.screen.orientation as unknown as GuestOrientationController | undefined;
}

function isTabletSurface() {
  if (typeof window === "undefined") return false;
  return Math.min(window.screen.width, window.screen.height) >= 600 && window.matchMedia("(pointer: coarse)").matches;
}

function markDesiredOrientation(orientation: AppOrientation) {
  if (typeof document !== "undefined") document.documentElement.dataset.appOrientation = orientation;
}

export function desiredAppOrientation(): AppOrientation {
  if (typeof document === "undefined") return "landscape";
  return document.documentElement.dataset.appOrientation === "portrait" ? "portrait" : "landscape";
}

export async function lockAppOrientation(target: AppOrientation) {
  markDesiredOrientation(target);
  if (!isTabletSurface()) return false;
  const orientation = orientationController();
  if (typeof orientation?.lock !== "function") return false;
  try {
    await orientation.lock(target);
    return true;
  } catch {
    return false;
  }
}

export function lockGuestPortraitOrientation() {
  return lockAppOrientation("portrait");
}

export function lockAppLandscapeOrientation() {
  return lockAppOrientation("landscape");
}

export function unlockGuestOrientation() {
  markDesiredOrientation("landscape");
  const orientation = orientationController();
  if (typeof orientation?.unlock !== "function") return;
  try {
    orientation.unlock();
  } catch {
    // Some tablet browsers expose the API but allow it only in installed PWA mode.
  }
}
