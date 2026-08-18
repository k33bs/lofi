import './style.css';

import { MantineProvider } from '@mantine/core';
import * as React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { ErrorBoundary } from './components/error-boundary';
import { CurrentlyPlayingProvider } from './contexts/currently-playing.context';
import { SettingsProvider } from './contexts/settings.context';

createRoot(document.getElementById('app')).render(
  <ErrorBoundary>
    <SettingsProvider>
      <CurrentlyPlayingProvider>
        <MantineProvider withNormalizeCSS>
          <App />
        </MantineProvider>
      </CurrentlyPlayingProvider>
    </SettingsProvider>
  </ErrorBoundary>
);
