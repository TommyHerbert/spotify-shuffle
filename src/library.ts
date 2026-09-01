type PagedResponse<T> = {
  items: T[];
  total: number;
  next: string | null;
};

const RETRYABLE_STATUSES = new Set([502, 503, 429]);
const MAX_RETRIES = 3;

export class SpotifyApiError extends Error {
  readonly endpoint: string;
  readonly status: number;
  readonly url: string;

  constructor(endpoint: string, status: number, url: string, body: string) {
    super(`Spotify API error on ${endpoint} (${status}): ${body}`);
    this.name = "SpotifyApiError";
    this.endpoint = endpoint;
    this.status = status;
    this.url = url;
  }
}

function describeRequest(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function spotifyGet<T>(
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const endpoint = describeRequest(path, params);
  const url = new URL(`https://api.spotify.com/v1${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  console.info("[spotify-shuffle] API request", endpoint);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[spotify-shuffle] API request failed", {
      endpoint,
      status: response.status,
      url: url.toString(),
      body: text,
    });
    throw new SpotifyApiError(endpoint, response.status, url.toString(), text);
  }

  console.info("[spotify-shuffle] API request ok", endpoint);
  return response.json();
}

async function spotifyGetWithRetry<T>(
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const endpoint = describeRequest(path, params);
  let lastError: SpotifyApiError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await spotifyGet<T>(accessToken, path, params);
    } catch (err) {
      if (!(err instanceof SpotifyApiError)) throw err;
      lastError = err;

      if (!RETRYABLE_STATUSES.has(err.status) || attempt === MAX_RETRIES) {
        throw err;
      }

      const delayMs = 500 * 2 ** attempt;
      console.warn(
        `[spotify-shuffle] Retrying ${endpoint} in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${endpoint}`);
}

type PageFetchResult<T> = {
  total: number;
  items: T[];
  partial: boolean;
  failedAtOffset?: number;
};

async function fetchAllPages<T>(
  accessToken: string,
  path: string,
): Promise<PageFetchResult<T>> {
  const items: T[] = [];
  let offset = 0;
  const limit = 50;
  let total = 0;

  while (true) {
    try {
      const page = await spotifyGetWithRetry<PagedResponse<T>>(accessToken, path, {
        limit: String(limit),
        offset: String(offset),
      });

      total = page.total;
      items.push(...page.items);

      if (!page.next) {
        return { total, items, partial: false };
      }

      offset += limit;
    } catch (err) {
      if (items.length > 0) {
        console.warn("[spotify-shuffle] Returning partial results", {
          path,
          loaded: items.length,
          total,
          failedAtOffset: offset,
          err,
        });
        return { total, items, partial: true, failedAtOffset: offset };
      }
      throw err;
    }
  }
}

export type AlbumSummary = {
  id: string;
  name: string;
  trackCount: number;
};

export type PlaylistSummary = {
  id: string;
  name: string;
  trackCount: number;
};

export type LibraryStats = {
  likedTracksCount: number;
  albums: AlbumSummary[];
  playlists: PlaylistSummary[];
};

export type LibraryFetchResult = {
  stats: LibraryStats;
  errors: string[];
};

export async function fetchLibraryStats(
  accessToken: string,
): Promise<LibraryFetchResult> {
  const errors: string[] = [];

  const [likedResult, albumsResult, playlistsResult] = await Promise.allSettled([
    spotifyGetWithRetry<PagedResponse<unknown>>(accessToken, "/me/tracks", {
      limit: "1",
    }),
    fetchAllPages<{ album: { id: string; name: string; total_tracks: number } }>(
      accessToken,
      "/me/albums",
    ),
    fetchAllPages<{
      id: string;
      name: string;
      items?: { total: number };
      tracks?: { total: number };
    }>(accessToken, "/me/playlists"),
  ]);

  if (likedResult.status === "rejected") {
    errors.push(formatFetchError("liked songs count", likedResult.reason));
  }

  let albums: AlbumSummary[] = [];
  if (albumsResult.status === "fulfilled") {
    albums = albumsResult.value.items.map(({ album }) => ({
      id: album.id,
      name: album.name,
      trackCount: album.total_tracks,
    }));
    if (albumsResult.value.partial) {
      errors.push(formatPartialError("saved albums", albumsResult.value));
    }
  } else {
    errors.push(formatFetchError("saved albums", albumsResult.reason));
  }

  let playlists: PlaylistSummary[] = [];
  if (playlistsResult.status === "fulfilled") {
    playlists = playlistsResult.value.items.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
    }));
    if (playlistsResult.value.partial) {
      errors.push(formatPartialError("playlists", playlistsResult.value));
    }
  } else {
    errors.push(formatFetchError("playlists", playlistsResult.reason));
  }

  if (
    likedResult.status === "rejected" &&
    albumsResult.status === "rejected" &&
    playlistsResult.status === "rejected"
  ) {
    throw new Error(errors.join("\n"));
  }

  return {
    stats: {
      likedTracksCount:
        likedResult.status === "fulfilled" ? likedResult.value.total : 0,
      albums,
      playlists,
    },
    errors,
  };
}

function formatPartialError(
  source: string,
  result: PageFetchResult<unknown>,
): string {
  const loaded = result.items.length;
  const total = result.total || loaded;
  return `${source}: loaded ${loaded} of ${total} (failed at offset ${result.failedAtOffset ?? "?"})`;
}

function formatFetchError(source: string, reason: unknown): string {
  if (reason instanceof SpotifyApiError) {
    return `${source}: ${reason.message}`;
  }
  const message =
    reason instanceof Error ? reason.message : "Unknown error";
  console.error("[spotify-shuffle] Unexpected error fetching", source, reason);
  return `${source}: ${message}`;
}

export function totalAlbumTracks(albums: AlbumSummary[]): number {
  return albums.reduce((sum, album) => sum + album.trackCount, 0);
}

export function totalPlaylistTracks(playlists: PlaylistSummary[]): number {
  return playlists.reduce((sum, playlist) => sum + playlist.trackCount, 0);
}
