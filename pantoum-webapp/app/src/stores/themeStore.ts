import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

interface ThemeStore {
  mode: ThemeMode;
  toggle: () => void;
}

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem('pantoum-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  // Respect OS preference
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: getInitialMode(),

  toggle: () =>
    set((state) => {
      const next = state.mode === 'light' ? 'dark' : 'light';
      localStorage.setItem('pantoum-theme', next);
      return { mode: next };
    }),
}));
