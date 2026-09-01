# Spotify Shuffle

Play a random song from your albums, playlists, and liked songs — inspired by classic iPod shuffle.

## Current status: Hello World

A minimal web app that proves Spotify login works. After signing in, it shows your Spotify display name. That's the foundation for fetching libraries and playing tracks in later steps.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Web (now) | Vite + React + TypeScript | Fast dev server, simple OAuth with PKCE |
| Mobile (later) | Expo or Capacitor | Wrap the same app for iOS/Android |

## Prerequisites

- Node.js 18+
- A [Spotify Developer app](https://developer.spotify.com/dashboard)
- Spotify Premium (required for playback later)

## Spotify dashboard setup

In your app settings at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):

1. **Redirect URI** — add exactly (Spotify rejects `localhost`; use the loopback IP):
   ```
   http://127.0.0.1:5173/callback
   ```
2. Save.

For production on your own domain, add an HTTPS URI too, e.g. `https://shuffle.tommyherbert.com/callback`.

## Run locally

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173** (not `localhost`), click **Log in with Spotify**, approve access, and you should see your name.

## Environment

Copy `.env.example` to `.env` and set your client ID:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

Do **not** put your client secret in this project — the web app doesn't need it.

## Next steps

1. Fetch saved albums, playlists, and liked tracks
2. Pick a random track from the combined library
3. Start playback via Spotify Web API / Web Playback SDK
4. Add mobile builds (Expo or Capacitor)

