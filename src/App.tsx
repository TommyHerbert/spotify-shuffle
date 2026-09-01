import { useCallback, useEffect, useState } from "react";
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

function HomePage() {
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  function handleLogout() {
    clearSession();
    setProfile(null);
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
      <p className="tagline">Hello World — Spotify auth is working.</p>

      {error && <p className="error">{error}</p>}

      {profile ? (
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
