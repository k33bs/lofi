import Store from 'electron-store';
import React, {
  createContext,
  Dispatch,
  FunctionComponent,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

import { DEFAULT_SETTINGS, Settings } from '../../models/settings';
import { SettingsAction, useSettingsReducer } from '../reducers/settings.reducer';

interface SettingsContext {
  state: Settings;
  dispatch: Dispatch<SettingsAction>;
}

interface SettingsStorage {
  settings: Settings;
}

const Context = createContext<SettingsContext>({ state: null, dispatch: null });

export const SettingsProvider: FunctionComponent<PropsWithChildren> = ({ children }) => {
  const store = useMemo(
    () =>
      new Store<SettingsStorage>({
        clearInvalidConfig: true,
        defaults: { settings: DEFAULT_SETTINGS },
      }),
    []
  );
  const [state, dispatch] = useReducer(useSettingsReducer, { ...DEFAULT_SETTINGS, ...store.get('settings') });

  useEffect(() => {
    try {
      store.set('settings', state || DEFAULT_SETTINGS);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('settings persistence failed:', error);
    }
  }, [state, store]);

  const ctx: SettingsContext = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return <Context.Provider value={ctx}>{children}</Context.Provider>;
};

export const useSettings = (): SettingsContext => useContext(Context);
