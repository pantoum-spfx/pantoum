import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Tab,
  TabList,
  Text,

  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  HomeRegular,
  SettingsRegular,
  ArrowUploadRegular,
  DocumentTextRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from '@fluentui/react-icons';
import { useThemeStore } from '../../stores/themeStore';
import { ServerStatusIndicator } from './ServerStatusIndicator';
import { UpgradeStatusIndicator } from './UpgradeStatusIndicator';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    gap: '8px',
    minHeight: '44px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    userSelect: 'none',
    flexShrink: 0,
  },
  logoImg: {
    width: '28px',
    height: '28px',
  },
  nav: {
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    /* Hide scrollbar but keep functionality */
    scrollbarWidth: 'none',
    '::-webkit-scrollbar': {
      display: 'none',
    },
  },
  themeToggle: {
    flexShrink: 0,
  },
  content: {
    flex: 1,
    padding: '20px',
    maxWidth: '1400px',
    width: '100%',
    margin: '0 auto',
  },
});

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: <HomeRegular /> },
  { path: '/settings', label: 'Settings', icon: <SettingsRegular /> },
  { path: '/upgrade', label: 'Upgrade', icon: <ArrowUploadRegular /> },
  { path: '/reports', label: 'Reports', icon: <DocumentTextRegular /> },
];

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const styles = useStyles();
  const location = useLocation();
  const { mode, toggle } = useThemeStore();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} style={{ textDecoration: 'none', color: 'inherit' }}>
          <img src="/logo.png" alt="PANTOUM" className={styles.logoImg} />
          <Text weight="bold" size={400}>
            PANTOUM
          </Text>
        </Link>
        <nav className={styles.nav}>
          <TabList
            selectedValue={location.pathname}
            size="small"
          >
            {NAV_ITEMS.map(({ path, label, icon }) => (
              <Link key={path} to={path} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Tab value={path} icon={icon}>
                  {label}
                </Tab>
              </Link>
            ))}
          </TabList>
        </nav>
        <UpgradeStatusIndicator />
        <ServerStatusIndicator />
        <Tooltip
          content={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          relationship="label"
        >
          <Button
            className={styles.themeToggle}
            appearance="subtle"
            icon={mode === 'light' ? <WeatherMoonRegular /> : <WeatherSunnyRegular />}
            onClick={toggle}
            size="small"
          />
        </Tooltip>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
};
