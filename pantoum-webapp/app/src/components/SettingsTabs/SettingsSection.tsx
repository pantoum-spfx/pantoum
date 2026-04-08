import React from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { PantoumSettings } from '@shared/types/Settings';
import { SettingControl } from './SettingControl';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    color: tokens.colorNeutralForeground2,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontSize: '12px',
    fontWeight: 600,
    paddingBottom: '4px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  settings: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
});

interface SettingsSectionProps {
  title: string;
  settingKeys: (keyof PantoumSettings)[];
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, settingKeys }) => {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      <Text className={styles.sectionTitle}>{title}</Text>
      <div className={styles.settings}>
        {settingKeys.map((key) => (
          <SettingControl key={key} settingKey={key} />
        ))}
      </div>
    </div>
  );
};
