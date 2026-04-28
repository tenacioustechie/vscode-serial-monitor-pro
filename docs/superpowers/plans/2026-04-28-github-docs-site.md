# GitHub Docs Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a Docusaurus v3 docs site for Serial Monitor Pro at `serialmonitorpro.millsit.com`, living inside the `vscode-serial-monitor-pro` repo under `/docs-site`.

**Architecture:** Docusaurus v3 (classic preset, JavaScript) bootstrapped into `docs-site/` at the repo root. Content is markdown in `docs-site/docs/`. A GitHub Actions workflow builds on push to `main` and deploys to the `gh-pages` branch. GitHub Pages serves that branch at the custom domain via a CNAME DNS record.

**Tech Stack:** Docusaurus v3, React (landing page), GitHub Actions (`peaceiris/actions-gh-pages@v3`), GitHub Pages, custom CSS variables for dark theme.

---

## File Map

**Created by bootstrap (then overwritten):**
- `docs-site/docusaurus.config.js` — site config, nav, theme
- `docs-site/sidebars.js` — sidebar nav groups
- `docs-site/src/css/custom.css` — dark theme CSS variables
- `docs-site/src/pages/index.js` — custom landing page (React)
- `docs-site/src/pages/index.module.css` — landing page styles

**Created manually:**
- `docs-site/static/CNAME` — custom domain record
- `docs-site/static/img/logo-icon.png` — copied from `media/logo-icon.png`
- `docs-site/static/img/logo-large.png` — copied from `media/logo-large.png`
- `docs-site/docs/getting-started/installation.md`
- `docs-site/docs/getting-started/quick-start.md`
- `docs-site/docs/features/serial-monitor.md`
- `docs-site/docs/features/recording.md`
- `docs-site/docs/features/playback.md`
- `docs-site/docs/features/sessions.md`
- `docs-site/docs/reference/configuration.md`
- `docs-site/docs/reference/faq.md`
- `docs-site/docs/project/changelog.md`
- `docs-site/docs/project/contributing.md`
- `.github/workflows/deploy-docs.yml`

**Modified:**
- `.gitignore` — add `.superpowers/` and `docs-site/build/`
- `README.md` — add docs site link

---

## Task 1: Rename Repository on GitHub

**Files:** none (GitHub UI action)

- [ ] **Step 1: Rename repo on GitHub**

  Go to `https://github.com/tenacioustechie/vscode-serial-monitor-plus` → Settings → Repository name → change to `vscode-serial-monitor-pro` → click **Rename**.

- [ ] **Step 2: Update local remote**

  ```bash
  git remote set-url origin https://github.com/tenacioustechie/vscode-serial-monitor-pro.git
  git remote -v
  ```

  Expected output:
  ```
  origin  https://github.com/tenacioustechie/vscode-serial-monitor-pro.git (fetch)
  origin  https://github.com/tenacioustechie/vscode-serial-monitor-pro.git (push)
  ```

- [ ] **Step 3: Commit**

  No files changed — nothing to commit.

---

## Task 2: Bootstrap Docusaurus

**Files:** Creates `docs-site/` directory (entire Docusaurus project)

- [ ] **Step 1: Run the Docusaurus scaffolder**

  Run from the repo root (not inside `docs-site/`):

  ```bash
  npx create-docusaurus@3 docs-site classic
  ```

  When prompted "Ok to proceed? (y)" type `y`. When asked about TypeScript, select **No** (JavaScript).

  Expected: `docs-site/` created with `docusaurus.config.js`, `sidebars.js`, `src/`, `docs/`, `blog/`, `static/`, `package.json`.

- [ ] **Step 2: Verify the bootstrap works**

  ```bash
  cd docs-site && npm run build
  ```

  Expected: exits 0, produces `docs-site/build/`. Any warnings about broken links are fine at this stage.

  ```bash
  cd ..
  ```

- [ ] **Step 3: Delete template content we don't need**

  ```bash
  rm -rf docs-site/blog
  rm -rf docs-site/docs
  rm -rf docs-site/src/components
  rm docs-site/src/pages/index.js docs-site/src/pages/index.module.css
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add docs-site
  git commit -m "feat(docs): bootstrap Docusaurus v3 in docs-site/"
  ```

---

## Task 3: Configure Docusaurus

**Files:**
- Overwrite: `docs-site/docusaurus.config.js`

- [ ] **Step 1: Replace docusaurus.config.js**

  Write this entire file (replaces the bootstrapped version):

  ```js
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
  ```

