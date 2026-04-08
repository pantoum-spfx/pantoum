import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * Hook to load settings and versions on mount
 */
export function useSettings() {
  const store = useSettingsStore();

  useEffect(() => {
    store.loadSettings();
    store.loadVersions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return store;
}
