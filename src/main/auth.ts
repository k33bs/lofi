/* eslint-disable no-console */
import crypto from 'crypto';
import * as http from 'http';

export interface AuthData {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  scope?: string;
}

let server: http.Server;
let codeState: string;
let codeVerifier: string;
let refreshTokenTimeoutId: NodeJS.Timeout;
let onTokenRetrieved: (data: AuthData) => void = null;

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const AUTH_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTH_PORT = 41419;

// no client id ships with the app: Spotify's development-mode rules mean every
// user registers their own app (free) and pastes its client id into lofi
let authClientId = '';

export const setAuthClientId = (clientId: string): void => {
  authClientId = clientId || '';
};
const AUTH_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
  'user-library-read',
  'user-library-modify',
  'user-read-email',
];

const base64URLEncode = (str: Buffer): string =>
  str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const sha256 = (str: string): Buffer => crypto.createHash('sha256').update(str).digest();

export const setTokenRetrievedCallback = (callback: (data: AuthData) => void): void => {
  if (onTokenRetrieved) {
    console.warn('Token retrieved callback already set, it should only be set once.');
  }

  onTokenRetrieved = callback;
};

export const getAuthUrl = (): string => {
  codeVerifier = base64URLEncode(crypto.randomBytes(32));
  codeState = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(sha256(codeVerifier));
  const scopes = AUTH_SCOPES.join('%20');

  const authUrl =
    `${AUTH_URL}?response_type=code&client_id=${authClientId}&redirect_uri=http://127.0.0.1:${AUTH_PORT}&` +
    `scope=${scopes}&state=${codeState}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  return authUrl;
};

const scopesMatch = (scope: string): boolean => {
  const tokenScopes = scope.split(' ').sort();
  const requiredScopes = AUTH_SCOPES.sort();

  const isScopesMatch =
    tokenScopes.length === requiredScopes.length &&
    tokenScopes.every((element, index) => element === requiredScopes[index]);

  return isScopesMatch;
};

const setRefreshTokenInterval = (data: AuthData): void => {
  if (refreshTokenTimeoutId) {
    clearInterval(refreshTokenTimeoutId);
    refreshTokenTimeoutId = null;
  }

  if (data && data.refresh_token) {
    const expiresIn = data.expires_in ?? 60 * 60;
    refreshTokenTimeoutId = setInterval(
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      () => refreshAccessToken(data.refresh_token),
      // refresh at token's half-life ('expires_in' is in seconds)
      (expiresIn * 1000) / 2
    );
  }
};

let lastRefreshAt = 0;
let lastAuthData: AuthData = null;
const REFRESH_REUSE_GUARD_MS = 5 * 60 * 1000;

// on logout the cached tokens must go, or a refresh call within the guard
// window would resurrect the logged-out session
export const clearAuthCache = (): void => {
  lastRefreshAt = 0;
  lastAuthData = null;
};

export const refreshAccessToken = async (refreshToken: string, force = false): Promise<void> => {
  // Spotify rotates refresh tokens and revokes the grant on reuse; a remount
  // asking again right after a successful refresh must not burn the new token.
  // Re-emit the cached tokens so a freshly mounted tree still gets its profile.
  // `force` bypasses this for 401 recovery, where the cached token is known dead.
  if (!force && Date.now() - lastRefreshAt < REFRESH_REUSE_GUARD_MS) {
    console.log('Skipping token refresh, last refresh was moments ago.');
    if (onTokenRetrieved && lastAuthData) {
      onTokenRetrieved(lastAuthData);
    }
    return;
  }

  console.log('Refreshing access token...');

  const body = `client_id=${authClientId}&grant_type=refresh_token&refresh_token=${refreshToken}`;

  const res = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
    }),
    body,
  });

  let data = await res.json();

  if (res.status !== 200) {
    const errorText = data.error_description;
    console.error(`status ${res.status}: Failed to retrieve access token\n  ${data.error}: ${errorText}`);
    data = null;
    clearAuthCache();
  } else if (!scopesMatch(data.scope)) {
    console.warn(
      `Authorization scopes mismatch\n    Expected: ${AUTH_SCOPES.join(' ')}\n    Token has: '${data.scope}`
    );
    data = null;
  } else {
    lastRefreshAt = Date.now();
    lastAuthData = data;
    console.log('Access token refreshed.');
  }

  setRefreshTokenInterval(data);
  onTokenRetrieved(data);
};

const retrieveAccessToken = async (verifier: string, code: string): Promise<AuthData> => {
  console.log('Retrieving access token...');

  const body =
    `client_id=${authClientId}&grant_type=authorization_code&` +
    `code=${code}&redirect_uri=http://127.0.0.1:${AUTH_PORT}&code_verifier=${verifier}`;

  const res = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
    }),
    body,
  });

  if (res.status !== 200) {
    const errorText = await res.text();
    throw new Error(`status ${res.status}: Failed to retrieve access token\n${errorText}`);
  }

  console.log('Access token retrieved.');

  return res.json();
};

const stopServer = (): void => {
  if (server) {
    server.close();
    server = null;
    console.log('Auth server stopped.');
  }
};

const handleServerResponse = async (request: http.IncomingMessage, response: http.ServerResponse): Promise<void> => {
  const urlObj = new URL(`http://localhost:${AUTH_PORT}/${request.url}`);
  const queryState = urlObj.searchParams.get('state');

  try {
    if (request.url.endsWith('favicon.ico')) {
      console.log('favicon.ico requested, ignoring');
      response.writeHead(200, { 'Content-Type': 'image/x-icon' });
      response.end();
      return;
    }

    if (queryState !== codeState) {
      console.error('Invalid state', JSON.stringify(urlObj));
      response.end('Lofi authorization error: invalid state, you may close this window and retry.');
      return;
    }

    const error = urlObj.searchParams.get('error');
    if (error) {
      console.error(error);
      response.end(`Lofi authorization error '${error}', you may close this window and retry.`);
      return;
    }

    const code = urlObj.searchParams.get('code');
    if (code) {
      const data = await retrieveAccessToken(codeVerifier, code);
      lastRefreshAt = Date.now();
      lastAuthData = data;
      setRefreshTokenInterval(data);
      response.end('Lofi authorization successful, you may now close this window.');
      onTokenRetrieved(data);
    }
  } catch (e) {
    console.error(e);
  } finally {
    stopServer();
  }
};

export const startAuthServer = (): void => {
  console.log('Starting auth server...');
  if (!server) {
    server = http.createServer(async (request, response) => {
      await handleServerResponse(request, response);
    });

    server.listen(AUTH_PORT);
  }
};
