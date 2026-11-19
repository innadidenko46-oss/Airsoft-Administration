import React from 'react';
import { Crosshair } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Wystąpił nieoczekiwany błąd aplikacji.',
    };
  }

  render() {
    if (this.state.hasError) {
      const isQuota = this.state.errorMessage.includes('Quota exceeded');
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] p-6 text-slate-900">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
              <Crosshair className="h-4 w-4 text-[#e88a00]" />
              <span>AIRSOFT Serwis</span>
            </div>
            <h1 className="mt-4 font-display text-lg font-bold text-slate-900">
              {isQuota
                ? 'Przekroczono dzienny limit zapytań bazy'
                : 'Wystąpił problem z połączeniem z bazą'}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {isQuota
                ? 'Darmowy limit odczytów bazy Firestore został tymczasowo wyczerpany i odnowi się kolejnego dnia.'
                : 'Spróbuj odświeżyć stronę lub zalogować się ponownie, aby przywrócić sesję.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-lg bg-[#e88a00] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#cf7b00]"
            >
              Odśwież aplikację
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