- [ ] **Step 2: Verify config parses**

  ```bash
  cd docs-site && node -e "require('./docusaurus.config.js')" && echo OK
  ```

  Expected: `OK` (no errors).

  ```bash
  cd ..
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add docs-site/docusaurus.config.js
  git commit -m "feat(docs): configure Docusaurus — URL, nav, footer, dark mode default"
  ```

---

## Task 4: Dark Theme CSS

**Files:**
- Overwrite: `docs-site/src/css/custom.css`

- [ ] **Step 1: Replace custom.css**

  ```css
  :root {
    --ifm-color-primary: #00d4ff;
    --ifm-color-primary-dark: #00bfe6;
    --ifm-color-primary-darker: #00b3d9;
    --ifm-color-primary-darkest: #0094b3;
    --ifm-color-primary-light: #1ad8ff;
    --ifm-color-primary-lighter: #26daff;
    --ifm-color-primary-lightest: #4de0ff;
    --ifm-code-font-size: 95%;
    --docusaurus-highlighted-code-line-bg: rgba(0, 212, 255, 0.1);
  }

  [data-theme='dark'] {
    --ifm-color-primary: #00d4ff;
    --ifm-color-primary-dark: #00bfe6;
    --ifm-color-primary-darker: #00b3d9;
    --ifm-color-primary-darkest: #0094b3;
    --ifm-color-primary-light: #1ad8ff;
    --ifm-color-primary-lighter: #26daff;
    --ifm-color-primary-lightest: #4de0ff;
    --ifm-background-color: #0d1b2a;
    --ifm-background-surface-color: #111d2e;
    --ifm-navbar-background-color: #0d1b2a;
    --ifm-footer-background-color: #111d2e;
    --ifm-toc-border-color: #1e3a5f;
    --ifm-color-emphasis-300: #1e3a5f;
    --ifm-color-emphasis-600: #8899aa;
    --ifm-sidebar-background: #111d2e;
    --docusaurus-highlighted-code-line-bg: rgba(0, 212, 255, 0.1);
  }

  [data-theme='dark'] .navbar {
    border-bottom: 1px solid #1e3a5f;
  }

  [data-theme='dark'] .menu__link--active {
    color: #00d4ff;
  }

  [data-theme='dark'] .table-of-contents__link--active {
    color: #00d4ff;
  }

  [data-theme='dark'] .footer {
    border-top: 1px solid #1e3a5f;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs-site/src/css/custom.css
  git commit -m "feat(docs): dark theme — navy/cyan/green color palette"
  ```

---

## Task 5: Sidebar Navigation

**Files:**
- Overwrite: `docs-site/sidebars.js`

- [ ] **Step 1: Replace sidebars.js**

  ```js
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
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs-site/sidebars.js
  git commit -m "feat(docs): configure sidebar — 4 nav groups"
  ```

---

## Task 6: Logo Assets and CNAME

**Files:**
- Create: `docs-site/static/img/logo-icon.png`
- Create: `docs-site/static/img/logo-large.png`
- Create: `docs-site/static/CNAME`

- [ ] **Step 1: Copy logo files**

  ```bash
  mkdir -p docs-site/static/img
  cp media/logo-icon.png docs-site/static/img/logo-icon.png
  cp media/logo-large.png docs-site/static/img/logo-large.png
  ```

- [ ] **Step 2: Create CNAME file**

  Create `docs-site/static/CNAME` with exactly this content (no trailing newline issues — just the domain):

  ```
  serialmonitorpro.millsit.com
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add docs-site/static
  git commit -m "feat(docs): add logo assets and CNAME for custom domain"
  ```

---

## Task 7: Landing Page

**Files:**
- Create: `docs-site/src/pages/index.js`
- Create: `docs-site/src/pages/index.module.css`

