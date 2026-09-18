type GuestOrientationController = {
  lock?: (orientation: "portrait") => Promise<void>;
  unlock?: () => void;
};

function orientationController() {
  if (typeof window === "undefined") return null;
  return window.screen.orientation as unknown as GuestOrientationController | undefined;
}

export async function lockGuestPortraitOrientation() {
  const orientation = orientationController();
  if (typeof orientation?.lock !== "function") return false;
  try {
    await orientation.lock("portrait");
    return true;
  } catch {
    return false;
  }
}

export function unlockGuestOrientation() {
  const orientation = orientationController();
  if (typeof orientation?.unlock !== "function") return;
  try {
    orientation.unlock();
  } catch {
    // Some tablet browsers expose the API but allow it only in installed PWA mode.
  }
}
