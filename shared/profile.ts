export type SpotifyProfile = {
  display_name: string;
  email?: string;
  id: string;
  images?: { url: string }[];
};

export async function fetchProfile(accessToken: string): Promise<SpotifyProfile> {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Profile fetch failed: ${text}`);
  }

  return response.json();
}
