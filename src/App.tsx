import { useCallback, useEffect, useRef, useState } from "react";
import {
  LibraryStats,
  fetchLibraryStats,
  totalAlbumTracks,
  totalPlaylistTracks,
} from "./library";
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

function LibraryStatsView({ stats }: { stats: LibraryStats }) {
  const albumTrackTotal = totalAlbumTracks(stats.albums);
  const playlistTrackTotal = totalPlaylistTracks(stats.playlists);

  return (
    <section className="library">
      <h2>Your library</h2>
      <p className="muted">
        Counts for each source — the same song can appear in more than one.
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
          <span className="stat-value">{stats.playlists.length}</span>
          <span className="stat-label">playlists</span>
        </article>
        <article className="stat">
          <span className="stat-value">{playlistTrackTotal}</span>
          <span className="stat-label">playlist tracks</span>
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
            <li key={playlist.id}>
              <span className="source-name">{playlist.name}</span>
              <span className="source-count">{playlist.trackCount} tracks</span>
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
    if (!token) return;

    const requestId = ++libraryRequestId.current;
    setLibraryLoading(true);
    setErrors([]);

    try {
      const result = await fetchLibraryStats(token);
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
  }, []);

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
      <p className="tagline">Building your shuffle pool</p>

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

          {library && !libraryLoading && <LibraryStatsView stats={library} />}
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
