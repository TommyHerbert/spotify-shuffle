import { useCallback, useEffect, useRef, useState } from "react";
import {
  LibraryStats,
  fetchLibraryStats,
  shufflablePlaylistCount,
  totalAlbumTracks,
  totalPlaylistTracks,
} from "./library";
import { ShuffledTrack, pickRandomTrack, totalPoolSize } from "./shuffle";
import {
  SpotifyProfile,
  beginLogin,
  clearSession,
  exchangeCodeForToken,
  fetchProfile,
  getSavedToken,
  saveToken,
} from "./spotify";

function CallbackPage({ onComplete }: { onComplete: () => void }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!code) {
      setError("No authorization code in callback URL.");
      return;
    }

    exchangeCodeForToken(code)
      .then((token) => {
        saveToken(token.access_token, token.expires_in);
        window.history.replaceState({}, "", "/");
        onComplete();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Login failed.");
      });
  }, [onComplete]);

  if (error) {
    return (
      <main className="app">
        <h1>Login failed</h1>
        <p className="error">{error}</p>
        <button type="button" onClick={() => (window.location.href = "/")}>
          Back
        </button>
      </main>
    );
  }

  return (
    <main className="app">
      <p>Connecting to Spotify…</p>
    </main>
  );
}

function ShuffleView({
  library,
  onShuffle,
  shuffling,
  track,
}: {
  library: LibraryStats;
  onShuffle: () => void;
  shuffling: boolean;
  track: ShuffledTrack | null;
}) {
  const poolSize = totalPoolSize(library);
  const shufflePlaylists = shufflablePlaylistCount(library.playlists);
  const skippedPlaylists = library.playlists.length - shufflePlaylists;

  return (
    <section className="shuffle">
      <h2>Shuffle</h2>
      <p className="muted">
        {poolSize.toLocaleString()} tracks in the pool (liked songs, album
        tracks, and your own playlist tracks).
        {skippedPlaylists > 0 &&
          ` ${skippedPlaylists} followed playlist(s) excluded — Spotify only allows shuffling playlists you own or collaborate on.`}
      </p>

      <button
        type="button"
        className="primary shuffle-btn"
        onClick={onShuffle}
        disabled={shuffling || poolSize === 0}
      >
        {shuffling ? "Shuffling…" : "Shuffle"}
      </button>

      {track && (
        <article key={track.pickedAt} className="track-card">
          {track.albumArtUrl && (
            <img
              src={track.albumArtUrl}
              alt=""
              width={160}
              height={160}
              className="track-art"
            />
          )}
          <h3 className="track-name">{track.name}</h3>
          <p className="track-artists">{track.artists}</p>
          <p className="muted track-album">{track.albumName}</p>
          <p className="track-source">
            from{" "}
            <span className="source-tag">
              {track.sourceKind === "liked" ? "Liked songs" : track.sourceLabel}
            </span>
          </p>
        </article>
      )}
    </section>
  );
}

