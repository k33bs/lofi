import { ipcRenderer } from 'electron';
import React, { FunctionComponent, useCallback, useState } from 'react';
import styled from 'styled-components';

import { ApplicationUrl, IpcMessage } from '../../constants';
import { useSettings } from '../contexts/settings.context';
import { SettingsActionType } from '../reducers/settings.reducer';

const Gate = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  background-color: rgba(0, 0, 0, 0.75);
  padding: 0.5rem;
  font-size: 10px;
  color: white;
  max-width: 90%;
`;

const ClientIdInput = styled.input`
  width: 100%;
  font-size: 10px;
  padding: 0.2rem;
  border: 1px solid #666;
  background: #111;
  color: white;
`;

const SaveButton = styled.button`
  font-size: 10px;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
`;

const HelpLink = styled.button`
  background: none;
  border: none;
  color: rgb(214, 146, 255);
  font-size: 9px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
`;

// Spotify's development-mode rules mean lofi cannot ship a shared client id:
// each user creates their own (free) Spotify app and pastes its client id here
export const ClientIdGate: FunctionComponent = () => {
  const { dispatch } = useSettings();
  const [value, setValue] = useState('');

  const handleSave = useCallback(() => {
    if (value.trim()) {
      dispatch({ type: SettingsActionType.SetClientId, payload: value });
    }
  }, [dispatch, value]);

  const openCreateApp = useCallback(() => {
    ipcRenderer.send(IpcMessage.OpenLink, ApplicationUrl.SpotifyCreateApp);
  }, []);

  return (
    <Gate className="click-on">
      <div>Paste your Spotify app&apos;s Client ID to connect:</div>
      <ClientIdInput
        type="text"
        placeholder="Spotify Client ID"
        value={value}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && handleSave()}
      />
      <SaveButton type="button" onClick={handleSave} disabled={!value.trim()}>
        Continue
      </SaveButton>
      <HelpLink type="button" onClick={openCreateApp}>
        Create one free at developer.spotify.com, use redirect URI http://127.0.0.1:41419
      </HelpLink>
    </Gate>
  );
};
