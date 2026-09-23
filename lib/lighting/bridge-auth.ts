import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function createBridgeToken() {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashBridgeToken(token),
    tokenHint: `${token.slice(0, 4)}…${token.slice(-4)}`,
  };
}

export function hashBridgeToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyBridgeToken(token: string, expectedHash: string) {
  if (!token || !/^[a-zA-Z0-9_-]{40,}$/.test(token) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const received = Buffer.from(hashBridgeToken(token), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
