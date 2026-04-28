/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  mainSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
      ],
    },
    {
      type: 'category',
      label: 'Features',
      collapsed: false,
      items: [
        'features/serial-monitor',
        'features/recording',
        'features/playback',
        'features/sessions',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/configuration',
        'reference/faq',
      ],
    },
    {
      type: 'category',
      label: 'Project',
      items: [
        'project/changelog',
        'project/contributing',
      ],
    },
  ],
};

module.exports = sidebars;