- [ ] **Step 1: Create index.js**

  ```jsx
  import React from 'react';
  import Layout from '@theme/Layout';
  import Link from '@docusaurus/Link';
  import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
  import styles from './index.module.css';

  function HeroSection() {
    return (
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <img
            src="img/logo-large.png"
            alt="Serial Monitor Pro"
            className={styles.heroLogo}
          />
          <h1 className={styles.heroTitle}>Serial Monitor Pro</h1>
          <p className={styles.heroSubtitle}>
            Record your serial sessions with audio commentary.<br />
            Replay and debug exactly what happened.
          </p>
          <div className={styles.heroButtons}>
            <Link
              className={styles.btnPrimary}
              href="https://marketplace.visualstudio.com/items?itemName=serial-monitor-pro.vscode-serial-monitor-pro"
            >
              Install from Marketplace
            </Link>
            <Link
              className={styles.btnSecondary}
              to="/docs/getting-started/installation"
            >
              View Docs
            </Link>
          </div>
          <div className={styles.heroBadges}>
            <span>✓ Free &amp; Open Source</span>
            <span>✓ MIT License</span>
            <span>✓ VS Code 1.85+</span>
          </div>
        </div>
      </header>
    );
  }

  function FeatureCard({ title, description, icon }) {
    return (
      <div className={styles.featureCard}>
        <div className={styles.featureIcon}>{icon}</div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    );
  }

  const features = [
    {
      icon: '🖥️',
      title: 'Serial Monitor',
      description:
        'Connect to any serial port from VS Code. Full control over baud rate, data bits, stop bits, parity, and line endings. Custom baud rates supported.',
    },
    {
      icon: '⏺️',
      title: 'Timeline Recording',
      description:
        'Record every byte with millisecond-precision timestamps, synchronized with your microphone for voice commentary. No browser permissions needed.',
    },
    {
      icon: '▶️',
      title: 'Session Playback',
      description:
        'Replay sessions at 0.25×–10× speed with synchronized audio. Add markers, seek through the timeline, and filter events by direction.',
    },
  ];

  export default function Home() {
    const { siteConfig } = useDocusaurusContext();
    return (
      <Layout
        title={siteConfig.title}
        description={siteConfig.tagline}
      >
        <HeroSection />
        <main>
          <section className={styles.features}>
            <div className={styles.featuresInner}>
              {features.map((f) => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          </section>
          <section className={styles.requirements}>
            <div className={styles.requirementsInner}>
              <h2>Requirements</h2>
              <ul>
                <li>
                  <strong>VS Code</strong> 1.85.0 or later
                </li>
                <li>
                  <strong>SoX</strong> for audio recording (optional — the
                  extension works without it)
                </li>
              </ul>
              <p>
                Install SoX:{' '}
                <code>brew install sox</code> (macOS) ·{' '}
                <code>apt install sox</code> (Linux) ·{' '}
                <code>choco install sox.portable</code> (Windows)
              </p>
            </div>
          </section>
        </main>
      </Layout>
    );
  }
  ```

- [ ] **Step 2: Create index.module.css**

  ```css
  .hero {
    background: #0d1b2a;
    padding: 64px 24px;
    text-align: center;
    border-bottom: 1px solid #1e3a5f;
  }

  .heroInner {
    max-width: 680px;
    margin: 0 auto;
  }

  .heroLogo {
    width: 100px;
    height: 100px;
    margin-bottom: 20px;
  }

  .heroTitle {
    font-size: 2.5rem;
    font-weight: 800;
    color: #39ff14;
    margin-bottom: 12px;
  }

  .heroSubtitle {
    font-size: 1.1rem;
    color: #8899aa;
    margin-bottom: 28px;
    line-height: 1.6;
  }

  .heroButtons {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .btnPrimary {
    background: #00d4ff;
    color: #0d1b2a;
    padding: 10px 24px;
    border-radius: 6px;
    font-weight: 700;
    text-decoration: none;
    font-size: 0.95rem;
  }

  .btnPrimary:hover {
    background: #1ad8ff;
    color: #0d1b2a;
    text-decoration: none;
  }

  .btnSecondary {
    border: 1px solid #39ff14;
    color: #39ff14;
    padding: 10px 24px;
    border-radius: 6px;
    font-weight: 600;
    text-decoration: none;
    font-size: 0.95rem;
  }

  .btnSecondary:hover {
    background: rgba(57, 255, 20, 0.1);
    color: #39ff14;
    text-decoration: none;
  }

  .heroBadges {
    display: flex;
    gap: 20px;
    justify-content: center;
    font-size: 0.85rem;
    color: #8899aa;
    flex-wrap: wrap;
  }

  .features {
    padding: 48px 24px;
    background: #111d2e;
  }

  .featuresInner {
    max-width: 900px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 24px;
  }

  .featureCard {
    background: #0d1b2a;
    border: 1px solid #1e3a5f;
    border-radius: 8px;
    padding: 24px;
  }

  .featureIcon {
    font-size: 2rem;
    margin-bottom: 12px;
  }

  .featureCard h3 {
    color: #00d4ff;
    margin-bottom: 8px;
  }

  .featureCard p {
    color: #8899aa;
    font-size: 0.9rem;
    line-height: 1.6;
    margin: 0;
  }

  .requirements {
    padding: 40px 24px;
    background: #0d1b2a;
    border-top: 1px solid #1e3a5f;
  }

  .requirementsInner {
    max-width: 680px;
    margin: 0 auto;
  }

  .requirementsInner h2 {
    color: #39ff14;
    margin-bottom: 16px;
  }

  .requirementsInner ul {
    color: #8899aa;
    margin-bottom: 12px;
  }

  .requirementsInner p {
    color: #8899aa;
    font-size: 0.9rem;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add docs-site/src/pages
  git commit -m "feat(docs): landing page — hero, feature cards, requirements"
  ```