function LibraryStatsView({ stats }: { stats: LibraryStats }) {
  const albumTrackTotal = totalAlbumTracks(stats.albums);
  const playlistTrackTotal = totalPlaylistTracks(stats.playlists);
  const shufflePlaylists = shufflablePlaylistCount(stats.playlists);

  return (
    <section className="library">
      <h2>Your library</h2>
      <p className="muted">
        Counts for each source. Followed playlists you don&apos;t own are listed
        but excluded from shuffle.
      </p>

      <div className="stats-grid">
        <article className="stat">
          <span className="stat-value">{stats.likedTracksCount}</span>
          <span className="stat-label">liked songs</span>
        </article>
        <article className="stat">
          <span className="stat-value">{stats.albums.length}</span>
          <span className="stat-label">saved albums</span>
        </article>
        <article className="stat">
          <span className="stat-value">{albumTrackTotal}</span>
          <span className="stat-label">album tracks</span>
        </article>
        <article className="stat">
          <span className="stat-value">{shufflePlaylists}</span>
          <span className="stat-label">shuffle playlists</span>
        </article>
        <article className="stat">
          <span className="stat-value">{playlistTrackTotal}</span>
          <span className="stat-label">shuffle playlist tracks</span>
        </article>
      </div>

      <details className="details">
        <summary>Albums ({stats.albums.length})</summary>
        <ul className="source-list">
          {stats.albums.map((album) => (
            <li key={album.id}>
              <span className="source-name">{album.name}</span>
              <span className="source-count">{album.trackCount} tracks</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="details">
        <summary>Playlists ({stats.playlists.length})</summary>
        <ul className="source-list">
          {stats.playlists.map((playlist) => (
            <li key={playlist.id} className={playlist.shufflable ? "" : "excluded"}>
              <span className="source-name">{playlist.name}</span>
              <span className="source-count">
                {playlist.trackCount} tracks
                {!playlist.shufflable && " · not shufflable"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function HomePage() {
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [library, setLibrary] = useState<LibraryStats | null>(null);
  const [shuffledTrack, setShuffledTrack] = useState<ShuffledTrack | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const libraryRequestId = useRef(0);

  const loadProfile = useCallback(async () => {
    const token = getSavedToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setProfile(await fetchProfile(token));
    } catch (err: unknown) {
      clearSession();
      setErrors([
        err instanceof Error ? err.message : "Could not load profile.",
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    const token = getSavedToken();
    if (!token || !profile) return;

    const requestId = ++libraryRequestId.current;
    setLibraryLoading(true);
    setErrors([]);

    try {
      const result = await fetchLibraryStats(token, profile.id);
      if (requestId !== libraryRequestId.current) return;

      setLibrary(result.stats);
      if (result.errors.length > 0) {
        setErrors(result.errors);
      }
    } catch (err: unknown) {
      if (requestId !== libraryRequestId.current) return;
      setErrors([
        err instanceof Error ? err.message : "Could not load library stats.",
      ]);
    } finally {
      if (requestId === libraryRequestId.current) {
        setLibraryLoading(false);
      }
    }
  }, [profile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile) {
      loadLibrary();
    }
  }, [profile, loadLibrary]);

  function handleLogout() {
    clearSession();
    setProfile(null);
    setLibrary(null);
    setShuffledTrack(null);
  }

  async function handleShuffle() {
    const token = getSavedToken();
    if (!token || !library) return;

    setShuffling(true);
    setErrors([]);

    try {
      setShuffledTrack(
        await pickRandomTrack(token, library, shuffledTrack?.id),
      );
    } catch (err: unknown) {
      setErrors([
        err instanceof Error ? err.message : "Could not shuffle a track.",
      ]);
    } finally {
      setShuffling(false);
    }
  }

  if (loading) {
    return (
      <main className="app">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <h1>Spotify Shuffle</h1>
      <p className="tagline">Random tracks from your library</p>

      {errors.length > 0 && (
        <div className="errors">
          {errors.map((message) => (
            <p key={message} className="error">
              {message}
            </p>
          ))}
          <p className="muted error-hint">
            Open the browser console (F12) for full request details.
          </p>
        </div>
      )}

      {profile ? (
        <>
          <section className="card">
            {profile.images?.[0] && (
              <img
                src={profile.images[0].url}
                alt=""
                width={80}
                height={80}
                className="avatar"
              />
            )}
            <p>
              Logged in as <strong>{profile.display_name}</strong>
            </p>
            {profile.email && <p className="muted">{profile.email}</p>}
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </section>

          {libraryLoading && (
            <section className="card">
              <p>Loading library stats…</p>
            </section>
          )}

          {library && !libraryLoading && (
            <>
              <ShuffleView
                library={library}
                onShuffle={handleShuffle}
                shuffling={shuffling}
                track={shuffledTrack}
              />
              <LibraryStatsView stats={library} />
            </>
          )}
        </>
      ) : (
        <section className="card">
          <p>Connect your Spotify account to get started.</p>
          <button type="button" className="primary" onClick={() => beginLogin()}>
            Log in with Spotify
          </button>
        </section>
      )}
    </main>
  );
}

export default function App() {
  const isCallback = window.location.pathname === "/callback";

  const [ready, setReady] = useState(!isCallback);

  if (isCallback && !ready) {
    return <CallbackPage onComplete={() => setReady(true)} />;
  }

  return <HomePage />;
}
