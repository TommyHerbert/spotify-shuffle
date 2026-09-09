interface SpotifyPlayerInit {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}

interface WebPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: { id: string | null; uri: string; name: string } | null;
  };
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  activateElement: () => Promise<void>;
  getCurrentState: () => Promise<WebPlaybackState | null>;
  addListener: (
    event: string,
    callback: (data: WebPlaybackState | { device_id?: string; message?: string } | null) => void,
  ) => boolean;
}

interface SpotifyNamespace {
  Player: new (options: SpotifyPlayerInit) => SpotifyPlayer;
}

interface Window {
  onSpotifyWebPlaybackSDKReady?: () => void;
  Spotify?: SpotifyNamespace;
}
