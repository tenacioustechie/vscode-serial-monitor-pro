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
            href="https://marketplace.visualstudio.com/items?itemName=millsit.vscode-serial-monitor-pro"
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
