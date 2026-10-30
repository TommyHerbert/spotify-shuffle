import { fetchProfile, SPOTIFY_SCOPES, type SpotifyProfile } from "../shared";
import { exchangeCodeAsync, useAuthRequest } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  clearSession,
  loadSession,
  saveSession,
  sessionFromToken,
} from "./session";

WebBrowser.maybeCompleteAuthSession();

const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? "";

const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

const redirectUri = "spotify-shuffle://callback";

export default function App() {
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request] = useAuthRequest(
    {
      clientId,
      scopes: SPOTIFY_SCOPES,
      redirectUri,
      usePKCE: true,
    },
    discovery,
  );

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    loadSession(clientId)
      .then(async (session) => {
        if (!session) return;
        setProfile(await fetchProfile(session.accessToken));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not restore login.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin() {
    if (!request?.url || !request.codeVerifier) return;

    setBusy(true);
    setError(null);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        request.url,
        redirectUri,
      );
      if (result.type !== "success") return;

      const parsed = request.parseReturnUrl(result.url);
      if (parsed.type === "error") {
        setError(parsed.error?.message ?? "Login failed.");
        return;
      }
      if (parsed.type !== "success") return;

      const code = parsed.params.code;
      if (!code) {
        setError("Spotify did not return an authorization code.");
        return;
      }

      const token = await exchangeCodeAsync(
        {
          clientId,
          code,
          redirectUri,
          extraParams: { code_verifier: request.codeVerifier },
        },
        discovery,
      );
      const session = sessionFromToken(token);
      await saveSession(session);
      setProfile(await fetchProfile(session.accessToken));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await clearSession();
    setProfile(null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spotify Shuffle</Text>
      {loading ? (
        <ActivityIndicator color="#1db954" />
      ) : profile ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            Logged in as <Text style={styles.name}>{profile.display_name}</Text>
          </Text>
          {profile.email ? <Text style={styles.muted}>{profile.email}</Text> : null}
          <Pressable style={styles.button} onPress={() => void handleLogout()}>
            <Text style={styles.buttonLabel}>Log out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          {!clientId ? (
            <Text style={styles.error}>
              Missing EXPO_PUBLIC_SPOTIFY_CLIENT_ID in mobile/.env
            </Text>
          ) : (
            <>
              <Text style={styles.body}>
                Add this redirect URI in the Spotify dashboard, save, then log in.
              </Text>
              <Text selectable style={styles.uri}>
                {redirectUri}
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.button, styles.primary, !request && styles.disabled]}
                disabled={!request || busy}
                onPress={() => void handleLogin()}
              >
                <Text style={styles.primaryLabel}>
                  {busy ? "Connecting…" : "Log in with Spotify"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#fafafa",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  body: {
    color: "#fafafa",
    fontSize: 16,
    textAlign: "center",
  },
  name: {
    fontWeight: "700",
  },
  muted: {
    color: "#b3b3b3",
    marginTop: 8,
    textAlign: "center",
  },
  uri: {
    color: "#1db954",
    marginTop: 12,
    textAlign: "center",
  },
  error: {
    color: "#ff6b6b",
    marginTop: 12,
    textAlign: "center",
  },
  button: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: "#282828",
  },
  primary: {
    backgroundColor: "#1db954",
  },
  disabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: "#fafafa",
    fontWeight: "700",
  },
  primaryLabel: {
    color: "#000",
    fontWeight: "700",
  },
});
