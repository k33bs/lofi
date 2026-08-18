/* eslint-disable no-console */
import { ipcRenderer } from 'electron';
import { clamp } from 'lodash';
import React, { FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';

import { IpcMessage, WindowName } from '../../../constants';
import { Settings, VisualizationType } from '../../../models/settings';
import { AccountType, SpotifyApiInstance } from '../../api/spotify-api';
import { WindowPortal } from '../../components';
import { useCurrentlyPlaying } from '../../contexts/currently-playing.context';
import { CurrentlyPlayingActions, CurrentlyPlayingType } from '../../reducers/currently-playing.reducer';
import { TrackInfo } from '../../windows/track-info';
import { Bars } from '../bars';
import { Controls } from './controls';
import Menu from './menu';
import { Visualizer } from './visualizer';
import { Waiting } from './waiting';

const ONE_SECOND_IN_MS = 1000;
const ONE_MINUTE = ONE_SECOND_IN_MS * 60;

const TRUNCATE_REGEX = /(.*?)\s[-(•].*/g;
const truncateText = (text: string): string => text?.replace(TRUNCATE_REGEX, '$1');

const CoverContent = styled.div<{ $isPlaying: boolean }>`
  background-size: cover;
  transition: 0.2s;
  display: flex;

  ${({ $isPlaying }) =>
    !$isPlaying &&
    css`
      transition: 0.1s;
      filter: blur(2px) grayscale(50%);
      transform: scale(1.05);
    `}
`;

interface Props {
  settings: Settings;
  message: string;
  onVisualizationChange: () => void;
  onVisualizationCycle?: (isPrevious: boolean) => void;
}

export const Cover: FunctionComponent<Props> = ({ settings, message, onVisualizationChange, onVisualizationCycle }) => {
  const { state, dispatch } = useCurrentlyPlaying();

  const {
    barThickness,
    barColor,
    isAlwaysShowSongProgress,
    isAlwaysShowTrackInfo,
    showTrackInfoTemporarilyInSeconds,
    isOnLeft,
    size,
    skipSongDelay,
    volumeIncrement,
    visualizationId,
    visualizationType,
    visualizerOpacity,
    trackInfoRefreshTimeInSeconds,
  } = useMemo(() => settings, [settings]);

  const [currentSongId, setCurrentSongId] = useState('');
  const [shouldShowTrackInfo, setShouldShowTrackInfo] = useState(isAlwaysShowTrackInfo);
  const [trackInfoTimer, setTrackInfoTimer] = useState<NodeJS.Timeout | null>(null);
  const [errorToDisplay, setErrorToDisplay] = useState('');

  useEffect(() => setErrorToDisplay(message), [message]);

  useEffect(() => {
    setShouldShowTrackInfo(isAlwaysShowTrackInfo);
  }, [isAlwaysShowTrackInfo]);

  const artist = useMemo(() => truncateText(state.artist), [state.artist]);
  const songTitle = useMemo(() => truncateText(state.track), [state.track]);

  const handlePlaybackChanged = useCallback(async (): Promise<void> => {
    try {
      const currentlyPlaying = await SpotifyApiInstance.getCurrentlyPlaying();
      if (!currentlyPlaying) {
        return;
      }

      dispatch({ type: CurrentlyPlayingActions.SetCurrentlyPlaying, payload: currentlyPlaying });
      setErrorToDisplay('');
    } catch (error) {
      console.error(error);
      setErrorToDisplay((error as Error).message);
    }
  }, [dispatch]);

  const refreshTrackLiked = useCallback(async (): Promise<void> => {
    if (state.type === CurrentlyPlayingType.Track || state.type === CurrentlyPlayingType.Episode) {
      const itemType = state.type === CurrentlyPlayingType.Episode ? 'episode' : 'track';
      try {
        const isTrackLiked = await SpotifyApiInstance.isTrackLiked(state.id, itemType);
        if (state.isLiked !== isTrackLiked) {
          ipcRenderer.send(IpcMessage.TrackLiked, isTrackLiked);
        }
        dispatch({ type: CurrentlyPlayingActions.SetTrackLiked, payload: isTrackLiked });
        await handlePlaybackChanged();
      } catch (error) {
        console.error(error);
        setErrorToDisplay((error as Error).message);
      }
    }
  }, [dispatch, handlePlaybackChanged, state.id, state.isLiked, state.type]);

  useEffect(() => {
    (async () => {
      // track changes must be handled even while paused (e.g. launched with
      // Spotify paused on a liked track), or liked-status is never fetched.
      // Likes changed externally mid-track are a known, accepted staleness.
      if (state.id && state.id !== currentSongId) {
        setCurrentSongId(state.id);
        console.log(`New song '${songTitle}' by '${artist}.`);
        await refreshTrackLiked();
      }

      if (state.isPlaying) {
        if (!isAlwaysShowTrackInfo && showTrackInfoTemporarilyInSeconds) {
          setShouldShowTrackInfo(true);

          const timer = setTimeout(() => {
            if (!document.getElementById('visible-ui')?.matches(':hover')) {
              setShouldShowTrackInfo(false);
            }
            setTrackInfoTimer(null);
          }, showTrackInfoTemporarilyInSeconds * ONE_SECOND_IN_MS);

          setTrackInfoTimer(timer);
        }
      }
    })();
  }, [
    artist,
    currentSongId,
    refreshTrackLiked,
    songTitle,
    state.id,
    state.isPlaying,
    isAlwaysShowTrackInfo,
    showTrackInfoTemporarilyInSeconds,
  ]);

  useEffect(() => {
    return () => {
      if (trackInfoTimer) {
        clearTimeout(trackInfoTimer);
      }
    };
  }, [trackInfoTimer]);

  const keepAlive = useCallback(async (): Promise<void> => {
    if (state.isPlaying || state.userProfile?.accountType !== AccountType.Premium) {
      return;
    }

    try {
      const currentlyPlaying = await SpotifyApiInstance.getCurrentlyPlaying();
      // no response means no active device, seeking would just 404
      if (currentlyPlaying && !currentlyPlaying.is_playing) {
        await SpotifyApiInstance.seek(state.progress);
      }
    } catch (error) {
      console.error(error);
      setErrorToDisplay((error as Error).message);
    }
  }, [state.isPlaying, state.progress, state.userProfile?.accountType]);

  const changeVolume = useCallback(
    (newVolume: number) => {
      try {
        if (newVolume !== undefined && state.userProfile?.accountType === AccountType.Premium) {
          (async () => {
            await SpotifyApiInstance.setVolume(newVolume);
            await handlePlaybackChanged();

            console.log(`Volume set to ${newVolume}`);
          })();
        }
      } catch (error) {
        console.error(error);
        setErrorToDisplay((error as Error).message);
      }
    },
    [handlePlaybackChanged, state.userProfile?.accountType]
  );

  const handleTrackLiked = useCallback(() => {
    refreshTrackLiked();
  }, [refreshTrackLiked]);

  const onMouseWheel = useCallback(
    async ({ deltaY }: WheelEvent): Promise<void> => {
      const direction = Math.sign(deltaY);
      const newVolume = clamp(state.volume - direction * volumeIncrement, 0, 100);
      try {
        // TODO use a state variable to buffer the volume change
        if (newVolume !== state.volume) {
          changeVolume(newVolume);
        }
      } catch (error) {
        throw new Error(`Update volume error: ${error}`);
      }
    },
    [changeVolume, state.volume, volumeIncrement]
  );

  useEffect(() => {
    document.getElementById('visible-ui')?.addEventListener('mousewheel', onMouseWheel);
    return () => {
      // element may already be gone during teardown; throwing here unmounts the whole app
      document.getElementById('visible-ui')?.removeEventListener('mousewheel', onMouseWheel);
    };
  }, [onMouseWheel]);

  useEffect(() => {
    const listeningToIntervalId = setInterval(handlePlaybackChanged, trackInfoRefreshTimeInSeconds * ONE_SECOND_IN_MS);

    return () => {
      if (listeningToIntervalId) {
        clearInterval(listeningToIntervalId);
      }
    };
  }, [handlePlaybackChanged, trackInfoRefreshTimeInSeconds]);

  // ponytail: no interval for liked-status, it only changes on track change or
  // heart click, and both already call refreshTrackLiked; halves the API traffic
  useEffect(() => {
    const keepAliveIntervalId = setInterval(keepAlive, ONE_MINUTE);
    return () => {
      if (keepAliveIntervalId) {
        clearInterval(keepAliveIntervalId);
      }
    };
  }, [keepAlive]);

  const coverUrl = useMemo(() => state.cover, [state.cover]);

  return (
    <div
      className="transparent"
      onMouseEnter={() => !isAlwaysShowTrackInfo && setShouldShowTrackInfo(true)}
      onMouseLeave={() => !isAlwaysShowTrackInfo && !trackInfoTimer && setShouldShowTrackInfo(false)}>
      <Menu
        onVisualizationChange={onVisualizationChange}
        onVisualizationCycle={onVisualizationCycle}
        visualizationType={visualizationType}
      />
      {state.id ? (
        <>
          {shouldShowTrackInfo && (
            <WindowPortal name={WindowName.TrackInfo} features={{ focusable: false }}>
              <TrackInfo track={songTitle} artist={artist} isOnLeft={isOnLeft} message={errorToDisplay || message} />
            </WindowPortal>
          )}
          <CoverContent
            className="full"
            $isPlaying={state.isPlaying}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
          />
          {visualizationType === VisualizationType.Small && (
            <Visualizer
              key={visualizationId}
              visualizationId={visualizationId}
              visualizerOpacity={visualizerOpacity}
              size={{ height: size, width: size }}
            />
          )}
          <Bars barThickness={barThickness} barColor={barColor} alwaysShowProgress={isAlwaysShowSongProgress} />
          <Controls
            skipSongDelay={skipSongDelay}
            onTrackLiked={handleTrackLiked}
            onPlaybackChanged={handlePlaybackChanged}
            onError={setErrorToDisplay}
          />
        </>
      ) : (
        <>
          {/* with the small visualization on, the shader is the idle content
              and the status logo only appears on hover, like the menu */}
          {visualizationType === VisualizationType.Small && (
            <Visualizer
              key={visualizationId}
              visualizationId={visualizationId}
              visualizerOpacity={visualizerOpacity}
              size={{ height: size, width: size }}
            />
          )}
          <Waiting isHoverOnly={visualizationType === VisualizationType.Small} />
        </>
      )}
    </div>
  );
};
