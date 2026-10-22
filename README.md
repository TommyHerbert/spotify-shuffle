# Spotify Shuffle

Play a random song from your albums, playlists, and liked songs — inspired by classic iPod shuffle.

The App picks a random track from your library and plays it in the browser via the Spotify Web Playback SDK. Requires Spotify Premium.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Web | Vite + React + TypeScript | Desktop player, OAuth with PKCE |
| Mobile | Expo (SDK 58) in `mobile/` | Shared path toward iOS and Android |

The phone app is a placeholder so far. Shuffle and playback still live in the web app.

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

The Expo app is in `mobile/`. It does not talk to Spotify yet. This only checks that the phone can load the dev build.

```bash
cd mobile
npx expo start
```

Install **Expo Go for SDK 58** on the phone, then scan the QR code. The phone and computer need to be on the same Wi-Fi.

Expo Go only runs one SDK, and it must match this project (`expo` ~58 in `mobile/package.json`).

**Android.** The Play Store copy often lags a new SDK and shows "Project is incompatible with this version of Expo Go" even when it tells you to update from the store. Uninstall that copy, then install the SDK 58 build from [expo.dev/go](https://expo.dev/go) or the [Expo Go 58.0.5 APK](https://github.com/expo/expo-go-releases/releases/download/Expo-Go-58.0.5/Expo-Go-58.0.5.apk). Android will ask you to allow installs from the browser. Restart `npx expo start` and scan again.

**iPhone.** App Store Expo Go stops at SDK 54, so it cannot open this project. A physical iPhone needs a development build (or an Expo Go build through TestFlight). That is also what locked-screen playback will need later, because Spotify audio has to run in the Spotify app, not in Expo Go.

## Environment

Copy `.env.example` to `.env` and set your client ID:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

Do **not** put your client secret in this project — the web app doesn't need it.

## Next steps

1. Share shuffle and Spotify API code between the web app and `mobile/`
2. On phones, play through the Spotify app so audio continues with the screen locked
3. Deploy the web app to `shuffle.tommyherbert.com` with HTTPS

