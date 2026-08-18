import { ipcRenderer } from 'electron';
import React, { FunctionComponent, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import styled from 'styled-components';

import { ApplicationUrl, IpcMessage } from '../../../constants';
import { Settings } from '../../../models/settings';
import { FieldSet, FormGroup, Legend, Row } from '../../components';
import { StyledTextInput } from '../../components/mantine.styled';

const Steps = styled.ol`
  margin: 0 0 0.5rem;
  padding-left: 1.25rem;

  li {
    margin-bottom: 0.25rem;
  }
`;

const LinkButton = styled.button`
  background: none;
  border: none;
  color: rgb(214, 146, 255);
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-size: inherit;
`;

const Note = styled.div`
  margin-top: 0.5rem;
  opacity: 0.8;
`;

// Spotify's development-mode rules mean lofi cannot ship a shared client id:
// each user creates their own (free) Spotify app and pastes its client id here
export const SpotifySettings: FunctionComponent = () => {
  const { register } = useFormContext<Settings>();

  const openCreateApp = useCallback(() => {
    ipcRenderer.send(IpcMessage.OpenLink, ApplicationUrl.SpotifyCreateApp);
  }, []);

  const openDashboard = useCallback(() => {
    ipcRenderer.send(IpcMessage.OpenLink, ApplicationUrl.SpotifyDashboard);
  }, []);

  return (
    <FormGroup>
      <FieldSet>
        <Legend>Spotify</Legend>
        <Row>
          <div>
            Lofi needs your own (free) Spotify app to connect. Setting one up takes about two minutes:
            <Steps>
              <li>
                <LinkButton type="button" onClick={openCreateApp}>
                  Create an app
                </LinkButton>{' '}
                in the Spotify Developer Dashboard, any name and description will do.
              </li>
              <li>
                Under Redirect URIs enter exactly <b>http://127.0.0.1:41419</b> and press Add.
              </li>
              <li>Check the Web API box, accept the terms, and save.</li>
              <li>
                Open the app in the{' '}
                <LinkButton type="button" onClick={openDashboard}>
                  dashboard
                </LinkButton>
                , copy its Client ID, and paste it below.
              </li>
            </Steps>
          </div>
        </Row>
        <Row>
          <StyledTextInput
            label="Client ID"
            placeholder="paste your Spotify Client ID"
            spellCheck={false}
            {...register('spotifyClientId')}
          />
        </Row>
        <Note>
          Playback controls need Spotify Premium. Your app runs in development mode: your own account works right away;
          add friends under User Management in the dashboard (up to 25).
        </Note>
      </FieldSet>
    </FormGroup>
  );
};