---

## Task 8: Getting Started Docs

**Files:**
- Create: `docs-site/docs/getting-started/installation.md`
- Create: `docs-site/docs/getting-started/quick-start.md`

- [ ] **Step 1: Create installation.md**

  ```bash
  mkdir -p docs-site/docs/getting-started
  ```

  Write `docs-site/docs/getting-started/installation.md`:

  ````markdown
  ---
  sidebar_position: 1
  ---

  # Installation

  ## VS Code Extension

  Install Serial Monitor Pro from the VS Code Marketplace:

  1. Open VS Code.
  2. Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`).
  3. Search for **Serial Monitor Pro**.
  4. Click **Install**.

  Or install directly from the command line:

  ```bash
  code --install-extension serial-monitor-pro.vscode-serial-monitor-pro
  ```

  ## SoX — Audio Recording (Optional)

  Audio recording requires [SoX](https://sourceforge.net/projects/sox/) to be installed on your system. The extension works without it — audio recording is simply disabled and a warning is shown.

  ### macOS

  ```bash
  brew install sox
  ```

  ### Linux (Debian / Ubuntu)

  ```bash
  sudo apt install sox
  ```

  ### Windows

  ```bash
  choco install sox.portable
  ```

  :::tip
  If SoX is not installed, Serial Monitor Pro will display a warning when you attempt to record but will continue to work normally for serial monitoring.
  :::
  ````

- [ ] **Step 2: Create quick-start.md**

  Write `docs-site/docs/getting-started/quick-start.md`:

  ````markdown
  ---
  sidebar_position: 2
  ---

  # Quick Start

  ## 1. Open the Panel

  Click the **Serial Monitor Pro** icon (plug) in the VS Code activity bar. The **Serial Ports** and **Recorded Sessions** panels appear in the sidebar.

  ## 2. Connect to a Port

  1. Your connected serial ports are listed automatically in the **Serial Ports** panel.
  2. Click a port to open the monitor panel.
  3. Set the baud rate and other options in the toolbar.
  4. Click **Connect**.

  Received data appears in the terminal-style output. Type a message in the input field at the bottom and press **Enter** to send.

  ## 3. Record a Session

  1. While connected, click the **Record** (⏺) button in the monitor toolbar.
  2. Speak into your microphone to add voice commentary — the microphone records in parallel with the serial data.
  3. Click **Stop** when done.
  4. Give the session a name in the prompt.

  Sessions are saved automatically to the workspace `.serial-sessions/` directory.

  ## 4. Play Back a Session

  1. Find the session in the **Recorded Sessions** sidebar panel.
  2. Click it to open the playback panel.
  3. Click **Play** to start replay. Audio plays in sync with the data timeline.
  4. Use the seek bar to jump to any point. Adjust playback speed from 0.25× to 10×.

  <!-- TODO: add walkthrough screenshot/GIF -->
  ````

- [ ] **Step 3: Commit**

  ```bash
  git add docs-site/docs/getting-started
  git commit -m "feat(docs): getting started — installation and quick start pages"
  ```

---

## Task 9: Features Docs

**Files:**
- Create: `docs-site/docs/features/serial-monitor.md`
- Create: `docs-site/docs/features/recording.md`
- Create: `docs-site/docs/features/playback.md`
- Create: `docs-site/docs/features/sessions.md`

- [ ] **Step 1: Create serial-monitor.md**

  ```bash
  mkdir -p docs-site/docs/features
  ```

  Write `docs-site/docs/features/serial-monitor.md`:

  ````markdown
  ---
  sidebar_position: 1
  ---

  # Serial Monitor

  The serial monitor panel gives you a terminal-style interface for live serial communication directly inside VS Code.

  ## Connecting to a Port

  1. Open the **Serial Monitor Pro** panel from the activity bar.
  2. Your connected serial ports appear automatically in the **Serial Ports** list. Click **Refresh** (↻) if a port is not showing.
  3. Click a port to open the monitor.
  4. Configure connection settings in the toolbar (see below).
  5. Click **Connect**.

  ## Connection Settings

  | Setting | Description |
  |---|---|
  | Baud Rate | Data rate in bits per second. Common values: 9600, 115200. Custom rates can be added via the `serialMonitorPro.customBaudRates` setting. |
  | Data Bits | Number of data bits per frame (typically 8). |
  | Stop Bits | Number of stop bits (1 or 2). |
  | Parity | Error detection bit: None, Even, or Odd. |
  | Line Ending | Characters appended to outgoing messages: None, LF, CR, or CRLF. |

  ## Sending Data

  Type a message in the input field at the bottom of the monitor panel and press **Enter** to send. The configured line ending is appended automatically.

  ## Timestamps

  Enable timestamps on received data with the `serialMonitorPro.timestampEnabled` setting, or toggle it from the toolbar. Each incoming line is prefixed with the time it arrived.

  <!-- TODO: add screenshot of the monitor panel -->
  ````

- [ ] **Step 2: Create recording.md**

  Write `docs-site/docs/features/recording.md`:

  ````markdown
  ---
  sidebar_position: 2
  ---

  # Recording

  Serial Monitor Pro can record an entire session — every byte sent and received, timestamped to the millisecond — along with simultaneous microphone audio so you can narrate what you're observing.

  ## Starting a Recording

  1. Connect to a serial port (see [Serial Monitor](./serial-monitor)).
  2. Click the **Record** (⏺) button in the monitor toolbar.
  3. Recording begins immediately. Speak into your microphone to add voice commentary.

  ## Stopping a Recording

  1. Click the **Stop** (■) button.
  2. Enter a name for the session when prompted.
  3. The session is saved automatically.

  ## Audio Recording

  Audio is captured using [SoX](https://sourceforge.net/projects/sox/) (`rec` command) at 16-bit PCM, 44.1 kHz, saved as `audio.wav`. If SoX is not installed, a warning is displayed and recording continues without audio — the serial data is still captured.

  ## Session Storage

  Sessions are stored as directories under `.serial-sessions/` in your workspace (or a custom path configured via `serialMonitorPro.sessionStoragePath`):

  ```
  .serial-sessions/
  └── session-{UUID}/
      ├── manifest.json   ← serial events + markers + metadata
      └── audio.wav       ← optional audio (only if SoX was available)
  ```

  `manifest.json` contains `SerialEvent` objects with:
  - `timestamp` — millisecond offset from the session start
  - `direction` — `rx` (received) or `tx` (sent)
  - `data` — base64-encoded bytes (safe for binary data)

  <!-- TODO: add screenshot of recording in progress -->
  ````

- [ ] **Step 3: Create playback.md**

  Write `docs-site/docs/features/playback.md`:

  ````markdown
  ---
  sidebar_position: 3
  ---

  # Playback

  The playback panel lets you replay any recorded session with variable speed and synchronized audio.

  ## Opening a Session

  1. Find the session in the **Recorded Sessions** sidebar panel.
  2. Click it to open the playback panel.

  ## Transport Controls

  | Control | Action |
  |---|---|
  | **Play / Pause** | Start or pause playback |
  | **Seek bar** | Click or drag to jump to any point in the session |
  | **Speed selector** | Choose 0.25×, 0.5×, 1×, 2×, 5×, or 10× playback speed |

  Audio plays in sync with the data timeline at all speeds.

  ## Event View

  The event panel shows each RX/TX event as it replays, including:
  - Timestamp (millisecond offset from session start)
  - Direction (RX / TX)
  - Decoded data

  Filter the event view by direction (RX only, TX only, or both) using the toolbar toggles.

  ## Markers

  Click **Add Marker** at any point during playback to annotate the current position. Markers appear on the timeline as labeled ticks. They are saved to `manifest.json` and persist across sessions.

  <!-- TODO: add screenshot of the playback panel with timeline and markers -->
  ````

- [ ] **Step 4: Create sessions.md**

  Write `docs-site/docs/features/sessions.md`:

  ````markdown
  ---
  sidebar_position: 4
  ---

  # Session Management

  All recorded sessions are listed in the **Recorded Sessions** sidebar panel. Sessions are plain directories on disk — easy to archive, share, or inspect outside of VS Code.

  ## Viewing Sessions

  Open the **Serial Monitor Pro** panel from the activity bar. The **Recorded Sessions** list shows all sessions in your workspace's `.serial-sessions/` directory (or the configured custom path). Click **Refresh** (↻) to reload the list.

  ## Session Directory Format

  Each session is a self-contained directory:

  ```
  .serial-sessions/
  └── session-{UUID}/
      ├── manifest.json
      └── audio.wav        ← only present if audio was recorded
  ```

  `manifest.json` structure:

  ```json
  {
    "id": "session-uuid",
    "name": "My Session Name",
    "startTime": 1700000000000,
    "endTime": 1700000060000,
    "port": "/dev/tty.usbmodem1234",
    "baudRate": 115200,
    "events": [
      { "timestamp": 0, "direction": "rx", "data": "SGVsbG8=" },
      { "timestamp": 123, "direction": "tx", "data": "T0s=" }
    ],
    "markers": [
      { "timestamp": 5000, "label": "Interesting event" }
    ]
  }
  ```

  ## Custom Storage Path

  By default sessions are stored in `.serial-sessions/` in your workspace root. Set a custom absolute path with the `serialMonitorPro.sessionStoragePath` setting to use a shared location across projects.

  ## Sharing Sessions

  Zip or copy a `session-{UUID}/` directory and send it to a colleague. They can place it in their own `.serial-sessions/` folder and open it from the **Recorded Sessions** panel.
  ````

- [ ] **Step 5: Commit**

  ```bash
  git add docs-site/docs/features
  git commit -m "feat(docs): features docs — serial monitor, recording, playback, sessions"
  ```

---

## Task 10: Reference Docs

**Files:**
- Create: `docs-site/docs/reference/configuration.md`
- Create: `docs-site/docs/reference/faq.md`

- [ ] **Step 1: Create configuration.md**

  ```bash
  mkdir -p docs-site/docs/reference
  ```

  Write `docs-site/docs/reference/configuration.md`:

  ````markdown
  ---
  sidebar_position: 1
  ---

  # Configuration

  All Serial Monitor Pro settings use the `serialMonitorPro.*` prefix. Configure them in VS Code's Settings UI (`Ctrl+,` / `Cmd+,`) or directly in `settings.json`.

  ## Settings Reference

  ### `serialMonitorPro.defaultBaudRate`

  | | |
  |---|---|
  | Type | `number` |
  | Default | `115200` |

  Default baud rate used when opening a new serial port connection. Can be overridden per-connection in the monitor toolbar.

  ---

  ### `serialMonitorPro.customBaudRates`

  | | |
  |---|---|
  | Type | `number[]` |
  | Default | `[]` |

  Additional baud rates to show in the baud rate selector dropdown alongside the standard rates. Useful for non-standard hardware.

  **Example** (`settings.json`):
  ```json
  "serialMonitorPro.customBaudRates": [57600, 250000, 1000000]
  ```

  ---

  ### `serialMonitorPro.defaultLineEnding`

  | | |
  |---|---|
  | Type | `string` |
  | Default | `"\n"` |
  | Options | `""` (None), `"\n"` (LF), `"\r"` (CR), `"\r\n"` (CRLF) |

  Line ending characters appended to messages sent via the monitor input field. Most microcontroller serial interfaces expect LF (`\n`) or CRLF (`\r\n`).

  ---

  ### `serialMonitorPro.timestampEnabled`

  | | |
  |---|---|
  | Type | `boolean` |
  | Default | `false` |

  When enabled, each line of received data is prefixed with the time it arrived. Useful for correlating serial output with real-world events.

  ---

  ### `serialMonitorPro.sessionStoragePath`

  | | |
  |---|---|
  | Type | `string` |
  | Default | `""` |

  Absolute path to a directory where recorded sessions are stored. Leave empty to use `.serial-sessions/` in the workspace root. Useful when you want sessions stored in a shared or project-independent location.

  **Example** (`settings.json`):
  ```json
  "serialMonitorPro.sessionStoragePath": "/Users/you/serial-sessions"
  ```
  ````

- [ ] **Step 2: Create faq.md**

  Write `docs-site/docs/reference/faq.md`:

  ````markdown
  ---
  sidebar_position: 2
  ---

  # FAQ & Troubleshooting

  ## My serial port doesn't appear in the list

  1. Make sure the device is connected and the USB driver is installed.
  2. Click the **Refresh** (↻) button in the **Serial Ports** panel header.
  3. On Linux, ensure your user is in the `dialout` group: `sudo usermod -aG dialout $USER` (requires logout/login).
  4. On macOS, some CP210x and CH340 adapters need third-party drivers. Check the device manufacturer's site.

  ## Audio recording is not working

  Audio recording requires SoX to be installed. Verify it is available:

  ```bash
  rec --version
  ```

  If the command is not found, follow the [installation guide](../getting-started/installation#sox--audio-recording-optional).

  When SoX is unavailable, the extension displays a warning and continues without audio — serial data is still captured and saved normally.

  ## The extension crashes when connecting to a port

  Serial Monitor Pro bundles `serialport` and `@serialport/bindings-cpp` as external native modules. If you installed the extension from a `.vsix` file on a machine with a different platform/architecture from where it was built, the native bindings may not match.

  Install from the VS Code Marketplace to get the correct prebuilt binaries for your platform.

  ## Playback audio is out of sync

  Audio sync is based on the wall-clock time at recording start. If the system clock was adjusted during recording, sync may drift. This is uncommon but can happen on systems with NTP corrections.

  ## Where are my recorded sessions stored?

  By default in `.serial-sessions/` in your workspace root. You can change this with the `serialMonitorPro.sessionStoragePath` setting. See [Configuration](./configuration) for details.

  ## Can I share sessions with colleagues?

  Yes. Copy or zip the `session-{UUID}/` directory from `.serial-sessions/` and send it. Place it in the recipient's `.serial-sessions/` folder and it will appear in the **Recorded Sessions** panel after a refresh.
  ````

- [ ] **Step 3: Commit**

  ```bash
  git add docs-site/docs/reference
  git commit -m "feat(docs): reference docs — configuration settings and FAQ"
  ```

---

## Task 11: Project Docs

**Files:**
- Create: `docs-site/docs/project/changelog.md`
- Create: `docs-site/docs/project/contributing.md`

- [ ] **Step 1: Create changelog.md**

  ```bash
  mkdir -p docs-site/docs/project
  ```

  Write `docs-site/docs/project/changelog.md`:

  ````markdown
  ---
  sidebar_position: 1
  ---

  # Changelog

  All notable changes to Serial Monitor Pro are documented here.

  ## [0.1.0] — 2026-04-28

  ### Added

  - Serial port monitoring panel with configurable baud rate, data bits, stop bits, parity, and line ending
  - Timeline recording — captures every RX/TX event with millisecond-precision timestamps
  - Simultaneous microphone audio recording via SoX (optional)
  - Session playback panel with variable speed (0.25×–10×), seek bar, and synchronized audio
  - Annotation markers on the playback timeline
  - Session management sidebar — lists all recorded sessions, stored as plain directories
  - Custom baud rate support via `serialMonitorPro.customBaudRates` setting
  - Graceful degradation when SoX is unavailable — serial recording continues without audio
  ````

- [ ] **Step 2: Create contributing.md**

  Write `docs-site/docs/project/contributing.md`:

  ````markdown
  ---
  sidebar_position: 2
  ---

  # Contributing

  Contributions are welcome. This guide covers setting up the development environment, the build system, and how to submit changes.

  ## Prerequisites

  - [Node.js](https://nodejs.org) 20+
  - [VS Code](https://code.visualstudio.com) 1.85+
  - SoX (optional, for testing audio recording): see [Installation](../getting-started/installation#sox--audio-recording-optional)

  ## Setup

  ```bash
  git clone https://github.com/tenacioustechie/vscode-serial-monitor-pro.git
  cd vscode-serial-monitor-pro
  npm install
  ```

  ## Development Commands

  ```bash
  npm run build      # Production build (minified, no sourcemaps)
  npm run watch      # Development watch mode (sourcemaps enabled)
  npm run lint       # ESLint on TypeScript source
  npm test           # Jest tests
  ```

  **Debug in VS Code:** Press `F5` to launch the Extension Development Host. This auto-runs `npm: watch` as a pre-launch task and opens a new VS Code window with the extension loaded.

  ## Project Structure

  ```
  src/                    ← TypeScript extension host source
  ├── extension.ts        ← Entry point, command registration
  ├── serialPort/         ← Port listing and serial communication
  ├── monitor/            ← Live monitor webview panel
  ├── recording/          ← Audio + serial event recording stack
  ├── playback/           ← Session replay webview panel
  └── storage/            ← Session persistence and tree provider
  media/                  ← Webview JS/CSS (not bundled via esbuild)
  docs-site/              ← This documentation site (Docusaurus)
  ```

  ## Submitting Changes

  1. Fork the repository and create a branch from `main`.
  2. Make your changes. Add tests for any new logic.
  3. Run `npm run lint` and `npm test` — both must pass.
  4. Open a pull request against `main` with a clear description.

  ## Docs Changes

  The docs site source lives in `docs-site/`. To preview locally:

  ```bash
  cd docs-site
  npm install
  npm start
  ```

  This opens a local dev server at `http://localhost:3000` with hot reload.
  ````

