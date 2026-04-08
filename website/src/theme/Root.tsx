import React, {type ReactNode} from 'react';
import AccessibilityProvider from './AccessibilityProvider';
import AccessibilityToolbar from './AccessibilityToolbar';
import ScrollToTop from './ScrollToTop';

export default function Root({children}: {children: ReactNode}): JSX.Element {
  return (
    <AccessibilityProvider>
      <AccessibilityToolbar />
      {children}
      <ScrollToTop />
    </AccessibilityProvider>
  );
}
