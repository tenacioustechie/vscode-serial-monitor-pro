// @ts-check
const { themes: prismThemes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Serial Monitor Pro',
  tagline: 'Record. Replay. Debug faster.',
  favicon: 'img/logo-icon.png',

  url: 'https://serialmonitorpro.millsit.com',
  baseUrl: '/',
  trailingSlash: false,

  organizationName: 'tenacioustechie',
  projectName: 'vscode-serial-monitor-pro',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
      navbar: {
        title: 'Serial Monitor Pro',
        logo: {
          alt: 'Serial Monitor Pro Logo',
          src: 'img/logo-icon.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'mainSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            to: '/docs/project/changelog',
            label: 'Changelog',
            position: 'left',
          },
          {
            href: 'https://github.com/tenacioustechie/vscode-serial-monitor-pro',
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
              { label: 'Installation', to: '/docs/getting-started/installation' },
              { label: 'Quick Start', to: '/docs/getting-started/quick-start' },
              { label: 'Configuration', to: '/docs/reference/configuration' },
            ],
          },
          {
            title: 'Project',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/tenacioustechie/vscode-serial-monitor-pro',
              },
              {
                label: 'VS Code Marketplace',
                href: 'https://marketplace.visualstudio.com/items?itemName=serial-monitor-pro.vscode-serial-monitor-pro',
              },
              { label: 'Changelog', to: '/docs/project/changelog' },
              { label: 'Contributing', to: '/docs/project/contributing' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Serial Monitor Pro. MIT License.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

module.exports = config;
