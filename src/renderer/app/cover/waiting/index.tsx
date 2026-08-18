import React, { FunctionComponent, useEffect, useState } from 'react';
import styled from 'styled-components';

import { SpotifyApiInstance } from '../../../api/spotify-api';

const THROTTLE_POLL_MS = 5000;

const WaitingWrapper = styled.div`
  overflow: hidden;
  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  p {
    margin: 0;
    color: #84bd00;
    font-size: 300%;
    opacity: 0.5;
    animation: fader 1s infinite alternate;
  }

  @keyframes fader {
    from {
      opacity: 0;
    }
  }
`;

const Caption = styled.div`
  font-size: 9px;
  color: #cccccc;
  text-align: center;
  padding: 0 0.5rem;
  margin-top: 0.25rem;
  text-shadow: 0 0 4px #000;
`;

const formatWait = (untilMs: number): string => {
  const totalMinutes = Math.ceil((untilMs - Date.now()) / 60_000);
  if (totalMinutes >= 60) {
    return `~${Math.round(totalMinutes / 60)}h`;
  }
  return totalMinutes > 1 ? `~${totalMinutes}m` : '<1m';
};

export const Waiting: FunctionComponent = () => {
  const [throttledUntil, setThrottledUntil] = useState(SpotifyApiInstance.getThrottledUntil());

  useEffect(() => {
    const intervalId = setInterval(() => setThrottledUntil(SpotifyApiInstance.getThrottledUntil()), THROTTLE_POLL_MS);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <WaitingWrapper className="centered draggable">
      <p className="draggable">
        <i className="fab fa-spotify draggable" />
      </p>
      {throttledUntil ? (
        <Caption className="draggable">
          Spotify is rate-limiting this app, try again in {formatWait(throttledUntil)}
        </Caption>
      ) : (
        <Caption className="draggable">nothing playing, press play in Spotify</Caption>
      )}
    </WaitingWrapper>
  );
};