- [ ] **Step 3: Commit**

  ```bash
  git add docs-site/docs/project
  git commit -m "feat(docs): project docs — changelog v0.1.0 and contributing guide"
  ```

---

## Task 12: GitHub Actions Deploy Workflow

**Files:**
- Create: `.github/workflows/deploy-docs.yml`

- [ ] **Step 1: Create the workflow directory**

  ```bash
  mkdir -p .github/workflows
  ```

- [ ] **Step 2: Create deploy-docs.yml**

  ```yaml
  name: Deploy Docs

  on:
    push:
      branches:
        - main
      paths:
        - 'docs-site/**'
        - '.github/workflows/deploy-docs.yml'

  permissions:
    contents: write

  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4

        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: npm
            cache-dependency-path: docs-site/package-lock.json

        - name: Install dependencies
          run: npm ci
          working-directory: docs-site

        - name: Build
          run: npm run build
          working-directory: docs-site

        - name: Deploy to GitHub Pages
          uses: peaceiris/actions-gh-pages@v3
          with:
            github_token: ${{ secrets.GITHUB_TOKEN }}
            publish_dir: docs-site/build
  ```

  The `CNAME` file is already in `docs-site/static/` and Docusaurus copies it into `docs-site/build/` automatically — no `cname:` option needed in the action.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/deploy-docs.yml
  git commit -m "feat(docs): GitHub Actions deploy workflow for Docusaurus"
  ```

---

## Task 13: Update .gitignore and README

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Add .superpowers to .gitignore**

  Append to `.gitignore`:

  ```
  .superpowers/
  docs-site/build/
  ```

  The existing `node_modules/` entry already covers `docs-site/node_modules/`. The `docs-site/.gitignore` (created by Docusaurus bootstrap) handles `.docusaurus/` and `build/` within that directory, but adding `docs-site/build/` to the root `.gitignore` prevents any accidental root-level commits of the build output.

- [ ] **Step 2: Add docs link to README.md**

  In `README.md`, add a docs link directly after the title/description intro (before the `## Features` section):

  ```markdown
  **[Documentation →](https://serialmonitorpro.millsit.com)**
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add .gitignore README.md
  git commit -m "chore: add .superpowers/ to .gitignore, link docs site in README"
  ```

