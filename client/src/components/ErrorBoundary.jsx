import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('React render failed', { error, info });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8 sm:px-6">
        <div className="w-full max-w-lg rounded-3xl bg-white p-5 text-center shadow-xl sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-500">
            !
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            The page could not render safely. Reload the page and try again. If it repeats,
            share the latest action you performed so we can trace it quickly.
          </p>
          {!import.meta.env.PROD && this.state.error?.message && (
            <pre className="mt-5 max-h-36 overflow-auto rounded-2xl bg-gray-950 p-4 text-left text-xs text-gray-100">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
