# Spotify Shuffle

Play a random song from your albums, playlists, and liked songs — inspired by classic iPod shuffle.

The App picks a random track from your library and plays it in the browser via the Spotify Web Playback SDK. Requires Spotify Premium.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Web | Vite + React + TypeScript | Desktop player, OAuth with PKCE |
| Mobile | Expo (SDK 58) in `mobile/` | Shared path toward iOS and Android |

Library fetching and shuffle selection live in `shared/` and are imported by both apps. Login, token storage, and in-browser playback stay in the web app.

## Prerequisites

- Node.js 22+ (Expo SDK 58). The web app also runs on this.
- A [Spotify Developer app](https://developer.spotify.com/dashboard)
- Spotify Premium (required for in-browser playback)

## Spotify dashboard setup

In your app settings at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):

1. **Redirect URI** — add exactly (Spotify rejects `localhost`; use the loopback IP):
   ```
   http://127.0.0.1:5173/callback
   ```
2. Save.
3. Enable the **Web Playback SDK** for this app (in app settings).

For production on your own domain, add an HTTPS URI too, e.g. `https://shuffle.tommyherbert.com/callback`.

## Run locally

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173** (not `localhost`), click **Log in with Spotify**, approve access, wait for "Playing in this browser", then hit **Shuffle & Play**.

If you logged in before playback was added, log out and back in — new scopes (`streaming`, playback state) are required.

## Run on a phone

The Expo app is in `mobile/`. It can log in with Spotify and show your display name. It does not load your library or play music yet.

```bash
cd mobile
npx expo start
```

The phone runs a development build of this app, not Expo Go. Expo Go cannot register a redirect Spotify will send the login back to.

Copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` to the same client ID as the web app.

Add this redirect URI in the [Spotify dashboard](https://developer.spotify.com/dashboard), then save:

```
spotify-shuffle://callback
```

**Android.** Turn on Developer options and USB debugging, plug the phone in, then install the app once:

```bash
cd mobile
npx expo run:android
```

That build needs a JDK 17 or 21 and the Android SDK. It installs **Spotify Shuffle** on the phone. After that, start the dev server and open that installed app (the phone and computer need to be on the same Wi-Fi):

```bash
npx expo start
```

Once the app is open on the phone, you can reload it after a code change by pressing **r** in the terminal where `npx expo start` is running. Restart the dev server after changing `mobile/.env`.

**iPhone.** A development build needs a Mac or a cloud build. App Store Expo Go cannot open this project. Locked-screen playback will need that build too, because Spotify audio has to run in the Spotify app.

## Environment

Copy `.env.example` to `.env` and set your client ID:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

Do **not** put your client secret in this project — the web app doesn't need it.

## Next steps

1. Load the real library on the phone through `shared/`
2. On phones, play through the Spotify app so audio continues with the screen locked
3. Deploy the web app to `shuffle.tommyherbert.com` with HTTPS

