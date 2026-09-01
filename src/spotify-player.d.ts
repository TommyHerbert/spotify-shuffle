interface SpotifyPlayerInit {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  activateElement: () => Promise<void>;
  addListener: (event: string, callback: (data: { device_id?: string; message?: string }) => void) => void;
}

interface SpotifyNamespace {
  Player: new (options: SpotifyPlayerInit) => SpotifyPlayer;
}

interface Window {
  onSpotifyWebPlaybackSDKReady?: () => void;
  Spotify?: SpotifyNamespace;
}
