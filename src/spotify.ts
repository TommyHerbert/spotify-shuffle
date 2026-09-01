const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export const REDIRECT_URI =
  typeof window !== "undefined"
    ? `${window.location.origin}/callback`
    : "http://127.0.0.1:5173/callback";

function randomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = randomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  return { verifier, challenge };
}

export function getClientId(): string {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Missing VITE_SPOTIFY_CLIENT_ID. Copy .env.example to .env and add your client ID.",
    );
  }
  return clientId;
}

export async function beginLogin(): Promise<void> {
  const { verifier, challenge } = await createPkcePair();
  sessionStorage.setItem("spotify_pkce_verifier", verifier);

  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.assign(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
}

export async function exchangeCodeForToken(
  code: string,
): Promise<{ access_token: string; expires_in: number }> {
  const verifier = sessionStorage.getItem("spotify_pkce_verifier");
  if (!verifier) {
    throw new Error("Missing PKCE verifier. Try logging in again.");
  }

  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  sessionStorage.removeItem("spotify_pkce_verifier");
  return response.json();
}

export type SpotifyProfile = {
  display_name: string;
  email?: string;
  id: string;
  images?: { url: string }[];
};

export async function fetchProfile(accessToken: string): Promise<SpotifyProfile> {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Profile fetch failed: ${text}`);
  }

  return response.json();
}

export function saveToken(accessToken: string, expiresIn: number): void {
  sessionStorage.setItem("spotify_access_token", accessToken);
  sessionStorage.setItem(
    "spotify_token_expires_at",
    String(Date.now() + expiresIn * 1000),
  );
}

export function getSavedToken(): string | null {
  const token = sessionStorage.getItem("spotify_access_token");
  const expiresAt = sessionStorage.getItem("spotify_token_expires_at");
  if (!token || !expiresAt) return null;
  if (Date.now() >= Number(expiresAt)) {
    sessionStorage.removeItem("spotify_access_token");
    sessionStorage.removeItem("spotify_token_expires_at");
    return null;
  }
  return token;
}

export function clearSession(): void {
  sessionStorage.removeItem("spotify_access_token");
  sessionStorage.removeItem("spotify_token_expires_at");
  sessionStorage.removeItem("spotify_pkce_verifier");
}
