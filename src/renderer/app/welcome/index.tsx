import React, { FunctionComponent, useEffect, useState } from 'react';
import styled from 'styled-components';

import { Settings, VisualizationType } from '../../../models/settings';
import { getSystemVolume } from '../../api/system-audio';
import { LoginButton } from '../../components';
import wavesImage from '../../static/waves.gif';
import Menu from '../cover/menu';
import { Visualizer } from '../cover/visualizer';

const AUDIO_PRESENCE_POLL_MS = 500;
const AUDIO_SILENCE_HIDE_MS = 5000;
const AUDIBLE_THRESHOLD = 0.02;
// let the branding be seen after launch before the music fades it out
const BRANDING_GRACE_MS = 6000;

const WelcomeContent = styled.div<{ $isFadedOut: boolean }>`
  opacity: ${({ $isFadedOut }) => ($isFadedOut ? 0 : 1)};
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  position: absolute;
  height: 100%;
  width: 100%;
  text-align: center;
  background-image: url(${wavesImage});
  background-size: cover;
  transition: 0.2s;
`;

const Brand = styled.h2`
  font-size: 20px;
  display: inline-block;
  color: white;
  text-shadow: 1px 1px 1px #ff0e88;
`;

const BrandHighlight = styled.span`
  font-weight: normal;
  text-shadow: 1px 1px 1px #ef00ff;
`;

const BrandTagLine = styled.div`
  font-size: 10px;
  color: white;
  background-color: black;
  margin: 0.5em;
  padding: 0.5em;
  position: relative;
`;

const WelcomeControls = styled.div`
  opacity: 0;
  display: flex;
  justify-content: center;
  z-index: 2;
`;

interface Props {
  onSetupNeeded: () => void;
  settings: Settings;
  onVisualizationChange: () => void;
  onVisualizationCycle?: (isPrevious: boolean) => void;
}

export const Welcome: FunctionComponent<Props> = ({
  onSetupNeeded,
  settings,
  onVisualizationChange,
  onVisualizationCycle,
}) => {
  const isVisualizing = settings.visualizationType === VisualizationType.Small;
  const [hasAudio, setHasAudio] = useState(false);

  // while the visualizer hears music, the branding steps aside; after a few
  // seconds of silence it fades back in
  useEffect(() => {
    if (!isVisualizing) {
      setHasAudio(false);
      return undefined;
    }

    let lastAudibleAt = 0;
    const graceUntil = Date.now() + BRANDING_GRACE_MS;
    const intervalId = setInterval(() => {
      const volume = getSystemVolume();
      if (volume !== null && volume > AUDIBLE_THRESHOLD) {
        lastAudibleAt = Date.now();
      }
      setHasAudio(Date.now() > graceUntil && Date.now() - lastAudibleAt < AUDIO_SILENCE_HIDE_MS);
    }, AUDIO_PRESENCE_POLL_MS);

    return () => clearInterval(intervalId);
  }, [isVisualizing]);

  return (
    <div className="full">
      <Menu
        visualizationType={settings.visualizationType}
        onVisualizationChange={onVisualizationChange}
        onVisualizationCycle={onVisualizationCycle}
      />
      {isVisualizing && (
        <Visualizer
          key={settings.visualizationId}
          visualizationId={settings.visualizationId}
          visualizerOpacity={settings.visualizerOpacity}
          size={{ height: settings.size, width: settings.size }}
        />
      )}
      <WelcomeContent $isFadedOut={hasAudio} className="welcome-content centered draggable">
        <Brand className="brand draggable">
          lo
          <BrandHighlight className="brand-highlight draggable">fi</BrandHighlight>
        </Brand>
        <BrandTagLine className="brand-tagline draggable">a tiny player</BrandTagLine>
      </WelcomeContent>
      <WelcomeControls className="centered controls draggable">
        <LoginButton onSetupNeeded={onSetupNeeded} />
      </WelcomeControls>
    </div>
  );
};
