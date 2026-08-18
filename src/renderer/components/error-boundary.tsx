/* eslint-disable no-console */
import React, { Component, ErrorInfo, PropsWithChildren } from 'react';

interface State {
  hasError: boolean;
  errorCount: number;
}

const MAX_BURST_ERRORS = 5;
const BURST_WINDOW_MS = 30_000;
const RETRY_DELAY_MS = 100;

// Without a boundary, React unmounts the entire root on any uncaught error,
// which leaves the transparent widget window blank and seemingly "gone".
// getDerivedStateFromError MUST switch the next render away from the children,
// otherwise they throw again and the root unmounts anyway.
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  private lastErrorAt = 0;

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: PropsWithChildren) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Recovered from uncaught error:', error, errorInfo.componentStack);

    // a burst of crashes should give up, but isolated ones long apart should not accumulate
    const { errorCount: previousCount } = this.state;
    const isBurst = Date.now() - this.lastErrorAt < BURST_WINDOW_MS;
    this.lastErrorAt = Date.now();
    const errorCount = isBurst ? previousCount + 1 : 1;

    if (errorCount <= MAX_BURST_ERRORS) {
      // retry shortly with a fresh key so the children remount cleanly
      this.retryTimer = setTimeout(() => this.setState({ hasError: false, errorCount }), RETRY_DELAY_MS);
    } else {
      this.setState({ errorCount });
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  render(): React.ReactNode {
    const { errorCount, hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      // a persistent visible fallback: a transparent window with no content is
      // indistinguishable from a vanished app
      if (errorCount > MAX_BURST_ERRORS) {
        return (
          <div style={{ background: '#333', color: 'white', height: '100%', padding: '1rem', fontSize: '0.75rem' }}>
            lofi crashed repeatedly, quit and restart it from the menu bar icon.
          </div>
        );
      }
      // momentary blank frame while the retry timer runs
      return null;
    }

    return <React.Fragment key={errorCount}>{children}</React.Fragment>;
  }
}
