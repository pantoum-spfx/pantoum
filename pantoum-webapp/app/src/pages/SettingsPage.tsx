import React, { useState } from 'react';
import {
  makeStyles,
  tokens,
  Tab,
  TabList,
  Text,
  Button,
  Badge,
  Spinner,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Tooltip,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogActions,
  DialogTrigger,
} from '@fluentui/react-components';
import {
  SaveRegular,
  ArrowResetRegular,
  CheckmarkRegular,
  ArrowImportRegular,
  ArrowExportRegular,
} from '@fluentui/react-icons';
import { useSettings } from '../hooks/useSettings';
import { SETTINGS_TABS } from '@shared/types/Settings';
import { SettingsSection } from '../components/SettingsTabs/SettingsSection';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  tabDescription: {
    color: tokens.colorNeutralForeground3,
  },
  tabContent: {
    padding: '16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
});

export const SettingsPage: React.FC = () => {
  const styles = useStyles();
  const {
    settings,
    loading,
    saving,
    dirty,
    error,
    saveSettings,
    resetToDefaults,
    importFromFile,
    exportToFile,
    source,
    filePath,
  } = useSettings();
  const [selectedTab, setSelectedTab] = useState('main');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  if (loading) {
    return <Spinner label="Loading settings..." />;
  }

  const activeTab = SETTINGS_TABS.find((t) => t.id === selectedTab) ?? SETTINGS_TABS[0];

  const handleResetConfirm = async () => {
    setResetDialogOpen(false);
    await resetToDefaults();
  };

  const fileName = filePath?.split(/[/\\]/).pop();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Text as="h1" size={700} weight="bold">
            Settings
          </Text>
          {source === 'file' && filePath && (
            <Tooltip content={filePath} relationship="description">
              <Text size={300} style={{ color: tokens.colorNeutralForeground3, fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace' }}>
                {fileName}
              </Text>
            </Tooltip>
          )}
          {source === 'defaults' && (
            <Badge appearance="outline" color="warning" size="small">
              Using defaults
            </Badge>
          )}
        </div>
        <div className={styles.actions}>
          {dirty && (
            <Badge appearance="filled" color="important" size="small">
              Unsaved changes
            </Badge>
          )}
          <Button
            appearance="primary"
            icon={saving ? undefined : dirty ? <SaveRegular /> : <CheckmarkRegular />}
            onClick={saveSettings}
            disabled={saving || !dirty}
          >
            {saving ? <Spinner size="tiny" /> : dirty ? 'Save' : 'Saved'}
          </Button>
          <Button
            appearance="secondary"
            icon={<ArrowImportRegular />}
            onClick={importFromFile}
            disabled={saving}
          >
            Import
          </Button>
          <Button
            appearance="secondary"
            icon={<ArrowExportRegular />}
            onClick={exportToFile}
            disabled={saving}
          >
            Export
          </Button>
          <Dialog open={resetDialogOpen} onOpenChange={(_, data) => setResetDialogOpen(data.open)}>
            <DialogTrigger disableButtonEnhancement>
              <Button
                appearance="secondary"
                icon={<ArrowResetRegular />}
                disabled={saving}
              >
                Reset to Defaults
              </Button>
            </DialogTrigger>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>Reset to Defaults?</DialogTitle>
                <Text>
                  This will overwrite all settings with PANTOUM built-in defaults and save to{' '}
                  <Text weight="semibold">pantoum.settings.yml</Text>.
                </Text>
                <DialogActions>
                  <DialogTrigger disableButtonEnhancement>
                    <Button appearance="primary">Cancel</Button>
                  </DialogTrigger>
                  <Button
                    appearance="outline"
                    onClick={handleResetConfirm}
                    style={{ color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedBorder1 }}
                  >
                    Reset
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Error</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      <TabList
        selectedValue={selectedTab}
        onTabSelect={(_, data) => setSelectedTab(data.value as string)}
        size="large"
      >
        {SETTINGS_TABS.map((tab) => (
          <Tab key={tab.id} value={tab.id}>
            {tab.label}
          </Tab>
        ))}
      </TabList>

      <Divider />

      <Text size={300} className={styles.tabDescription}>
        {activeTab.description}
      </Text>

      <div className={styles.tabContent}>
        {activeTab.sections.map((section) => (
          <SettingsSection key={section.title} title={section.title} settingKeys={section.settings} />
        ))}
      </div>
    </div>
  );
};
