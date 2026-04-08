import React, {createContext, useContext, useState, useEffect, useCallback, type ReactNode} from 'react';
import useIsBrowser from '@docusaurus/useIsBrowser';

export type TextSize = 'small' | 'default' | 'large' | 'xlarge';
export type DisplayMode = 'default' | 'large-print' | 'high-contrast' | 'dyslexia';

interface AccessibilityState {
  textSize: TextSize;
  displayMode: DisplayMode;
  toolbarOpen: boolean;
  setTextSize: (size: TextSize) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setToolbarOpen: (open: boolean) => void;
}

const STORAGE_KEY = 'pantoum-a11y';

const defaults: Pick<AccessibilityState, 'textSize' | 'displayMode' | 'toolbarOpen'> = {
  textSize: 'default',
  displayMode: 'default',
  toolbarOpen: false,
};

const AccessibilityContext = createContext<AccessibilityState>({
  ...defaults,
  setTextSize: () => {},
  setDisplayMode: () => {},
  setToolbarOpen: () => {},
});

export function useAccessibility(): AccessibilityState {
  return useContext(AccessibilityContext);
}

function loadSettings(): typeof defaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        textSize: parsed.textSize ?? defaults.textSize,
        displayMode: parsed.displayMode ?? defaults.displayMode,
        toolbarOpen: parsed.toolbarOpen ?? defaults.toolbarOpen,
      };
    }
  } catch {
    // ignore
  }
  return {...defaults};
}

function saveSettings(textSize: TextSize, displayMode: DisplayMode, toolbarOpen: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({textSize, displayMode, toolbarOpen}));
  } catch {
    // ignore
  }
}

function applyToDOM(textSize: TextSize, displayMode: DisplayMode): void {
  const html = document.documentElement;
  if (textSize === 'default') {
    html.removeAttribute('data-a11y-size');
  } else {
    html.setAttribute('data-a11y-size', textSize);
  }
  if (displayMode === 'default') {
    html.removeAttribute('data-a11y-mode');
  } else {
    html.setAttribute('data-a11y-mode', displayMode);
  }
}

export default function AccessibilityProvider({children}: {children: ReactNode}): JSX.Element {
  const isBrowser = useIsBrowser();
  const [textSize, setTextSizeState] = useState<TextSize>(defaults.textSize);
  const [displayMode, setDisplayModeState] = useState<DisplayMode>(defaults.displayMode);
  const [toolbarOpen, setToolbarOpenState] = useState(defaults.toolbarOpen);

  // Load from localStorage on mount
  useEffect(() => {
    if (!isBrowser) return;
    const saved = loadSettings();
    setTextSizeState(saved.textSize);
    setDisplayModeState(saved.displayMode);
    setToolbarOpenState(saved.toolbarOpen);
    applyToDOM(saved.textSize, saved.displayMode);
  }, [isBrowser]);

  const setTextSize = useCallback((size: TextSize) => {
    setTextSizeState(size);
    if (isBrowser) {
      applyToDOM(size, displayMode);
      saveSettings(size, displayMode, toolbarOpen);
    }
  }, [isBrowser, displayMode, toolbarOpen]);

  const setDisplayMode = useCallback((mode: DisplayMode) => {
    setDisplayModeState(mode);
    // Large Print sets text size to xlarge; other modes keep current text size
    const newTextSize = mode === 'large-print' ? 'xlarge' : textSize;
    setTextSizeState(newTextSize);
    if (isBrowser) {
      applyToDOM(newTextSize, mode);
      saveSettings(newTextSize, mode, toolbarOpen);
    }
  }, [isBrowser, textSize, toolbarOpen]);

  const setToolbarOpen = useCallback((open: boolean) => {
    setToolbarOpenState(open);
    if (isBrowser) {
      saveSettings(textSize, displayMode, open);
    }
  }, [isBrowser, textSize, displayMode]);

  return (
    <AccessibilityContext.Provider
      value={{textSize, displayMode, toolbarOpen, setTextSize, setDisplayMode, setToolbarOpen}}>
      {children}
    </AccessibilityContext.Provider>
  );
}
