import styled from '@emotion/styled';
import { Tabs } from '@mantine/core';
import React, { FunctionComponent, useCallback, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { DEFAULT_SETTINGS, Settings } from '../../../models/settings';
import { Input, StyledTabs, StyledWindow } from '../../components';
import { DisplayData } from '../../models';
import { WindowHeader } from '../window-header';
import { AccountSettings } from './account-settings';
import { AdvancedSettings } from './advanced-settings';
import { AudioSettings } from './audio-settings';
import { SpotifySettings } from './spotify-settings';
import { TrackInfoSettings } from './track-info-settings';
import { VisualizationSettings } from './visualization-settings';
import { WindowSettings } from './window-settings';

export enum SettingsTab {
  Advanced = 'Advanced',
  Audio = 'Audio',
  Spotify = 'Spotify',
  TrackInfo = 'Track Info',
  Visualization = 'Visualization',
  Window = 'Window',
}

const SettingsWindowWrapper = styled(StyledWindow)`
  display: flex;
  flex-direction: column;
  /* the shared window base uses 75% font size, too small for a settings form */
  font-size: 13px;
  line-height: 1.45;
`;

const Form = styled.form`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const ButtonsGroup = styled.div`
  display: flex;
  width: 100%;
`;

const SaveCancelButtonsWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  gap: 0.25rem;
`;

const SavedIndicator = styled.span`
  color: rgb(214, 146, 255);
  margin-right: 0.25rem;
`;

const TabsWrapper = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
  align-items: stretch;
`;

const getDefaultValues = (initialValues: Settings, displays: DisplayData[]): Settings => {
  return {
    ...initialValues,
    visualizationScreenId:
      initialValues.visualizationScreenId < displays.length ? initialValues.visualizationScreenId : 0,
  };
};

interface Props {
  initialValues: Settings;
  displays: DisplayData[];
  initialTab?: SettingsTab;
  onClose: () => void;
  onSave: (data: Settings, isReset?: boolean) => void;
  onLogout: () => void;
}

export const SettingsWindow: FunctionComponent<Props> = ({
  initialValues,
  displays,
  initialTab,
  onClose,
  onSave,
  onLogout,
}) => {
  const methods = useForm<Settings>({
    defaultValues: getDefaultValues(initialValues, displays),
  });
  const { handleSubmit, reset } = methods;

  const [isSaved, setIsSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
    };
  }, []);

  const onSubmit = useCallback(
    (data: Settings) => {
      onSave(data);
      // the window stays open on save, so show that something happened
      setIsSaved(true);
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
      savedTimer.current = setTimeout(() => setIsSaved(false), 1500);
    },
    [onSave]
  );

  const handleCancel = useCallback(() => onClose(), [onClose]);

  const handleReset = useCallback(() => {
    // eslint-disable-next-line no-restricted-globals, no-alert
    if (confirm('Are you sure you want to reset all settings? This also disconnects your Spotify account.')) {
      reset(DEFAULT_SETTINGS);
      // full factory reset: clear the session (tokens, profile, api client) too
      onLogout();
      onSave(DEFAULT_SETTINGS, true);
      onClose();
    }
  }, [onClose, onLogout, onSave, reset]);

  return (
    <SettingsWindowWrapper>
      <WindowHeader title="Settings" onClose={onClose} />
      <Form onSubmit={handleSubmit(onSubmit)}>
        <FormProvider {...methods}>
          <TabsWrapper>
            <StyledTabs defaultValue={initialTab ?? SettingsTab.Window} color="gray" variant="default" radius="md">
              <Tabs.List>
                <Tabs.Tab value={SettingsTab.Window} icon={<i className="fa-solid fa-window-maximize" />} />
                <Tabs.Tab value={SettingsTab.TrackInfo} icon={<i className="fa-solid fa-circle-info" />} />
                <Tabs.Tab value={SettingsTab.Visualization} icon={<i className="fa-solid fa-chart-simple" />} />
                <Tabs.Tab value={SettingsTab.Audio} icon={<i className="fa-solid fa-headphones" />} />
                <Tabs.Tab value={SettingsTab.Advanced} icon={<i className="fa-solid fa-gears" />} />
                <Tabs.Tab value={SettingsTab.Spotify} icon={<i className="fa-brands fa-spotify" />} />
              </Tabs.List>

              <Tabs.Panel value={SettingsTab.Spotify}>
                <SpotifySettings />
              </Tabs.Panel>

              <Tabs.Panel value={SettingsTab.Window}>
                <WindowSettings />
              </Tabs.Panel>

              <Tabs.Panel value={SettingsTab.TrackInfo}>
                <TrackInfoSettings />
              </Tabs.Panel>

              <Tabs.Panel value={SettingsTab.Visualization}>
                <VisualizationSettings
                  displays={displays}
                  defaultVisualizationId={initialValues.visualizationId}
                  defaultVisualizationScreenId={initialValues.visualizationScreenId}
                />
              </Tabs.Panel>

              <Tabs.Panel value={SettingsTab.Audio}>
                <AudioSettings />
              </Tabs.Panel>

              <Tabs.Panel value={SettingsTab.Advanced}>
                <AdvancedSettings />
              </Tabs.Panel>
            </StyledTabs>
          </TabsWrapper>

          <AccountSettings onLogout={onLogout} isLoggedIn={!!initialValues.accessToken} />

          <ButtonsGroup>
            <Input type="button" value="Reset" onClick={handleReset} />
            <SaveCancelButtonsWrapper>
              {isSaved && <SavedIndicator>Saved ✓</SavedIndicator>}
              <Input type="submit" value="Save" />
              <Input type="button" value="Cancel" onClick={handleCancel} />
            </SaveCancelButtonsWrapper>
          </ButtonsGroup>
        </FormProvider>
      </Form>
    </SettingsWindowWrapper>
  );
};