---

## Task 14: Local Build Verification

**Files:** none (verification only)

- [ ] **Step 1: Install docs-site dependencies**

  ```bash
  cd docs-site && npm install
  ```

- [ ] **Step 2: Run a production build**

  ```bash
  npm run build
  ```

  Expected: exits 0. Output ends with:
  ```
  [SUCCESS] Generated static files in "build".
  [SUCCESS] Use `npm run serve` command to test your build locally.
  ```

  If broken links are reported, fix the offending links in the markdown files before proceeding.

- [ ] **Step 3: Spot-check in the local dev server**

  ```bash
  npm start
  ```

  Open `http://localhost:3000`. Verify:
  - Landing page shows logo, hero text, three feature cards
  - Nav links to Docs, Changelog, GitHub work
  - Sidebar shows all four groups (Getting Started, Features, Reference, Project)
  - Dark theme is applied by default

  Stop the dev server with `Ctrl+C`.

  ```bash
  cd ..
  ```

---

## Task 15: Push and Configure GitHub Pages

**Files:** none (GitHub UI + DNS configuration)

- [ ] **Step 1: Push to main**

  ```bash
  git push origin main
  ```

  GitHub Actions will pick up the push, run the `deploy-docs.yml` workflow, build Docusaurus, and push the output to the `gh-pages` branch. Monitor it at:
  `https://github.com/tenacioustechie/vscode-serial-monitor-pro/actions`

  The workflow takes about 2 minutes. Wait for it to show a green checkmark.

- [ ] **Step 2: Configure GitHub Pages source**

  Go to `https://github.com/tenacioustechie/vscode-serial-monitor-pro/settings/pages`:

  - **Source:** Deploy from a branch
  - **Branch:** `gh-pages` / `/ (root)`
  - Click **Save**

- [ ] **Step 3: Set custom domain in GitHub Pages settings**

  On the same Settings → Pages page:

  - **Custom domain:** `serialmonitorpro.millsit.com`
  - Click **Save**
  - Check **Enforce HTTPS** (this becomes available after the certificate is issued, usually within a few minutes)

- [ ] **Step 4: Add DNS CNAME record**

  In your DNS provider for `millsit.com`, add:

  | Type | Name | Value | TTL |
  |---|---|---|---|
  | CNAME | `serialmonitorpro` | `tenacioustechie.github.io` | 3600 |

  DNS propagation takes 5–30 minutes. GitHub's Pages settings page will show a green checkmark when the domain is verified.

- [ ] **Step 5: Verify live site**

  Open `https://serialmonitorpro.millsit.com`. Confirm:

  - TLS certificate is valid (padlock in browser)
  - Landing page renders with dark theme and logo
  - Navigation and all docs pages load without 404s
