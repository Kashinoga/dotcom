import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './index.module.css';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro">
            View All Projects
          </Link>
        </div>
      </div>
    </header>
  );
}

function HomepageCTA() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner, styles.heroCTA)}>
      <div className="container">
        <h1>Call to Action</h1>
        <p>Consider making a money donation (<Link to="/tldr/nonprofit/why-food-bank-money-donation">Why?</Link>) to your local food bank.</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="https://www.google.com/search?q=local+food+bank">
            Find a Local Food Bank
          </Link>
        </div>
      </div>
    </header>
  );
}

function HomepageCTV() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1>Call to Vote</h1>
        <p>Prepare for local and national US elections.</p>
        <div className={styles.buttons}>
          <Link
            className="button disabled button--secondary button--lg"
            to="/">
            Coming Soon
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HomepageCTA />
        <HomepageCTV />
      </main>
    </Layout>
  );
}
