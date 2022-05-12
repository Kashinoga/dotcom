import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';
import Link from '@docusaurus/Link';


type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
  link: string;
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
    link: '/projects/tabletop-rpgs/intro'
  },
  {
    title: 'The Maker Universe',
    Svg: require('@site/static/img/undraw_my_universe_803e.svg').default,
    description: (
      <>
        A personal worldbuilding project for use in tabletop roleplaying games, short stories, and more.
      </>
    ),
    link: '/projects/the-maker-universe/intro'
  },
  {
    title: 'Project Starbloom',
    Svg: require('@site/static/img/undraw_flowers_vx06.svg').default,
    description: (
      <>
        An in-house tabletop roleplaying game project.
      </>
    ),
    link: '/projects/project-starbloom/intro'
  },
  {
    title: 'CTA',
    Svg: require('@site/static/img/undraw_people_re_8spw.svg').default,
    description: (
      <>
        A local effort to promote charitable acts.
      </>
    ),
    link: '/projects/project-starbloom/intro'
  },
  {
    title: 'CTV',
    Svg: require('@site/static/img/undraw_voting_nvu7.svg').default,
    description: (
      <>
        A local effort to promote political acts.
      </>
    ),
    link: '/projects/project-starbloom/intro'
  },
];

function Feature({ title, Svg, description, link }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        {/* <h3>{title}</h3> */}
        <div className={clsx(styles.featureButton)}>
          <Link
            className="button button--secondary button--lg featureButton"
            to={link}>
            {title}
          </Link>
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
