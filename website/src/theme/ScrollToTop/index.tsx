import React, {useState, useEffect, useCallback} from 'react';
import styles from './styles.module.css';

export default function ScrollToTop(): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollUp = useCallback(() => {
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  if (!visible) return null;

  return (
    <button
      className={styles.button}
      onClick={scrollUp}
      aria-label="Scroll to top"
      title="Scroll to top">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
