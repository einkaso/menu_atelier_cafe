"use client";

const STORAGE_KEY = "mb_waiter_session_fallback";
let memoryToken = "";

export function waiterSessionToken() {
  if (typeof window === "undefined") return memoryToken;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? memoryToken;
  } catch {
    // Safari in standalone/private mode can deny sessionStorage. The secure,
    // HttpOnly cookie remains the primary session transport in that case.
    return memoryToken;
  }
}

export function saveWaiterSessionToken(token: string | null | undefined) {
  if (typeof window === "undefined" || !token) return;
  memoryToken = token;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Keep logging in with the server-issued cookie when storage is unavailable.
  }
  window.dispatchEvent(new Event("waiter-session-changed"));
}

export function clearWaiterSessionToken() {
  memoryToken = "";
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // There is no client-side fallback token to clear when storage is denied.
  }
  window.dispatchEvent(new Event("waiter-session-changed"));
}

export function waiterSessionHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);
  const token = waiterSessionToken();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

export function createClientRequestId() {
  const webCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    try {
      return webCrypto.randomUUID();
    } catch {
      // Older WebKit can expose randomUUID but reject it outside a secure context.
    }
  }
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    try {
      const bytes = webCrypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // This value only deduplicates a command, so a basic fallback is sufficient.
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
