# GitHub Docs Site — Design Spec

**Date:** 2026-04-28
**Project:** Serial Monitor Pro (vscode-serial-monitor-pro)
**Status:** Approved

---

## Overview

Create a public documentation website for the Serial Monitor Pro VS Code extension, hosted on GitHub Pages at a custom domain, built with Docusaurus v3, and living inside the same repository as the extension code.

---

## Repository

The repository will be renamed from `vscode-serial-monitor-plus` to `vscode-serial-monitor-pro` on GitHub (tenacioustechie/vscode-serial-monitor-pro). All existing code, git history, and remote URLs carry over automatically after the rename. Local remotes will need a one-time update.

---

## Framework & Hosting

| Concern | Decision |
|---|---|
| Framework | Docusaurus v3 |
| Hosting | GitHub Pages |
| Deploy mechanism | GitHub Actions → `gh-pages` branch |
| Domain | `serialmonitorpro.millsit.com` |
| TLS | GitHub-managed Let's Encrypt (automatic) |

**Why Docusaurus:** First-class dark mode via CSS variables (matching the extension's color palette), built-in sidebar navigation, search, and MDX support. Industry standard for OSS docs.

---

## Repo Structure

The Docusaurus project lives in `/docs-site` at the repo root. This avoids conflict with GitHub Pages' default `/docs` folder detection and keeps it clearly separated from extension source.

```
vscode-serial-monitor-pro/
├── src/                        ← extension source (unchanged)
├── media/                      ← extension webview assets (unchanged)
├── dist/                       ← extension build output (unchanged)
├── .github/
│   └── workflows/
│       └── deploy-docs.yml     ← GitHub Actions deploy workflow (new)
├── docs-site/                  ← Docusaurus project root (new)
│   ├── docusaurus.config.js
│   ├── sidebars.js
│   ├── package.json
│   ├── static/
│   │   ├── img/
│   │   │   ├── logo-icon.png   ← copied from media/logo-icon.png
│   │   │   └── logo-large.png  ← copied from media/logo-large.png
│   │   └── CNAME               ← contains: serialmonitorpro.millsit.com
│   └── docs/
│       ├── getting-started/
│       │   ├── installation.md
│       │   └── quick-start.md
│       ├── features/
│       │   ├── serial-monitor.md
│       │   ├── recording.md
│       │   ├── playback.md
│       │   └── sessions.md
│       ├── reference/
│       │   ├── configuration.md
│       │   └── faq.md
│       └── project/
│           ├── changelog.md
│           └── contributing.md
├── package.json                ← extension package (unchanged)
└── README.md
```

---

## Visual Design

**Theme:** Dark mode, custom CSS variables matching the logo color palette.

| Token | Value | Usage |
|---|---|---|
| Primary / links | `#00d4ff` | Nav active, links, CTA buttons |
| Accent / headings | `#39ff14` | Section labels, sidebar group headings |
| Background | `#0d1b2a` | Page and content background |
| Surface | `#111d2e` | Sidebar, code blocks, cards |
| Border | `#1e3a5f` | Dividers, panel borders |
| Muted text | `#8899aa` | Secondary text, metadata |
| Danger / record | `#e53935` | Used sparingly for warnings |

Applied via a single `src/css/custom.css` file in the Docusaurus project. Dark mode is set as the default (`defaultMode: 'dark'`, `disableSwitch: false` so users can toggle to light).

Logo: `logo-icon.png` in the navbar. `logo-large.png` used on the landing page hero.

---

## Site Pages

### Landing Page (`/`)
Custom Docusaurus home page component (`src/pages/index.js`). Not a docs page. Contains:
- Hero section: logo, tagline ("Record. Replay. Debug faster."), two CTAs (Install from Marketplace, View Docs)
- Feature highlights: three cards (Monitor, Record, Playback) with brief descriptions
- Requirements callout (VS Code 1.85+, optional SoX)
- Footer: GitHub link, MIT license, VS Code Marketplace link

### Docs Pages (`/docs/...`)

| Page | Path | Notes |
|---|---|---|
| Installation | `/docs/getting-started/installation` | SoX install per platform, VS Code install |
| Quick Start | `/docs/getting-started/quick-start` | Connect → Record → Playback walkthrough |
| Serial Monitor | `/docs/features/serial-monitor` | Port list, monitor panel, send/receive |
| Recording | `/docs/features/recording` | Start/stop, audio, session naming |
| Playback | `/docs/features/playback` | Timeline, transport, speed, markers |
| Sessions | `/docs/features/sessions` | Sidebar panel, storage format, sharing |
| Configuration | `/docs/reference/configuration` | Full settings table from package.json |
| FAQ | `/docs/reference/faq` | Troubleshooting, common issues |
| Changelog | `/docs/project/changelog` | Version history (starts thin) |
| Contributing | `/docs/project/contributing` | Dev setup, PR process |

### Sidebar
Four top-level groups visible in Docusaurus sidebar:
1. **Getting Started** (Installation, Quick Start)
2. **Features** (Serial Monitor, Recording, Playback, Sessions)
3. **Reference** (Configuration, FAQ)
4. **Project** (Changelog, Contributing)

---

## Deployment

### GitHub Actions Workflow (`.github/workflows/deploy-docs.yml`)

Triggers on push to `main` when files under `docs-site/**` change (path filter to avoid unnecessary builds on extension-only changes).

Steps:
1. Checkout repo
2. Set up Node.js (v20)
3. `npm ci` inside `docs-site/`
4. `npm run build` inside `docs-site/`
5. Deploy `docs-site/build/` to `gh-pages` branch using `peaceiris/actions-gh-pages`

### GitHub Pages Settings (one-time, in repo settings)
- Source: `gh-pages` branch, `/ (root)`
- Custom domain: `serialmonitorpro.millsit.com`
- Enforce HTTPS: enabled

### DNS (one-time, in millsit.com DNS provider)
```
CNAME  serialmonitorpro  tenacioustechie.github.io
```
Full record: `serialmonitorpro.millsit.com → tenacioustechie.github.io`

### CNAME File
`docs-site/static/CNAME` contains exactly:
```
serialmonitorpro.millsit.com
```
Docusaurus copies `static/` into the build root, so this persists across every deploy automatically.

---

## Docusaurus Config Highlights

```js
// docs-site/docusaurus.config.js (key fields)
{
  title: 'Serial Monitor Pro',
  tagline: 'Record. Replay. Debug faster.',
  url: 'https://serialmonitorpro.millsit.com',
  baseUrl: '/',
  organizationName: 'tenacioustechie',
  projectName: 'vscode-serial-monitor-pro',
  trailingSlash: false,
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Serial Monitor Pro',
      logo: { src: 'img/logo-icon.png', alt: 'Serial Monitor Pro' },
      items: [
        { to: '/docs/getting-started/installation', label: 'Docs' },
        { to: '/docs/project/changelog', label: 'Changelog' },
        { href: 'https://github.com/tenacioustechie/vscode-serial-monitor-pro', label: 'GitHub' },
      ],
    },
  },
}
```

---

## Out of Scope

- Search integration (Algolia DocSearch) — add later once site is indexed
- Versioned docs — not needed at v0.1, add when breaking changes occur
- i18n / translations
- Analytics

---

## Open Items at Launch

- Screenshots and GIFs for feature pages — placeholder sections will be left in each feature doc with a `<!-- TODO: add screenshot -->` comment
- Marketplace URL — add once published; landing page CTA links to GitHub until then
- Changelog — starts with a single entry for v0.1.0
