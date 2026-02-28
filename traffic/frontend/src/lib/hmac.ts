/**
 * Computes HMAC-SHA256 using the Web Crypto API.
 * Returns the first 16 hex characters of the digest — same as the backend.
 */
export async function computeQrToken(secret: string, sessionId: string, window: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${sessionId}|${window}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export function currentWindow(rotateSeconds: number): number {
  return Math.floor(Date.now() / 1000 / rotateSeconds);
}

export function msUntilNextWindow(rotateSeconds: number): number {
  const nowMs = Date.now();
  const windowMs = rotateSeconds * 1000;
  return windowMs - (nowMs % windowMs);
}
