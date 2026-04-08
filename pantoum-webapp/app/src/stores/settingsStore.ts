import { create } from 'zustand';
import type { PantoumSettings } from '@shared/types/Settings';

interface SettingsState {
  settings: PantoumSettings;
  defaults: PantoumSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  source: 'defaults' | 'file' | null;
  filePath: string | null;
  versions: string[];
  installedVersion: string | null;
  versionsLoading: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  updateSetting: <K extends keyof PantoumSettings>(key: K, value: PantoumSettings[K]) => void;
  resetToDefaults: () => Promise<void>;
  loadVersions: () => Promise<void>;
  importFromFile: () => Promise<void>;
  exportToFile: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {} as PantoumSettings,
  defaults: {} as PantoumSettings,
  loading: true,
  saving: false,
  error: null,
  dirty: false,
  source: null,
  filePath: null,
  versions: [],
  installedVersion: null,
  versionsLoading: false,

  loadSettings: async () => {
    set({ loading: true, error: null });
    try {
      const [settingsRes, defaultsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/settings/defaults'),
      ]);
      if (!settingsRes.ok) throw new Error(`HTTP ${settingsRes.status}`);
      const settingsData = await settingsRes.json();
      const defaultsData = defaultsRes.ok ? await defaultsRes.json() : {};
      set({
        settings: settingsData.settings,
        defaults: defaultsData.defaults || settingsData.settings,
        source: settingsData.source,
        filePath: settingsData.path,
        loading: false,
        dirty: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load settings',
        loading: false,
      });
    }
  },

  saveSettings: async () => {
    set({ saving: true, error: null });
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(get().settings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ saving: false, dirty: false, filePath: data.path, source: 'file' });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to save settings',
        saving: false,
      });
    }
  },

  updateSetting: (key, value) => {
    set((state) => ({
      settings: { ...state.settings, [key]: value },
      dirty: true,
    }));
  },

  resetToDefaults: async () => {
    set({ saving: true, error: null });
    try {
      const res = await fetch('/api/settings/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        settings: data.settings,
        saving: false,
        dirty: false,
        filePath: data.path,
        source: 'file',
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to reset settings',
        saving: false,
      });
    }
  },

  importFromFile: async () => {
    set({ error: null });
    try {
      // Use browser File System Access API (Chrome/Edge) with <input> fallback
      let content: string;
      let fileName: string;

      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'YAML files', accept: { 'text/yaml': ['.yml', '.yaml'] } }],
          multiple: false,
        });
        const file: File = await handle.getFile();
        content = await file.text();
        fileName = file.name;
      } else {
        // Fallback: hidden <input type="file">
        const result = await new Promise<{ content: string; fileName: string } | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.yml,.yaml';
          input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
              resolve({ content: await file.text(), fileName: file.name });
            } else {
              resolve(null);
            }
          };
          input.oncancel = () => resolve(null);
          input.click();
        });
        if (!result) return; // User cancelled
        content = result.content;
        fileName = result.fileName;
      }

      // Send content to server for parsing and validation
      set({ loading: true });
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, fileName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      set({
        settings: data.settings,
        source: 'file',
        filePath: fileName,
        loading: false,
        dirty: true, // Imported settings need to be saved to the server file
      });
    } catch (err: any) {
      // Ignore user abort (DOMException from picker cancel)
      if (err?.name === 'AbortError') {
        set({ loading: false });
        return;
      }
      set({
        error: err instanceof Error ? err.message : 'Failed to import settings',
        loading: false,
      });
    }
  },

  exportToFile: async () => {
    set({ error: null });
    try {
      const res = await fetch('/api/settings/export');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const yamlContent = await res.text();

      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'pantoum.settings.yml',
          types: [{ description: 'YAML files', accept: { 'text/yaml': ['.yml', '.yaml'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(yamlContent);
        await writable.close();
      } else {
        // Fallback: trigger download via blob
        const blob = new Blob([yamlContent], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pantoum.settings.yml';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      set({ error: err instanceof Error ? err.message : 'Failed to export settings' });
    }
  },

  loadVersions: async () => {
    set({ versionsLoading: true });
    try {
      const res = await fetch('/api/versions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        versions: data.versions,
        installedVersion: data.installed,
        versionsLoading: false,
      });
    } catch {
      set({ versionsLoading: false });
    }
  },
}));
