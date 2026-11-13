// The same UTF-8 SHA-256 digest is used by Deno and the Android WebView.
export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function randomUUID() {
  return globalThis.crypto.randomUUID();
}
