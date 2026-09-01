import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeThrownValue, diagnostics } from '../diagnostics/DiagnosticsService';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    diagnostics.record({
      level: 'error',
      category: 'app',
      event: 'render_error',
      context: { ...describeThrownValue(error), componentStack: info.componentStack },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <main role="alert"><h1>Kairos hit a problem</h1><p>Reload the app to try again.</p></main>;
    }
    return this.props.children;
  }
}
