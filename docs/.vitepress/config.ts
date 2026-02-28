import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Brain Ecosystem',
  description: 'Self-learning MCP servers for Claude Code',
  base: '/brain-ecosystem/',

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/' },
      { text: 'GitHub', link: 'https://github.com/timmeck/brain-ecosystem' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'How It Works', link: '/guide/how-it-works' },
          ],
        },
        {
          text: 'Brains',
          items: [
            { text: 'Error Memory (Brain)', link: '/guide/brain' },
            { text: 'Trading Signals', link: '/guide/trading-brain' },
            { text: 'Marketing Intelligence', link: '/guide/marketing-brain' },
          ],
        },
        {
          text: 'Architecture',
          items: [
            { text: 'Hebbian Learning', link: '/guide/hebbian-learning' },
            { text: 'Cross-Brain Communication', link: '/guide/cross-brain' },
            { text: 'Synapse Networks', link: '/guide/synapses' },
          ],
        },
        {
          text: 'Deployment',
          items: [
            { text: 'Docker', link: '/guide/docker' },
            { text: 'FAQ', link: '/guide/faq' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Brain MCP Tools', link: '/api/' },
            { text: 'Trading MCP Tools', link: '/api/trading' },
            { text: 'Marketing MCP Tools', link: '/api/marketing' },
            { text: 'CLI Commands', link: '/api/cli' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/timmeck/brain-ecosystem' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-2026 Tim Mecklenburg',
    },
  },
});
