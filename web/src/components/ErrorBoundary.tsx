/**
 * Catches render errors so one broken page doesn't take the whole app down.
 *
 * Without this, any uncaught error in any component unmounts the entire React
 * tree and leaves a blank white page — no message, no navigation, no way back.
 * For a user test that's the worst possible failure: the tester sees nothing,
 * can't continue, and can't tell you what they were doing.
 *
 * Two levels are mounted in App.tsx: one around the routed page (so the nav
 * survives and they can click elsewhere) and one around the whole shell as a
 * last resort.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in the message so testers can say which part failed. */
  label?: string;
  /** Remounts children when this changes — used to recover on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // Keep the detail in the console for whoever is sitting with the tester.
    console.error(`[STRATA] Render error in ${this.props.label ?? 'app'}:`, error, info);
  }

  componentDidUpdate(prev: Props) {
    // Navigating away from a broken page should clear the error, otherwise the
    // boundary keeps showing the failure after the user has moved on.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null });
    }
  }

  private reset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex items-center justify-center h-full p-6" role="alert">
        <div className="glass rounded-2xl border border-red-500/25 p-6 max-w-lg w-full">
          <div className="flex items-center gap-2.5 mb-3">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
            <h2 className="text-base font-semibold text-white">
              Something broke{this.props.label ? ` on ${this.props.label}` : ''}
            </h2>
          </div>

          <p className="text-sm text-slate-400 mb-4">
            This part of the app hit an error and stopped rendering. The rest of
            STRATA still works — use the navigation to go elsewhere, or try again.
          </p>

          <div className="flex gap-2 mb-4">
            <button onClick={this.reset} className="btn-primary text-sm">
              <RotateCcw size={13} /> Try again
            </button>
            <button onClick={() => window.location.assign('/')} className="btn-ghost text-sm">
              Back to Search
            </button>
          </div>

          {/* Collapsed by default: useful to a developer, ignorable by a tester. */}
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-400 select-none">
              Technical details
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-black/30 border border-white/5 text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap break-words max-h-56">
              {error.message}
              {info?.componentStack ? `\n${info.componentStack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
