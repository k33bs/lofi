import React, { FunctionComponent, useMemo } from 'react';
import styled, { css } from 'styled-components';

import { DISTRIBUTION_CLIENT_ID, getAuthUrl, setAuthClientId, startAuthServer } from '../../main/auth';
import { useSettings } from '../contexts/settings.context';

const loginControlStyles = css`
  margin: auto;
  background-color: black;
  padding: 1rem;
  color: white;
  text-decoration: none;
  transition: transform 0.2s;
  vertical-align: middle;
  font-size: 12px;

  i {
    color: #84bd00;
  }

  &:hover {
    background-color: #222;
    transform: scale(1.05);
    border: 1px solid #000;
  }

  &:active {
    background-color: #000;
    border: 1px solid rgb(65, 65, 65);
  }
`;

const Link = styled.a`
  ${loginControlStyles}
`;

const SetupButton = styled.button`
  ${loginControlStyles}
  border: none;
  cursor: pointer;
  font-family: inherit;
`;

const SpotifyLogo = styled.i`
  margin-right: 0.5rem;
`;

interface Props {
  onSetupNeeded: () => void;
}

export const LoginButton: FunctionComponent<Props> = ({ onSetupNeeded }) => {
  const { state } = useSettings();
  const clientId = state?.spotifyClientId || DISTRIBUTION_CLIENT_ID;
  // the auth url embeds the client id, so it must be set before building the url
  const authUrl = useMemo(() => {
    setAuthClientId(clientId);
    return getAuthUrl();
  }, [clientId]);

  // without a client id the login cannot work; send the user to the setup tab
  if (!clientId) {
    return (
      <SetupButton type="button" className="login-btn" onClick={onSetupNeeded}>
        <SpotifyLogo className="fab fa-spotify" />
        <span>Log in</span>
      </SetupButton>
    );
  }

  return (
    <Link className="login-btn" target="auth" href={authUrl} onClick={startAuthServer}>
      <SpotifyLogo className="fab fa-spotify" />
      <span>Log in</span>
    </Link>
  );
};
