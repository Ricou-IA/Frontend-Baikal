/**
 * ErrorBoundary - Capture les erreurs React
 * ============================================================================
 * Composant qui capture les erreurs JavaScript dans l'arbre des composants
 * enfants et affiche une UI de fallback.
 * 
 * @example
 * <ErrorBoundary fallback={<ErrorPage />}>
 *   <App />
 * </ErrorBoundary>
 * ============================================================================
 */

import React, { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logError } from '../utils/errors';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    logError(error, {
      componentStack: errorInfo?.componentStack,
      boundary: this.props.name || 'ErrorBoundary',
    });
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    this.props.onReset?.();
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, FallbackComponent } = this.props;

    if (hasError) {
      if (FallbackComponent) {
        return (
          <FallbackComponent
            error={error}
            errorInfo={errorInfo}
            resetError={this.handleReset}
          />
        );
      }

      if (fallback) {
        return fallback;
      }

      return (
        <DefaultErrorFallback
          error={error}
          onReset={this.handleReset}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return children;
  }
}

function DefaultErrorFallback({ error, onReset, onReload, onGoHome }) {
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        <h1 className="text-xl font-bold text-slate-800 mb-2">
          Oups ! Une erreur est survenue
        </h1>

        <p className="text-slate-600 mb-6">
          Nous sommes désolés, quelque chose s'est mal passé.
          Veuillez réessayer ou revenir à l'accueil.
        </p>

        {isDev && error && (
          <details className="mb-6 text-left">
            <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
              Détails de l'erreur (dev)
            </summary>
            <pre className="mt-2 p-3 bg-slate-100 rounded-lg text-xs text-red-600 overflow-auto max-h-32">
              {error.toString()}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onReset}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
          <button
            onClick={onGoHome}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            <Home className="w-4 h-4" />
            Accueil
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Si le problème persiste, contactez le support.
        </p>
      </div>
    </div>
  );
}

export function SectionErrorFallback({ error, resetError }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-lg border border-red-200">
      <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
      <p className="text-sm text-red-700 mb-4">
        Une erreur est survenue dans cette section.
      </p>
      {resetError && (
        <button
          onClick={resetError}
          className="text-sm text-red-600 hover:text-red-800 underline"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

export function withErrorBoundary(Component, errorBoundaryProps = {}) {
  const WrappedComponent = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
}

export { ErrorBoundary, DefaultErrorFallback };
export default ErrorBoundary;
