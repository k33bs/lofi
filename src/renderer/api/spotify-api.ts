import { SPOTIFY_API_URL as API_URL } from '../../constants';
import { AuthData, refreshAccessToken } from '../../main/auth';

export enum AccountType {
  Free = 'free',
  Premium = 'premium',
}

interface SpotifyImage {
  url: string;
}

interface SpotifyAccount {
  id: string;
  product: string;
  email: string;
  display_name: string;
  images: SpotifyImage[];
}

export interface SpotifyUserProfile {
  id: string;
  product: string;
  email: string;
  name: string;
  avatar: string;
  accountType: AccountType;
}

export interface SpotifyCurrentlyPlaying {
  device: {
    volume_percent: number;
  };
  progress_ms: number;
  item: {
    album: {
      name: string;
      images: [
        {
          height: number;
          width: number;
          url: string;
        }
      ];
    };
    artists: [
      {
        name: string;
      }
    ];
    description: string;
    id: string;
    images: [
      {
        height: number;
        width: number;
        url: string;
      }
    ];
    duration_ms: number;
    name: string;
    type: string;
  };
  is_playing: boolean;
}

class SpotifyApi {
  private isThrottled: boolean;

  private throttleTime: number;

  private accessToken: string;

  private refreshToken: string;

  async updateTokens(data: AuthData): Promise<SpotifyUserProfile> {
    this.accessToken = data?.access_token;
    this.refreshToken = data?.refresh_token;

    if (!this.accessToken) {
      return null;
    }

    const userProfile = await this.fetch<SpotifyAccount>('/me', {
      method: 'GET',
    });

    return {
      ...userProfile,
      accountType: userProfile?.product as AccountType,
      name: userProfile?.display_name,
      avatar: userProfile?.images?.length > 0 ? userProfile?.images[0].url : '',
    };
  }

  async getCurrentlyPlaying(): Promise<SpotifyCurrentlyPlaying> {
    return this.fetch<SpotifyCurrentlyPlaying>('/me/player?additional_types=episode', {
      method: 'GET',
    });
  }

  async play(pause: boolean): Promise<void> {
    if (pause) {
      await this.fetch('/me/player/pause', {
        method: 'PUT',
      });
    } else {
      await this.fetch('/me/player/play', {
        method: 'PUT',
      });
    }
  }

  async skip(isForward: boolean): Promise<void> {
    await this.fetch(`/me/player/${isForward ? 'next' : 'previous'}`, {
      method: 'POST',
    });
  }

  // Spotify's February 2026 migration replaced /me/tracks with /me/library (URIs instead of ids)
  async like(isLiked: boolean, itemId: string, itemType: 'track' | 'episode' = 'track'): Promise<void> {
    const verb = isLiked ? 'DELETE' : 'PUT';
    await this.fetch(`/me/library?uris=${encodeURIComponent(`spotify:${itemType}:${itemId}`)}`, {
      method: verb,
    });
  }

  async isTrackLiked(itemId: string, itemType: 'track' | 'episode' = 'track'): Promise<boolean> {
    const likedResponse: Array<boolean> = await this.fetch(
      `/me/library/contains?uris=${encodeURIComponent(`spotify:${itemType}:${itemId}`)}`,
      {
        method: 'GET',
      }
    );

    if (!likedResponse || likedResponse.length === 0) {
      return false;
    }
    return likedResponse[0];
  }

  async seek(newProgress: number): Promise<void> {
    await this.fetch(`/me/player/seek?position_ms=${newProgress}`, {
      method: 'PUT',
    });
  }

  async setVolume(newVolume: number): Promise<void> {
    await this.fetch(`/me/player/volume?volume_percent=${newVolume}`, {
      method: 'PUT',
    });
  }

  private async fetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    if (!this.accessToken) {
      return null;
    }

    if (this.isThrottled) {
      const timeLeft = this.throttleTime - new Date().getTime();
      if (timeLeft > 0) {
        throw new Error(`API calls throttled, wait ${Math.round(timeLeft / 1000)}s...`);
      }
      this.isThrottled = false;
    }

    const initWithBearer = {
      ...init,
      headers: new Headers({
        Authorization: `Bearer ${this.accessToken}`,
      }),
    };

    const res = await fetch(API_URL + input, initWithBearer);
    switch (res.status) {
      case 200: {
        // some endpoints return 200 with an empty or non-JSON body
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          // surface contract violations instead of silently reading them as "nothing playing"
          // eslint-disable-next-line no-console
          console.error(`Unparseable 200 response from ${input}: ${text.slice(0, 120)}`);
          return null;
        }
      }
      case 204: {
        return null;
      }
      case 401: {
        if (this.refreshToken) {
          // force: the current access token is known dead, the reuse guard must not re-emit it
          await refreshAccessToken(this.refreshToken, true);
        }
        break;
      }
      case 429: {
        const retryAfter = parseInt(res.headers.get('retry-after'), 10) + 1;
        if (retryAfter) {
          this.throttleTime = new Date().getTime() + retryAfter * 1000;
          this.isThrottled = true;
        }
        break;
      }
      default: {
        break;
      }
    }

    // error bodies are not guaranteed to be JSON
    let message = res.statusText || 'Request failed';
    try {
      message = (await res.json()).error.message;
    } catch {
      // keep statusText
    }
    throw new Error(`${res.status}: ${message}`);
  }
}

export const SpotifyApiInstance = new SpotifyApi();
