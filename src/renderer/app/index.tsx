/* eslint-disable no-console */
import { Display, ipcRenderer, IpcRendererEvent } from 'electron';
import React, { FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { IpcMessage, WindowName } from '../../constants';
import {
  AuthData,
  clearAuthCache,
  refreshAccessToken,
  setAuthClientId,
  setTokenRetrievedCallback,
} from '../../main/auth';
import { DEFAULT_SETTINGS, Settings, VisualizationType } from '../../models/settings';
import { visualizations } from '../../visualizations';
import { AccountType, SpotifyApiInstance } from '../api/spotify-api';
import { initSystemAudio } from '../api/system-audio';
import { WindowPortal } from '../components';
import { useCurrentlyPlaying } from '../contexts/currently-playing.context';
import { useSettings } from '../contexts/settings.context';
import { DisplayData } from '../models';
import { CurrentlyPlayingActions } from '../reducers/currently-playing.reducer';
import { SettingsActionType } from '../reducers/settings.reducer';
import { About } from '../windows/about';
import { FullscreenVisualizer } from '../windows/fullscreen-visualizer';
import { SettingsTab, SettingsWindow } from '../windows/settings';
import { Cover } from './cover';
import { Welcome } from './welcome';

const LEFT_MOUSE_BUTTON = 0;

// module state survives the error boundary's crash-remount, so an open settings
// window comes back instead of silently closing when the tree recovers
let wasSettingsOpen = false;

const VisibleUi = styled.div`
  height: 100%;
  width: 100%;
  background: linear-gradient(135deg, #1f1f1f 0%, #2d2d2d 100%);
  position: relative;

  &:hover {
    .cover {
      filter: blur(0.125rem);
      transform: scale(1.1);
    }

    .bar,
    .controls,
    .menu {
      transition: 0.1s;
      opacity: 1;
    }

    .welcome-content {
      filter: blur(0.5rem);
    }

    .menu .logo-typo {
      background-position: left center;
      color: #ef9671;
      transition: background-position 2000ms ease-out;
    }
  }

  .top {
    top: 0;
  }

  .right {
    right: 0;
  }

  .bottom {
    bottom: 0;
  }

  .left {
    left: 0;
  }
`;

export const App: FunctionComponent = () => {
  const [shouldShowAbout, setShouldShowAbout] = useState(false);
  const [shouldShowSettings, setShouldShowSettings] = useState(wasSettingsOpen);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>(undefined);

  useEffect(() => {
    wasSettingsOpen = shouldShowSettings;
  }, [shouldShowSettings]);
  const [shouldShowFullscreenViz, setShouldShowFullscreenViz] = useState(false);
  const [message, setMessage] = useState('');
  const [displays, setDisplays] = useState<DisplayData[]>([]);

  const { state, dispatch } = useSettings();
  const { state: currentlyPlaying, dispatch: currentlyPlayingDispatch } = useCurrentlyPlaying();
  const { accessToken, refreshToken, visualizationId, visualizationType } = state || DEFAULT_SETTINGS;
  const { cornerRadius } = useMemo(() => state, [state]);

  const updateTokens = useCallback(
    async (data: AuthData) => {
      if (!data || !data.access_token || !data.refresh_token) {
        clearAuthCache();
        dispatch({ type: SettingsActionType.ResetTokens });
      } else {
        dispatch({ type: SettingsActionType.SetTokens, payload: data });
      }

      try {
        const userProfile = await SpotifyApiInstance.updateTokens(data);
        if (userProfile) {
          currentlyPlayingDispatch({
            type: CurrentlyPlayingActions.SetUserProfile,
            payload: userProfile,
          });

          console.log(`User '${userProfile.name}' successfully authenticated.`);
        } else {
          console.error('User not authenticated.');
        }
      } catch (error) {
        console.error(error);
      }
    },
    [currentlyPlayingDispatch, dispatch]
  );

  useEffect(() => {
    const accountType = currentlyPlaying.userProfile?.accountType;
    // wait for the profile to load before deciding the account isn't premium
    if (accountType && accountType !== AccountType.Premium && state.showFreemiumWarning) {
      const playbackDisabledMessage = 'Account is not premium, playback controls disabled.';
      console.warn(playbackDisabledMessage);
      setMessage(playbackDisabledMessage);
    } else {
      setMessage('');
    }
  }, [currentlyPlaying.userProfile?.accountType, state.showFreemiumWarning]);

  useEffect(() => {
    setTokenRetrievedCallback(updateTokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visualizationType === VisualizationType.Big) {
      setShouldShowFullscreenViz(true);
    }
  }, [shouldShowFullscreenViz, visualizationType]);

  // keep the auth module's client id in sync with settings; runs before the
  // handleAuth mount effect below because it is declared first
  useEffect(() => {
    setAuthClientId(state?.spotifyClientId ?? '');
  }, [state?.spotifyClientId]);

  const handleAuth = useCallback(async () => {
    try {
      if (refreshToken && state?.spotifyClientId) {
        await refreshAccessToken(refreshToken);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      await updateTokens(null);
    }
  }, [refreshToken, updateTokens, state?.spotifyClientId]);

  useEffect(() => {
    // drag wiring lives at effect scope so it registers exactly once per mount
    // (the WindowReady handler can fire more than once and must stay idempotent)
    let animationId = 0;
    let isDragging = false;
    let mouseX = 0;
    let mouseY = 0;

    const moveWindow = (): void => {
      // a quick click can fire mouseup before the first scheduled frame runs;
      // without this check the loop would start after the release and never stop
      if (!isDragging) {
        return;
      }
      ipcRenderer.send(IpcMessage.WindowMoving, { mouseX, mouseY });
      animationId = requestAnimationFrame(moveWindow);
    };

    // eslint-disable-next-line prefer-const
    let onMouseMove: (event: MouseEvent) => void;

    const onMouseUp = ({ button }: { button: number }): void => {
      if (button !== LEFT_MOUSE_BUTTON) {
        return;
      }

      isDragging = false;
      ipcRenderer.send(IpcMessage.WindowMoved);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationId);
    };

    // the OS can swallow mouseup while the window is being moved under the cursor;
    // any mouse event with the button released means the drag is over
    onMouseMove = (event: MouseEvent): void => {
      if (event.buttons === 0) {
        onMouseUp({ button: LEFT_MOUSE_BUTTON });
      }
    };

    const onMouseDown = (event: MouseEvent): void => {
      const { button, clientX, clientY, target } = event;
      const targetElement = target as unknown as Element;

      const isDraggable = targetElement.classList?.contains('draggable');
      if (button !== LEFT_MOUSE_BUTTON || !isDraggable) {
        return;
      }

      cancelAnimationFrame(animationId);
      isDragging = true;
      mouseX = clientX;
      mouseY = clientY;
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mousemove', onMouseMove);

      animationId = requestAnimationFrame(moveWindow);
    };

    const onShowAbout = (): void => setShouldShowAbout(true);
    const onShowFullscreenViz = (): void => setShouldShowFullscreenViz(true);
    const onShowSettings = (): void => setShouldShowSettings(true);

    const onWindowReady = (_: IpcRendererEvent, { displays: displayData }: { displays: Display[] }): void => {
      setDisplays(() => displayData.map(({ label, bounds: { height, width } }) => ({ label, height, width })));
    };

    const onWindowMoved = (_: IpcRendererEvent, data: { x: number; y: number }): void => {
      dispatch({
        type: SettingsActionType.SetWindowPos,
        payload: data,
      });
    };

    const onWindowResized = (_: IpcRendererEvent, size: number): void => {
      dispatch({
        type: SettingsActionType.SetSize,
        payload: size,
      });
    };

    const onSideChanged = (_: IpcRendererEvent, { isOnLeft }: { isOnLeft: boolean }): void => {
      dispatch({
        type: SettingsActionType.SetIsOnLeft,
        payload: isOnLeft,
      });
    };

    ipcRenderer.on(IpcMessage.ShowAbout, onShowAbout);
    ipcRenderer.on(IpcMessage.ShowFullscreenVizualizer, onShowFullscreenViz);
    ipcRenderer.on(IpcMessage.ShowSettings, onShowSettings);
    ipcRenderer.on(IpcMessage.WindowReady, onWindowReady);
    ipcRenderer.on(IpcMessage.WindowMoved, onWindowMoved);
    ipcRenderer.on(IpcMessage.WindowResized, onWindowResized);
    ipcRenderer.on(IpcMessage.SideChanged, onSideChanged);
    document.getElementById('app-body')?.addEventListener('mousedown', onMouseDown);

    // ask main for displays, covers recreated windows and crash-recovery
    // remounts; main also pushes once on ready-to-show
    ipcRenderer.send(IpcMessage.WindowReady);

    // without this cleanup every error-boundary remount stacks another listener set
    return () => {
      ipcRenderer.removeListener(IpcMessage.ShowAbout, onShowAbout);
      ipcRenderer.removeListener(IpcMessage.ShowFullscreenVizualizer, onShowFullscreenViz);
      ipcRenderer.removeListener(IpcMessage.ShowSettings, onShowSettings);
      ipcRenderer.removeListener(IpcMessage.WindowReady, onWindowReady);
      ipcRenderer.removeListener(IpcMessage.WindowMoved, onWindowMoved);
      ipcRenderer.removeListener(IpcMessage.WindowResized, onWindowResized);
      ipcRenderer.removeListener(IpcMessage.SideChanged, onSideChanged);
      document.getElementById('app-body')?.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      isDragging = false;
      cancelAnimationFrame(animationId);
    };
  }, [dispatch]);

  useEffect(() => {
    handleAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSettingsSave = useCallback(
    (data?: Settings, isReset = false) => {
      // the form snapshots x/y when settings opens; saving must not teleport the
      // window back there, keep the live position. Reset passes isReset
      // explicitly (x/y sniffing misfires on fresh installs where x/y are -1).
      const merged = isReset ? data : { ...data, x: state.x, y: state.y };
      dispatch({
        type: SettingsActionType.UpdateSettings,
        payload: merged,
      });
      ipcRenderer.send(IpcMessage.SettingsChanged, merged);
    },
    [dispatch, state.x, state.y]
  );

  const handleVisualizationChange = useCallback(() => {
    // called from a click, which satisfies the user-activation requirement
    // of the loopback capture permission flow
    initSystemAudio();
    switch (visualizationType) {
      case VisualizationType.None: {
        dispatch({
          type: SettingsActionType.SetVisualizationType,
          payload: VisualizationType.Small,
        });
        break;
      }

      case VisualizationType.Small: {
        ipcRenderer.send(IpcMessage.ShowFullscreenVizualizer);

        dispatch({
          type: SettingsActionType.SetVisualizationType,
          payload: VisualizationType.Big,
        });
        break;
      }

      case VisualizationType.Big:
      default: {
        setShouldShowFullscreenViz(false);
        dispatch({
          type: SettingsActionType.SetVisualizationType,
          payload: VisualizationType.None,
        });
        break;
      }
    }
  }, [dispatch, visualizationType]);

  const handleVisualizationCycle = useCallback(
    (isPrevious: boolean) => {
      let id: number;
      if (isPrevious) {
        id = visualizationId === 0 ? visualizations.length - 1 : visualizationId - 1;
      } else {
        id = visualizationId === visualizations.length - 1 ? 0 : visualizationId + 1;
      }
      dispatch({
        type: SettingsActionType.SetVisualization,
        payload: id,
      });
    },
    [dispatch, visualizationId]
  );

  return (
    <VisibleUi
      id="visible-ui"
      className="click-on"
      style={cornerRadius ? { borderRadius: `${cornerRadius}%`, overflow: 'hidden' } : {}}>
      {shouldShowSettings && (
        <WindowPortal
          onUnload={() => {
            setShouldShowSettings(false);
            setSettingsTab(undefined);
          }}
          name={WindowName.Settings}>
          <SettingsWindow
            initialValues={state}
            displays={displays}
            initialTab={settingsTab}
            onSave={handleSettingsSave}
            onClose={() => setShouldShowSettings(false)}
            onLogout={() => updateTokens(null)}
          />
        </WindowPortal>
      )}

      {shouldShowAbout && (
        <WindowPortal onUnload={() => setShouldShowAbout(false)} name={WindowName.About}>
          <About onClose={() => setShouldShowAbout(false)} />
        </WindowPortal>
      )}

      {shouldShowFullscreenViz && (
        <WindowPortal
          onUnload={() => setShouldShowFullscreenViz(false)}
          name={WindowName.FullscreenViz}
          features={{ isFullscreen: true }}>
          <FullscreenVisualizer onClose={() => setShouldShowFullscreenViz(false)} />
        </WindowPortal>
      )}

      {accessToken ? (
        <Cover
          settings={state}
          message={message}
          onVisualizationChange={handleVisualizationChange}
          onVisualizationCycle={handleVisualizationCycle}
        />
      ) : (
        <Welcome
          onSetupNeeded={() => {
            setSettingsTab(SettingsTab.Spotify);
            setShouldShowSettings(true);
          }}
        />
      )}
    </VisibleUi>
  );
};
