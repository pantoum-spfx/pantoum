import React from 'react';
import {useAccessibility, type TextSize, type DisplayMode} from '../AccessibilityProvider';
import styles from './styles.module.css';

const textSizes: {key: TextSize; label: string}[] = [
  {key: 'small', label: 'A-'},
  {key: 'default', label: 'A'},
  {key: 'large', label: 'A+'},
  {key: 'xlarge', label: 'A++'},
];

const displayModes: {key: DisplayMode; label: string}[] = [
  {key: 'default', label: 'Default'},
  {key: 'large-print', label: 'Large Print'},
  {key: 'high-contrast', label: 'High Contrast'},
  {key: 'dyslexia', label: 'Dyslexia Friendly'},
];

function AccessibilityIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="4" r="2" />
      <path d="M12 7c-1 0-6 .5-6 .5l.5 2s3-.5 4-.5v4l-3 7h2.5l2-5 2 5h2.5l-3-7v-4c1 0 3.5.5 4 .5l.5-2S13 7 12 7z" />
    </svg>
  );
}

export default function AccessibilityToolbar(): JSX.Element {
  const {textSize, displayMode, toolbarOpen, setTextSize, setDisplayMode, setToolbarOpen} =
    useAccessibility();

  if (!toolbarOpen) {
    return (
      <div className={styles.collapsed}>
        <button
          className={styles.toggleButton}
          onClick={() => setToolbarOpen(true)}
          aria-label="Open accessibility settings"
          title="Accessibility settings">
          <AccessibilityIcon />
          <span className={styles.toggleLabel}>Accessibility</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Accessibility settings">
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Text Size:</span>
        {textSizes.map(({key, label}) => (
          <button
            key={key}
            className={textSize === key ? styles.sizeButtonActive : styles.sizeButton}
            onClick={() => setTextSize(key)}
            aria-label={`Text size: ${label}`}
            aria-pressed={textSize === key}>
            {label}
          </button>
        ))}
      </div>

      <div className={styles.separator} aria-hidden="true" />

      <div className={styles.section}>
        {displayModes.map(({key, label}) => (
          <button
            key={key}
            className={displayMode === key ? styles.modeButtonActive : styles.modeButton}
            onClick={() => setDisplayMode(key)}
            aria-label={`Display mode: ${label}`}
            aria-pressed={displayMode === key}>
            {label}
          </button>
        ))}
      </div>

      <button
        className={styles.closeButton}
        onClick={() => setToolbarOpen(false)}
        aria-label="Close accessibility toolbar">
        &times;
      </button>
    </div>
  );
}
