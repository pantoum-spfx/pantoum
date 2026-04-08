import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';

/**
 * /walkthrough — embeds the standalone interactive HTML deck at
 * /architecture-flow.html inside the Docusaurus layout, so the PANTOUM
 * navbar (and footer) stays visible while the walkthrough is open. The
 * iframe sizes itself to the viewport minus the navbar, so the deck still
 * gets a generous canvas without taking over the whole window.
 */
export default function Walkthrough(): JSX.Element {
  const target = useBaseUrl('/architecture-flow.html');

  return (
    <Layout title="Walkthrough" description="Interactive PANTOUM architecture walkthrough">
      <main style={{ padding: 0, margin: 0 }}>
        <iframe
          src={target}
          title="PANTOUM Architecture Walkthrough"
          style={{
            width: '100%',
            height: 'calc(100vh - var(--ifm-navbar-height, 60px))',
            border: 'none',
            display: 'block',
          }}
        />
      </main>
    </Layout>
  );
}
