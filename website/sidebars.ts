import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/before-you-start',
        'getting-started/quick-start',
        'getting-started/authentication',
      ],
    },
    {
      type: 'category',
      label: 'Using Pantoum',
      items: [
        'user-guide/webapp',
        'user-guide/cli',
        'features/reporting',
        'architecture/overview',
        'guides/troubleshooting',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'user-guide/settings-reference',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: [
        'features/claude-code-plugin',
        'user-guide/configuration',
        'guides/extensibility',
        'guides/windows-setup',
        'guides/building',
        'guides/testing',
        'contributing/security',
        'in-practice/upgrading-at-scale',
      ],
    },
    {
      type: 'category',
      label: 'Contributing',
      items: [
        'contributing/contributing',
      ],
    },
  ],
};

export default sidebars;
