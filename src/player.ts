import { useCallback, useEffect, useRef, useState } from "react";
import { getSavedToken } from "./spotify";

export type PlayerStatus = "idle" | "loading" | "ready" | "error";

const END_POLL_MS = 500;

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

function trackIdFromUri(uri: string): string {
  const prefix = "spotify:track:";
  if (uri.startsWith(prefix)) {
    return uri.slice(prefix.length);
  }
  throw new Error(`Invalid track URI: ${uri}`);
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

export function useSpotifyPlayer(
  enabled: boolean,
  onTrackEnded?: () => void,
) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const onTrackEndedRef = useRef(onTrackEnded);
  const pollRef = useRef<number | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const endedTrackIdRef = useRef<string | null>(null);
  const userPausedRef = useRef(false);
  const hasStartedRef = useRef(false);

  onTrackEndedRef.current = onTrackEnded;

  const stopEndPoll = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fireTrackEnded = useCallback(() => {
    const trackId = activeTrackIdRef.current;
    if (!trackId || endedTrackIdRef.current === trackId) return;

    endedTrackIdRef.current = trackId;
    activeTrackIdRef.current = null;
    stopEndPoll();
    console.info("[spotify-shuffle] Track ended, auto-advancing");
    onTrackEndedRef.current?.();
  }, [stopEndPoll]);

  const startEndPoll = useCallback(
    (player: SpotifyPlayer, trackId: string) => {
      stopEndPoll();
      activeTrackIdRef.current = trackId;
      endedTrackIdRef.current = null;
      userPausedRef.current = false;
      hasStartedRef.current = false;

      pollRef.current = window.setInterval(() => {
        void player.getCurrentState().then((state) => {
          if (activeTrackIdRef.current !== trackId) return;

          // Single-URI queues often end with null state, or pause with
          // position reset to 0 — neither looks like "near the end".
          if (!state) {
            if (hasStartedRef.current && !userPausedRef.current) {
              fireTrackEnded();
            }
            return;
          }

          setIsPaused(state.paused);

          if (!state.paused) {
            hasStartedRef.current = true;
            return;
          }

          // Paused before we ever heard audio = still loading/transferring.
          if (!hasStartedRef.current) return;

          // Only Pause/Resume sets this; natural end-of-track pauses do not.
          if (userPausedRef.current) return;

          fireTrackEnded();
        });
      }, END_POLL_MS);
    },
    [fireTrackEnded, stopEndPoll],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setError(null);
      setIsPaused(true);
      stopEndPoll();
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

        player.addListener("ready", (data) => {
          const device_id =
            data && "device_id" in data ? data.device_id : undefined;
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

        player.addListener("player_state_changed", (state) => {
          if (cancelled || !state || !("paused" in state)) return;
          setIsPaused(state.paused);
        });

        player.addListener("initialization_error", (data) => {
          if (cancelled) return;
          const message =
            data && "message" in data ? data.message : undefined;
          setError(message ?? "Player initialization failed.");
          setStatus("error");
        });

        player.addListener("authentication_error", (data) => {
          if (cancelled) return;
          const message =
            data && "message" in data ? data.message : undefined;
          setError(message ?? "Authentication failed. Try logging in again.");
          setStatus("error");
        });

        player.addListener("account_error", (data) => {
          if (cancelled) return;
          const message =
            data && "message" in data ? data.message : undefined;
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
      stopEndPoll();
      playerRef.current?.disconnect();
      playerRef.current = null;
      deviceIdRef.current = null;
      activeTrackIdRef.current = null;
      endedTrackIdRef.current = null;
    };
  }, [enabled, stopEndPoll]);

  const play = useCallback(
    async (uri: string) => {
      const token = getSavedToken();
      const deviceId = deviceIdRef.current;
      const player = playerRef.current;

      if (!token || !deviceId || !player) {
        throw new Error(
          "Player is not ready yet. Wait a moment and try again.",
        );
      }

      const trackId = trackIdFromUri(uri);
      stopEndPoll();
      endedTrackIdRef.current = null;
      userPausedRef.current = false;

      await player.activateElement();
      await playTrackOnDevice(token, deviceId, uri);
      startEndPoll(player, trackId);
      setIsPaused(false);
    },
    [startEndPoll, stopEndPoll],
  );

  const togglePause = useCallback(async () => {
    const player = playerRef.current;
    if (!player) {
      throw new Error("Player is not ready yet.");
    }

    await player.activateElement();
    const state = await player.getCurrentState();
    // Mark intentional pauses before toggling so the end-poll doesn't
    // treat Spotify's end-of-track pause as a user pause (or vice versa).
    userPausedRef.current = !(state?.paused ?? true);
    await player.togglePlay();
  }, []);

  return { status, error, isPaused, play, togglePause };
}
