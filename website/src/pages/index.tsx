import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

type Pillar = {
  title: string;
  lede: string;
  practice: string[];
};

const pillars: Pillar[] = [
  {
    title: 'The Boring Work, Done For You',
    lede:
      'For each SPFx solution, PANTOUM runs the mechanical upgrade work as deterministic steps: dependency bumps, config rewrites, script migrations, and patch application. Same inputs produce the same patch output every run, so you can tweak a setting, re-run, and compare without losing progress. If something goes sideways, the next run starts from the same known state, not a half-upgraded mess.',
    practice: [
      'Deterministic patches handle the mechanical SPFx upgrade work for you',
      'Same inputs produce identical patch output every run — reruns are safe',
      'Outputs land in pantoum_run_{runId}/ directories you can diff against each other',
      'Every run writes a history entry in pantoum_history/ so you can replay what happened',
    ],
  },
  {
    title: 'AI Inside Guardrails',
    lede:
      'For the messy parts — PnP migrations, MGT deprecation, build errors that do not fit a deterministic patch — PANTOUM ships migration prompts and a build-fix loop that hand the work to Claude. Each AI fix is verified by re-running the build or grepping for the patterns the migration was supposed to remove. After the configured retries (default 3, configurable 1–10), if the fix has not converged, PANTOUM stops and reports what it tried — so you can analyze the result and finish the upgrade by hand.',
    practice: [
      'Migration templates for PnP JS (v1/v2/v3 → v4), Microsoft Graph Toolkit, and the gulp → Heft build system',
      'Each AI fix is verified by re-running the build or grepping for the patterns it was supposed to remove',
      'Bounded retries (default 3, configurable 1–10); after that, PANTOUM stops and hands the steering wheel back to you',
      'Every AI action lands as a tracked patch in the final report so you can review or revert',
    ],
  },
  {
    title: 'Hands Off, Eyes On',
    lede:
      'PANTOUM does the work. You do the review. Every change — deterministic patches and AI fixes alike — lands as a tracked entry in a Markdown or JSON report, so you can read the whole upgrade in one sitting, attach it to a PR, or drop it into a change-control review.',
    practice: [
      'Markdown report for humans (attach to a PR), JSON report for tools (feed into CI)',
      'Per-solution reports show exactly what changed in each solution',
      'Nothing is ever "just done" — everything has a patch ID, a description, and a before/after',
    ],
  },
];

const who: string[] = [
  'You run a SharePoint tenant with more SPFx solutions than you can upgrade by hand.',
  'You have been burned by an M365 CLI upgrade that half-worked and now your repo is in a weird state.',
  'You want to automate SPFx upgrades — but you also want to read every diff before you ship it.',
];

type TrustItem = { q: string; a: string };

const trust: TrustItem[] = [
  {
    q: 'Does the AI rewrite my code without asking?',
    a: 'No. Every AI action lands as a tracked patch in the final report — you read the diff before you commit.',
  },
  {
    q: 'What if Claude makes a bad fix?',
    a: 'Re-run, tweak the retry count, try again. No penalty for iterating.',
  },
  {
    q: 'What does PANTOUM handle out of the box?',
    a: 'PnP JS (v1/v2/v3 → v4), Microsoft Graph Toolkit, the gulp → Heft build system, PnP companion packages, and generic build errors. AI prompts live in src/templates/ — read, customize, extend.',
  },
  {
    q: 'Can I customize what PANTOUM does?',
    a: 'Yes — every patch, condition, and prompt lives in plain pantoum.patches.yml and Markdown templates. Read, override, or add your own.',
  },
  {
    q: 'What happens when Microsoft ships a new SPFx version?',
    a: 'PANTOUM does not hardcode SPFx versions — it passes your target straight to the M365 CLI and runs the result through its pipeline. The webapp\'s version picker is fetched from npm at runtime.',
  },
];

function HomepageHeader(): JSX.Element {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <img
          src="/pantoum/img/logo.png"
          alt="PANTOUM Logo"
          style={{ width: 100, height: 100, marginBottom: 4 }}
        />
        <p className={styles.brandKicker}>PANTOUM</p>
        <Heading as="h1" className="hero__title">
          Skip the SPFx upgrade afternoon.
        </Heading>
        <p className="hero__subtitle">
          PANTOUM handles the patches, the package migrations, and the build fixes. You read the diff and ship.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/quick-start"
          >
            Get Started
          </Link>
          <Link
            className="button button--outline button--lg"
            to="/walkthrough"
          >
            See How It Works
          </Link>
        </div>
      </div>
    </header>
  );
}

function ProofStrip(): JSX.Element {
  return (
    <section className={styles.proofStrip} aria-label="Proof points">
      <div className="container">
        <div className={styles.proofItems}>
          <span className={styles.proofItem}>Used on the PuntoBello SPFx suite</span>
          <span className={styles.proofDivider} aria-hidden="true">·</span>
          <span className={styles.proofItem}>MIT open source</span>
          <span className={styles.proofDivider} aria-hidden="true">·</span>
          <span className={styles.proofItem}>Every patch and prompt is editable</span>
        </div>
      </div>
    </section>
  );
}

function Pillars(): JSX.Element {
  return (
    <section className={clsx(styles.pillars, 'padding-vert--xl')} aria-label="Core strengths">
      <div className="container">
        {pillars.map((p, i) => (
          <div key={i} className={clsx('row', styles.pillarRow)}>
            <div className="col col--4">
              <Heading as="h2" className={styles.pillarTitle}>
                {p.title}
              </Heading>
            </div>
            <div className="col col--8">
              <p className={styles.pillarLede}>{p.lede}</p>
              <ul className={styles.pillarPractice}>
                {p.practice.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhoThisIsFor(): JSX.Element {
  return (
    <section className={clsx(styles.whoSection, 'padding-vert--lg')} aria-label="Who this is for">
      <div className="container">
        <Heading as="h2" className="text--center">Who this is for</Heading>
        <div className={styles.whoGrid}>
          {who.map((text, i) => (
            <div key={i} className={styles.whoItem}>
              {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustBlock(): JSX.Element {
  return (
    <section className={clsx(styles.trust, 'padding-vert--xl')} aria-label="What about">
      <div className="container">
        <Heading as="h2" className="text--center">But what about…</Heading>
        <div className={styles.trustGrid}>
          {trust.map((t, i) => (
            <div key={i} className={styles.trustItem}>
              <Heading as="h3" className={styles.trustQ}>{t.q}</Heading>
              <p className={styles.trustA}>{t.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickStart(): JSX.Element {
  return (
    <section className="container padding-vert--lg">
      <div className="row">
        <div className="col col--8 col--offset-2">
          <Heading as="h2" className="text--center">Quick Start</Heading>
          <pre>
            <code>
{`# Clone and build
git clone https://github.com/pantoum-spfx/pantoum.git
cd pantoum && npm install && npm run build

# Verify the environment
npm run doctor

# Launch PANTOUM Studio
npm run webapp`}
            </code>
          </pre>
          <p className="text--center">
            Start with the default settings, run one upgrade, and review the generated report before you reach for any advanced options.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <ProofStrip />
        <Pillars />
        <WhoThisIsFor />
        <TrustBlock />
        <QuickStart />
      </main>
    </Layout>
  );
}
