import React from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { useThemeStore } from './stores/themeStore';

const ThemedApp: React.FC = () => {
  const mode = useThemeStore((s) => s.mode);
  return (
    <FluentProvider theme={mode === 'dark' ? webDarkTheme : webLightTheme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </FluentProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
);
