import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';
import Link from '@docusaurus/Link';


type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
  link: string;
  disabled: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Tabletop RPGs',
    Svg: require('@site/static/img/undraw_explore_re_8l4v.svg').default,
    description: (
      <>
        From Dungeons & Dragons to Starfinder: join us on a competent, comical, and completely made-up adventure!
      </>
    ),
    link: '/projects/tabletop-rpgs/intro',
    disabled: ''
  },
  {
    title: 'The Maker Universe',
    Svg: require('@site/static/img/undraw_my_universe_803e.svg').default,
    description: (
      <>
        <p className={styles.inDevelopmentText}>In Development</p>
        A personal worldbuilding project for use in tabletop roleplaying games, short stories, and more.
      </>
    ),
    link: '/projects/the-maker-universe/intro',
    disabled: 'y'
  },
  {
    title: 'Project Starbloom',
    Svg: require('@site/static/img/undraw_flowers_vx06.svg').default,
    description: (
      <>
        <p className={styles.inDevelopmentText}>In Development</p>
        An in-house tabletop roleplaying game.
      </>
    ),
    link: '/projects/project-starbloom/intro',
    disabled: 'y'
  },
  {
    title: 'CTA',
    Svg: require('@site/static/img/undraw_people_re_8spw.svg').default,
    description: (
      <>
        <p className={styles.inDevelopmentText}>In Development</p>
        A local effort to promote charitable acts.
      </>
    ),
    link: '/projects/project-starbloom/intro',
    disabled: 'y'
  },
  {
    title: 'CTV',
    Svg: require('@site/static/img/undraw_voting_nvu7.svg').default,
    description: (
      <>
        <p className={styles.inDevelopmentText}>In Development</p>
        A local effort to promote political acts.
      </>
    ),
    link: '/projects/project-starbloom/intro',
    disabled: 'y'
  },
];

function Feature({ title, Svg, description, link, disabled }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        {/* <h3>{title}</h3> */}
        <div className={clsx(styles.featureButton)}>
          {disabled ?
            <Link
              className="button disabled button--secondary button--lg featureButton"
              to={link}>
              {title}
            </Link>
            :
            <Link
              className="button button--secondary button--lg featureButton"
              to={link}>
              {title}
            </Link>
          }
        </div>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={clsx(styles.row)}>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
