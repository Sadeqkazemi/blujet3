import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Sentry } from '../lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Global error boundary (CLAUDE.md Observability rules): reports render
 * errors to Sentry (no-op when VITE_SENTRY_DSN is unset) and shows a
 * Persian fallback instead of a blank white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            gap: '1rem',
            fontFamily: "'Vazirmatn Variable', Vazirmatn, sans-serif",
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1>مشکلی پیش آمد</h1>
          <p>لطفاً صفحه را دوباره بارگذاری کنید. تیم فنی از این خطا مطلع شد.</p>
          <button onClick={() => window.location.reload()}>بارگذاری مجدد</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
