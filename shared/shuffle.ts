import {
  AlbumSummary,
  LibraryStats,
  PlaylistSummary,
  SpotifyApiError,
  spotifyGetWithRetry,
  totalAlbumTracks,
  totalPlaylistTracks,
} from "./library";

type TrackSource =
  | { kind: "liked"; label: "Liked songs"; count: number }
  | { kind: "album"; id: string; label: string; count: number }
  | { kind: "playlist"; id: string; label: string; count: number };

type ApiTrack = {
  id: string;
  name: string;
  uri: string;
  type?: string;
  artists: { name: string }[];
  album?: { name: string; images?: { url: string }[] };
};

type PlaylistItemEntry = {
  item?: ApiTrack | null;
  track?: ApiTrack | null;
};

export type ShuffledTrack = {
  id: string;
  name: string;
  uri: string;
  artists: string;
  albumName: string;
  albumArtUrl?: string;
  sourceKind: TrackSource["kind"];
  sourceLabel: string;
  pickedAt: number;
};

const MAX_UNAVAILABLE_RETRIES = 5;
const MAX_PICK_ATTEMPTS = 25;

export function totalPoolSize(stats: LibraryStats): number {
  return (
    stats.likedTracksCount +
    totalAlbumTracks(stats.albums) +
    totalPlaylistTracks(stats.playlists)
  );
}

function buildSources(stats: LibraryStats): TrackSource[] {
  const sources: TrackSource[] = [];

  if (stats.likedTracksCount > 0) {
    sources.push({
      kind: "liked",
      label: "Liked songs",
      count: stats.likedTracksCount,
    });
  }

  for (const album of stats.albums) {
    if (album.trackCount > 0) {
      sources.push(albumSource(album));
    }
  }

  for (const playlist of stats.playlists) {
    if (playlist.shufflable && playlist.trackCount > 0) {
      sources.push(playlistSource(playlist));
    }
  }

  return sources;
}

function albumSource(album: AlbumSummary): TrackSource {
  return {
    kind: "album",
    id: album.id,
    label: album.name,
    count: album.trackCount,
  };
}

function playlistSource(playlist: PlaylistSummary): TrackSource {
  return {
    kind: "playlist",
    id: playlist.id,
    label: playlist.name,
    count: playlist.trackCount,
  };
}

function pickRandomInt(max: number): number {
  if (max <= 0) throw new Error("Cannot pick from empty range");
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

function pickRandomSlot(sources: TrackSource[]): {
  source: TrackSource;
  index: number;
} {
  const total = sources.reduce((sum, source) => sum + source.count, 0);
  let pick = pickRandomInt(total);

  for (const source of sources) {
    if (pick < source.count) {
      return { source, index: pick };
    }
    pick -= source.count;
  }

  throw new Error("Failed to pick a random slot");
}

function formatArtists(artists: { name: string }[]): string {
  return artists.map((artist) => artist.name).join(", ");
}

function trackFromPlaylistItem(entry: PlaylistItemEntry | undefined): ApiTrack | null {
  const candidate = entry?.item ?? entry?.track ?? null;
  if (!candidate || candidate.type === "episode") return null;
  return candidate;
}

async function fetchTrackAt(
  accessToken: string,
  source: TrackSource,
  index: number,
): Promise<ApiTrack | null> {
  const params = { limit: "1", offset: String(index) };

  if (source.kind === "liked") {
    const page = await spotifyGetWithRetry<{
      items: { track: ApiTrack | null }[];
    }>(accessToken, "/me/tracks", params);
    return page.items[0]?.track ?? null;
  }

  if (source.kind === "album") {
    const page = await spotifyGetWithRetry<{ items: ApiTrack[] }>(
      accessToken,
      `/albums/${source.id}/tracks`,
      params,
    );
    return page.items[0] ?? null;
  }

  try {
    const page = await spotifyGetWithRetry<{
      items: PlaylistItemEntry[];
    }>(accessToken, `/playlists/${source.id}/items`, params);
    return trackFromPlaylistItem(page.items[0]);
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 403) {
      console.warn("[spotify-shuffle] Playlist not accessible for shuffle", {
        playlist: source.label,
        id: source.id,
      });
      return null;
    }
    throw err;
  }
}

function toShuffledTrack(track: ApiTrack, source: TrackSource): ShuffledTrack {
  return {
    id: track.id,
    name: track.name,
    uri: track.uri,
    artists: formatArtists(track.artists),
    albumName: track.album?.name ?? source.label,
    albumArtUrl: track.album?.images?.[0]?.url,
    sourceKind: source.kind,
    sourceLabel: source.label,
    pickedAt: Date.now(),
  };
}

export async function pickRandomTrack(
  accessToken: string,
  stats: LibraryStats,
  excludeTrackId?: string,
): Promise<ShuffledTrack> {
  const sources = buildSources(stats);
  if (sources.length === 0) {
    throw new Error("Your library has no tracks to shuffle.");
  }

  let unavailableRetries = 0;
  let lastTrack: ShuffledTrack | undefined;

  for (let attempt = 0; attempt < MAX_PICK_ATTEMPTS; attempt++) {
    const { source, index } = pickRandomSlot(sources);
    const track = await fetchTrackAt(accessToken, source, index);

    if (!track) {
      unavailableRetries++;
      if (unavailableRetries >= MAX_UNAVAILABLE_RETRIES) {
        break;
      }
      console.warn("[spotify-shuffle] Slot unavailable, retrying", {
        source: source.label,
        index,
        attempt: unavailableRetries,
      });
      continue;
    }

    const result = toShuffledTrack(track, source);
    lastTrack = result;

    if (excludeTrackId && track.id === excludeTrackId) {
      console.info("[spotify-shuffle] Same track as last pick, re-rolling", {
        track: track.name,
        attempt: attempt + 1,
      });
      continue;
    }

    console.info("[spotify-shuffle] Picked track", {
      source: source.label,
      index,
      track: track.name,
      trackId: track.id,
    });
    return result;
  }

  if (lastTrack) {
    return lastTrack;
  }

  throw new Error("Could not find an available track. Try again.");
}
