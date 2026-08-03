import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
          <div className="max-w-md w-full">
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
              <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
              <p className="text-gray-300 mb-4">We encountered an unexpected error. Try refreshing the page.</p>
              <details className="text-sm text-gray-400 mb-6">
                <summary className="cursor-pointer font-mono hover:text-gray-200">Error details</summary>
                <pre className="mt-2 p-3 bg-gray-900 rounded overflow-auto max-h-48 text-red-400">
                  {this.state.error?.toString()}
                </pre>
              </details>
              <button
                onClick={() => window.location.href = '/'}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
