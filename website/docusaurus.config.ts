import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'PANTOUM',
  tagline: 'AI Assisted SPFx Upgrades',
  favicon: 'img/logo.png',

  url: 'https://pantoum-spfx.github.io',
  baseUrl: '/pantoum/',

  organizationName: 'pantoum-spfx',
  projectName: 'pantoum',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@cmfcmf/docusaurus-search-local',
      {
        indexBlog: false,
        language: 'en',
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/pantoum-spfx/pantoum/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/logo.png',
    navbar: {
      title: 'PANTOUM',
      logo: {
        alt: 'PANTOUM Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          to: '/overview',
          label: 'Overview',
          position: 'left',
        },
        {
          to: '/walkthrough',
          label: 'Walkthrough',
          position: 'left',
        },
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/support-a-cause',
          label: 'Support a Cause',
          position: 'left',
        },
        {
          href: 'https://github.com/pantoum-spfx/pantoum',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Quick Start', to: '/docs/getting-started/quick-start' },
            { label: 'Studio', to: '/docs/user-guide/webapp' },
            { label: 'Settings Reference', to: '/docs/user-guide/settings-reference' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub Issues', href: 'https://github.com/pantoum-spfx/pantoum/issues' },
            { label: 'Contributing', to: '/docs/contributing' },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'Support a Cause', to: '/support-a-cause' },
            { label: 'How Pantoum Works', to: '/docs/architecture/overview' },
          ],
        },
      ],
      copyright: `PANTOUM by <a href="https://github.com/ferrarirosso" target="_blank" rel="noopener noreferrer">Nello D'Andrea</a> — MIT License. Built with Docusaurus.<br/><a href="https://visitorbadge.io/status?path=https%3A%2F%2Fpantoum-spfx.github.io%2Fpantoum" target="_blank" rel="noopener noreferrer"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fpantoum-spfx.github.io%2Fpantoum&labelColor=%23555555&countColor=%2300798c&label=Visitors&style=flat" alt="Visitor count" style="margin-top:8px" /></a>`,
    },
    colorMode: {
      respectPrefersColorScheme: true,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'typescript', 'powershell'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
