import * as SecureStore from "expo-secure-store";
import { refreshAsync, type TokenResponse } from "expo-auth-session";

const KEY = "spotify_session";

const discovery = {
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

export type StoredSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export function sessionFromToken(token: TokenResponse): StoredSession {
  const expiresIn = token.expiresIn ?? 3600;
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.issuedAt + expiresIn * 1000,
  };
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export async function loadSession(clientId: string): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;

  const session = JSON.parse(raw) as StoredSession;
  if (Date.now() < session.expiresAt - 60_000) return session;
  if (!session.refreshToken) {
    await clearSession();
    return null;
  }

  const refreshed = await refreshAsync(
    { clientId, refreshToken: session.refreshToken },
    discovery,
  );
  const next = sessionFromToken(refreshed);
  if (!next.refreshToken) next.refreshToken = session.refreshToken;
  await saveSession(next);
  return next;
}
