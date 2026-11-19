import React from 'react';
import { Crosshair, LogOut, Plus } from 'lucide-react';
import { AppView } from '../types/airsoft';

interface TopNavProps {
  activeView: AppView;
  partsToOrderCount: number;
  onSelectView: (view: AppView) => void;
  onNewTicket: () => void;
  userEmail?: string | null;
  onLogout?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  partsToOrderCount,
  onSelectView,
  onNewTicket,
  userEmail,
  onLogout,
}) => {
  const navItems: {
    id: AppView;
    label: string;
    mobileLabel: string;
  }[] = [
    { id: 'home', label: 'Pulpit', mobileLabel: 'Pulpit' },
    { id: 'workbench', label: 'Warsztat', mobileLabel: 'Warsztat' },
    {
      id: 'procurement',
      label:
        partsToOrderCount > 0
          ? `Zakup części (${partsToOrderCount})`
          : 'Zakup części',
      mobileLabel:
        partsToOrderCount > 0 ? `Zakupy (${partsToOrderCount})` : 'Zakupy',
    },
    { id: 'history', label: 'Zlecenia', mobileLabel: 'Zlecenia' },
    { id: 'database', label: 'Baza i stawki', mobileLabel: 'Baza' },
  ];

  return (
    <header className="no-print sticky top-0 z-30 border-b border-stone-800 bg-[#181b18] text-stone-100">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-8 px-4 sm:h-16 sm:px-6">
        <button
          type="button"
          onClick={() => onSelectView('home')}
          className="inline-flex items-center gap-2 font-display text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none"
        >
          <Crosshair className="h-4 w-4 text-[#e88a00]" />
          <span>AIRSOFT Serwis</span>
        </button>

        <nav
          className="hidden md:flex items-center gap-7 overflow-x-auto no-scrollbar"
          aria-label="Nawigacja główna"
        >
          {navItems.map((item) => {
            const isActive =
              activeView === item.id ||
              (activeView === 'quote' && item.id === 'workbench');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none ${
                  isActive
                    ? 'text-white'
                    : 'text-stone-400 hover:text-stone-100'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#e88a00]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {userEmail && onLogout && (
            <div className="hidden items-center gap-2 border-r border-stone-700 pr-3 xl:flex">
              <span
                className="max-w-[170px] truncate text-xs text-stone-400"
                title={userEmail}
              >
                {userEmail}
              </span>
              <button
                type="button"
                onClick={onLogout}
                title="Wyloguj się z konta"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-stone-400 hover:bg-stone-800 hover:text-white whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                Wyloguj
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onNewTicket}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#e88a00] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#cf7b00] whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nowe zlecenie</span>
          </button>

          {userEmail && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title={`Wyloguj (${userEmail})`}
              aria-label="Wyloguj"
              className="inline-flex items-center justify-center rounded-lg border border-stone-700 p-2 text-stone-300 hover:bg-stone-800 hover:text-white xl:hidden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <nav
        className="flex md:hidden items-center gap-1 overflow-x-auto no-scrollbar border-t border-stone-800 bg-[#202420] px-2.5 py-1.5"
        aria-label="Nawigacja mobilna"
      >
        {navItems.map((item) => {
          const isActive =
            activeView === item.id ||
            (activeView === 'quote' && item.id === 'workbench');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-stone-800 text-white'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {item.mobileLabel}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
