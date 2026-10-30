import {
  fetchLibraryStats,
  fetchProfile,
  pickRandomTrack,
  shufflablePlaylistCount,
  SPOTIFY_SCOPES,
  totalAlbumTracks,
  totalPlaylistTracks,
  totalPoolSize,
  type LibraryStats,
  type ShuffledTrack,
  type SpotifyProfile,
} from "../shared";
import { exchangeCodeAsync, useAuthRequest } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
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

function LibraryCounts({ stats }: { stats: LibraryStats }) {
  const albumTrackTotal = totalAlbumTracks(stats.albums);
  const playlistTrackTotal = totalPlaylistTracks(stats.playlists);
  const shufflePlaylists = shufflablePlaylistCount(stats.playlists);
  const skippedPlaylists = stats.playlists.length - shufflePlaylists;

  return (
    <View style={styles.library}>
      <Text style={styles.sectionTitle}>Your library</Text>
      <StatRow label="liked songs" value={stats.likedTracksCount} />
      <StatRow label="saved albums" value={stats.albums.length} />
      <StatRow label="album tracks" value={albumTrackTotal} />
      <StatRow label="shuffle playlists" value={shufflePlaylists} />
      <StatRow label="shuffle playlist tracks" value={playlistTrackTotal} />
      {skippedPlaylists > 0 ? (
        <Text style={styles.muted}>
          {skippedPlaylists} followed playlist(s) excluded — Spotify only allows
          shuffling playlists you own or collaborate on.
        </Text>
      ) : null}
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TrackCard({ track }: { track: ShuffledTrack }) {
  return (
    <View style={styles.trackCard}>
      {track.albumArtUrl ? (
        <Image source={{ uri: track.albumArtUrl }} style={styles.trackArt} />
      ) : null}
      <Text style={styles.trackName}>{track.name}</Text>
      <Text style={styles.trackArtists}>{track.artists}</Text>
      <Text style={styles.muted}>{track.albumName}</Text>
      <Text style={styles.trackSource}>
        from{" "}
        {track.sourceKind === "liked" ? "Liked songs" : track.sourceLabel}
      </Text>
    </View>
  );
}

export default function App() {
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryStats | null>(null);
  const [track, setTrack] = useState<ShuffledTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const libraryRequestId = useRef(0);
  const shufflingRef = useRef(false);
  const trackRef = useRef<ShuffledTrack | null>(null);
  trackRef.current = track;

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
        setAccessToken(session.accessToken);
        setProfile(await fetchProfile(session.accessToken));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not restore login.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!profile || !accessToken) {
      setLibrary(null);
      return;
    }

    const requestId = ++libraryRequestId.current;
    setLibraryLoading(true);
    setError(null);

    fetchLibraryStats(accessToken, profile.id)
      .then((result) => {
        if (requestId !== libraryRequestId.current) return;
        setLibrary(result.stats);
        if (result.errors.length > 0) {
          setError(result.errors.join("\n"));
        }
      })
      .catch((err: unknown) => {
        if (requestId !== libraryRequestId.current) return;
        setError(
          err instanceof Error ? err.message : "Could not load library stats.",
        );
      })
      .finally(() => {
        if (requestId === libraryRequestId.current) {
          setLibraryLoading(false);
        }
      });
  }, [profile, accessToken]);

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
      setAccessToken(session.accessToken);
      setProfile(await fetchProfile(session.accessToken));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleShuffleAndPlay() {
    if (!accessToken || !library || shufflingRef.current) return;

    shufflingRef.current = true;
    setShuffling(true);
    setError(null);

    try {
      const next = await pickRandomTrack(
        accessToken,
        library,
        trackRef.current?.id,
      );
      setTrack(next);
      await Linking.openURL(next.uri);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not shuffle or open Spotify.",
      );
    } finally {
      shufflingRef.current = false;
      setShuffling(false);
    }
  }

  async function handleLogout() {
    libraryRequestId.current += 1;
    await clearSession();
    setAccessToken(null);
    setProfile(null);
    setLibrary(null);
    setTrack(null);
    setError(null);
  }

  const poolSize = library ? totalPoolSize(library) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spotify Shuffle</Text>
      {loading ? (
        <ActivityIndicator color="#1db954" />
      ) : profile ? (
        <ScrollView
          contentContainerStyle={styles.card}
          style={styles.scroll}
        >
          <Text style={styles.body}>
            Logged in as <Text style={styles.name}>{profile.display_name}</Text>
          </Text>
          {profile.email ? <Text style={styles.muted}>{profile.email}</Text> : null}
          {libraryLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color="#1db954" />
              <Text style={styles.muted}>Loading library…</Text>
            </View>
          ) : library ? (
            <>
              <LibraryCounts stats={library} />
              <Text style={styles.muted}>
                {poolSize.toLocaleString()} tracks in the shuffle pool. Playback
                opens in the Spotify app so it can continue with the screen locked.
              </Text>
              <Pressable
                style={[
                  styles.button,
                  styles.primary,
                  (shuffling || poolSize === 0) && styles.disabled,
                ]}
                disabled={shuffling || poolSize === 0}
                onPress={() => void handleShuffleAndPlay()}
              >
                <Text style={styles.primaryLabel}>
                  {shuffling
                    ? "Shuffling…"
                    : track
                      ? "Shuffle"
                      : "Shuffle & Play"}
                </Text>
              </Pressable>
              {track ? <TrackCard track={track} /> : null}
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.button} onPress={() => void handleLogout()}>
            <Text style={styles.buttonLabel}>Log out</Text>
          </Pressable>
        </ScrollView>
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
  scroll: {
    width: "100%",
    maxWidth: 420,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    paddingBottom: 24,
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
  loadingBlock: {
    marginTop: 24,
    alignItems: "center",
    gap: 8,
  },
  library: {
    width: "100%",
    marginTop: 24,
  },
  sectionTitle: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#282828",
  },
  statValue: {
    color: "#1db954",
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    color: "#b3b3b3",
    fontSize: 14,
  },
  trackCard: {
    width: "100%",
    marginTop: 24,
    alignItems: "center",
  },
  trackArt: {
    width: 160,
    height: 160,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#282828",
  },
  trackName: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  trackArtists: {
    color: "#fafafa",
    fontSize: 16,
    marginTop: 4,
    textAlign: "center",
  },
  trackSource: {
    color: "#1db954",
    marginTop: 8,
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
