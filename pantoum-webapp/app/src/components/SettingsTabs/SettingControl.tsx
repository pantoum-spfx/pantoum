import React from 'react';
import {
  makeStyles,
  tokens,
  Switch,
  Dropdown,
  Option,
  Input,
  Slider,
  Text,
  Popover,
  PopoverTrigger,
  PopoverSurface,
} from '@fluentui/react-components';
import { InfoFilled } from '@fluentui/react-icons';
import type { PantoumSettings } from '@shared/types/Settings';
import {
  AGENT_MODEL_OPTIONS,
  SETTING_DESCRIPTIONS,
  SETTING_DEPENDENCIES,
  SETTING_LABELS,
} from '@shared/types/Settings';
import { useSettingsStore } from '../../stores/settingsStore';

const useStyles = makeStyles({
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  rowDisabled: {
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
  rowIndented: {
    marginLeft: '24px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  control: {
    minWidth: '180px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '200px',
  },
});

interface SettingControlProps {
  settingKey: keyof PantoumSettings;
}

export const SettingControl: React.FC<SettingControlProps> = ({ settingKey }) => {
  const styles = useStyles();
  const { settings, updateSetting, versions, installedVersion, versionsLoading } = useSettingsStore();

  const value = settings[settingKey];
  const description = SETTING_DESCRIPTIONS[settingKey];

  // Check if this setting is disabled due to parent dependency
  const deps = SETTING_DEPENDENCIES[settingKey];
  const isDisabled = deps
    ? deps.some((parentKey) => {
        const parentValue = settings[parentKey];
        if (parentKey === 'agent_model') return String(parentValue).toLowerCase().includes('haiku');
        return parentValue === false || parentValue === 'none';
      })
    : false;

  const isIndented = !!deps;

  const rowClasses = [
    styles.row,
    isDisabled ? styles.rowDisabled : '',
    isIndented ? styles.rowIndented : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Render the appropriate control based on setting type
  const renderControl = () => {
    // Special case: target_version dropdown with live npm versions
    if (settingKey === 'target_version') {
      const versionList = versions.length > 0 ? versions : [value as string];
      return (
        <Dropdown
          value={value as string}
          selectedOptions={[value as string]}
          onOptionSelect={(_, data) => {
            if (data.optionValue) updateSetting(settingKey, data.optionValue as any);
          }}
          style={{ minWidth: '150px' }}
          disabled={versionsLoading}
        >
          {versionList.map((v) => {
            const display = v === installedVersion ? `${v} (current)` : v;
            return (
              <Option key={v} value={v} text={display}>
                {display}
              </Option>
            );
          })}
        </Dropdown>
      );
    }

    // agent_model dropdown
    if (settingKey === 'agent_model') {
      return (
        <Dropdown
          value={AGENT_MODEL_OPTIONS.find((option) => option.value === value)?.label || 'Sonnet'}
          selectedOptions={[value as string]}
          onOptionSelect={(_, data) => {
            if (data.optionValue) updateSetting(settingKey, data.optionValue as any);
          }}
          style={{ minWidth: '180px' }}
        >
          {AGENT_MODEL_OPTIONS.map((option) => (
            <Option key={option.value} value={option.value} text={option.label}>
              {option.label}
            </Option>
          ))}
        </Dropdown>
      );
    }

    // thinking_effort dropdown
    if (settingKey === 'thinking_effort') {
      const effortDisplayMap: Record<string, string> = {
        max: 'Max (100K tokens)',
        high: 'High (40K tokens)',
        medium: 'Medium (16K tokens)',
        low: 'Low (4K tokens)',
        off: 'Off',
      };
      return (
        <Dropdown
          value={effortDisplayMap[value as string] || 'Medium (16K tokens)'}
          selectedOptions={[value as string]}
          onOptionSelect={(_, data) => {
            if (data.optionValue) updateSetting(settingKey, data.optionValue as any);
          }}
          style={{ minWidth: '150px' }}
        >
          <Option value="max">Max (100K tokens)</Option>
          <Option value="high">High (40K tokens)</Option>
          <Option value="medium">Medium (16K tokens) (Default)</Option>
          <Option value="low">Low (4K tokens)</Option>
          <Option value="off">Off</Option>
        </Dropdown>
      );
    }

    // env_injection_strategy dropdown
    if (settingKey === 'env_injection_strategy') {
      return (
        <Dropdown
          value={value as string}
          selectedOptions={[value as string]}
          onOptionSelect={(_, data) => {
            if (data.optionValue) updateSetting(settingKey, data.optionValue as any);
          }}
          style={{ minWidth: '180px' }}
        >
          <Option value="webpack-patch">webpack-patch</Option>
          <Option value="none">none</Option>
        </Dropdown>
      );
    }

    // Update strategy dropdowns
    if (settingKey === 'update_production_deps' || settingKey === 'update_dev_deps') {
      return (
        <Dropdown
          value={value as string}
          selectedOptions={[value as string]}
          onOptionSelect={(_, data) => {
            if (data.optionValue) updateSetting(settingKey, data.optionValue as any);
          }}
          style={{ minWidth: '120px' }}
        >
          <Option value="none">None</Option>
          <Option value="patch">Patch</Option>
          <Option value="minor">Minor</Option>
          <Option value="major">Major</Option>
        </Dropdown>
      );
    }

    // ai_max_retries slider
    if (settingKey === 'ai_max_retries') {
      return (
        <div className={styles.sliderContainer}>
          <Slider
            min={1}
            max={10}
            step={1}
            value={value as number}
            onChange={(_, data) => updateSetting(settingKey, data.value as any)}
            style={{ flex: 1 }}
          />
          <Text weight="semibold" style={{ minWidth: '24px', textAlign: 'center' }}>
            {value as number}
          </Text>
        </div>
      );
    }

    // version_comment text input
    if (settingKey === 'version_comment') {
      return (
        <Input
          value={value as string}
          onChange={(_, data) => updateSetting(settingKey, data.value as any)}
          style={{ minWidth: '250px' }}
          size="small"
        />
      );
    }

    // excluded_patches text input (comma-separated)
    if (settingKey === 'excluded_patches') {
      const arr = value as string[];
      return (
        <Input
          value={arr.join(', ')}
          onChange={(_, data) => {
            const patches = data.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            updateSetting(settingKey, patches as any);
          }}
          placeholder="FN019002, FN012019"
          style={{ minWidth: '250px' }}
          size="small"
        />
      );
    }

    // Boolean toggle (default)
    if (typeof value === 'boolean') {
      return (
        <Switch
          checked={value}
          onChange={(_, data) => updateSetting(settingKey, data.checked as any)}
        />
      );
    }

    // Fallback text input
    return (
      <Input
        value={String(value)}
        onChange={(_, data) => updateSetting(settingKey, data.value as any)}
        size="small"
      />
    );
  };

  // Use explicit label if available, otherwise auto-generate from snake_case key
  const label = SETTING_LABELS[settingKey] ?? settingKey
    .replace(/_/g, ' ')
    .replace(/\bai\b/gi, 'AI')
    .replace(/\bnvmrc\b/gi, '.nvmrc')
    .replace(/\bm365\b/gi, 'M365')
    .replace(/\bui\b/gi, 'UI')
    .replace(/\beslint\b/gi, 'ESLint')
    .replace(/\bpnp\b/gi, 'PnP')
    .replace(/\bjson\b/gi, 'JSON')
    .replace(/^./, (c) => c.toUpperCase());

  const showComplexityWarning =
    settingKey === 'analyze_complexity' && value === true;

  return (
    <>
      <div className={rowClasses}>
        <div className={styles.label}>
          <Text weight="regular">{label}</Text>
          <Popover positioning="below-start" openOnHover>
            <PopoverTrigger disableButtonEnhancement>
              <InfoFilled style={{ fontSize: '20px', color: tokens.colorBrandForeground1, cursor: 'help' }} />
            </PopoverTrigger>
            <PopoverSurface style={{
              maxWidth: '320px',
              padding: '12px 16px',
              color: tokens.colorNeutralForeground1,
              backgroundColor: tokens.colorNeutralBackground1,
              border: `1px solid ${tokens.colorNeutralStroke1}`,
            }}>
              <Text weight="semibold" block style={{ marginBottom: '4px' }}>{label}</Text>
              <Text size={200}>{description}</Text>
            </PopoverSurface>
          </Popover>
        </div>
        <div className={styles.control}>{renderControl()}</div>
      </div>
      {showComplexityWarning && (
        <div className={styles.rowIndented} style={{ padding: '4px 12px' }}>
          <Text size={200} style={{ color: tokens.colorPaletteYellowForeground2 }}>
            Complexity analysis makes ~150 npm registry calls per solution. This runs automatically after scanning and may take 20-30 seconds per solution.
          </Text>
        </div>
      )}
    </>
  );
};
