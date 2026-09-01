import { useCallback, useEffect, useRef, useState } from "react";
import { getSavedToken } from "./spotify";

export type PlayerStatus = "idle" | "loading" | "ready" | "error";

let sdkLoadPromise: Promise<void> | null = null;

function loadSpotifySdk(): Promise<void> {
  if (window.Spotify?.Player) {
    return Promise.resolve();
  }

  if (!sdkLoadPromise) {
    sdkLoadPromise = new Promise((resolve, reject) => {
      const previousReady = window.onSpotifyWebPlaybackSDKReady;

      window.onSpotifyWebPlaybackSDKReady = () => {
        previousReady?.();
        resolve();
      };

      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.onerror = () =>
        reject(new Error("Failed to load Spotify Web Playback SDK."));
      document.body.appendChild(script);
    });
  }

  return sdkLoadPromise;
}

async function playTrackOnDevice(
  accessToken: string,
  deviceId: string,
  uri: string,
): Promise<void> {
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [uri] }),
    },
  );

  if (response.status === 204) return;

  const text = await response.text();
  throw new Error(
    text || `Playback failed (${response.status}). Is Spotify Premium active?`,
  );
}

export function useSpotifyPlayer(enabled: boolean) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;

    async function init() {
      setStatus("loading");
      setError(null);

      try {
        await loadSpotifySdk();
        if (cancelled) return;

        const player = new window.Spotify!.Player({
          name: "Spotify Shuffle",
          getOAuthToken: (callback) => {
            const token = getSavedToken();
            if (token) callback(token);
          },
          volume: 0.8,
        });

        player.addListener("ready", ({ device_id }) => {
          if (cancelled || !device_id) return;
          deviceIdRef.current = device_id;
          setStatus("ready");
          console.info("[spotify-shuffle] Player ready", device_id);
        });

        player.addListener("not_ready", () => {
          if (cancelled) return;
          deviceIdRef.current = null;
          setStatus("loading");
        });

        player.addListener("initialization_error", ({ message }) => {
          if (cancelled) return;
          setError(message ?? "Player initialization failed.");
          setStatus("error");
        });

        player.addListener("authentication_error", ({ message }) => {
          if (cancelled) return;
          setError(message ?? "Authentication failed. Try logging in again.");
          setStatus("error");
        });

        player.addListener("account_error", ({ message }) => {
          if (cancelled) return;
          setError(
            message ??
              "Premium account required for in-browser playback.",
          );
          setStatus("error");
        });

        playerRef.current = player;
        const connected = await player.connect();
        if (cancelled) return;

        if (!connected) {
          setError("Could not connect the Spotify player.");
          setStatus("error");
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not initialize player.",
        );
        setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      deviceIdRef.current = null;
    };
  }, [enabled]);

  const play = useCallback(async (uri: string) => {
    const token = getSavedToken();
    const deviceId = deviceIdRef.current;
    const player = playerRef.current;

    if (!token || !deviceId || !player) {
      throw new Error("Player is not ready yet. Wait a moment and try again.");
    }

    await player.activateElement();
    await playTrackOnDevice(token, deviceId, uri);
  }, []);

  return { status, error, play };
}
