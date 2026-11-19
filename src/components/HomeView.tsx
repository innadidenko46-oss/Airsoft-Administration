import React, { useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Calculator,
  CalendarClock,
  FileText,
  Upload,
} from 'lucide-react';
import {
  QuoteLineItem,
  RepairStage,
  SavedRepairOrder,
} from '../types/airsoft';
import {
  PAYMENT_STATUS_LABELS,
  REPAIR_STAGE_LABELS,
  REPAIR_STAGE_ORDER,
  SERVICE_SCOPE_LABELS,
  formatPln,
} from '../utils/airsoftCalculations';
import { InfoTooltip } from './InfoTooltip';

interface HomeViewProps {
  repairs: SavedRepairOrder[];
  quoteItems: QuoteLineItem[];
  onOpenWorkbench: () => void;
  onOpenProcurement: () => void;
  onOpenQuote: () => void;
  onOpenHistory: (stageFilter?: 'all' | RepairStage) => void;
  onOpenImport: () => void;
  onLoadRepair: (entry: SavedRepairOrder) => void;
  onChangeStage: (id: string, stage: RepairStage) => void;
}

const STAGE_STYLE: Record<RepairStage, string> = {
  przyjecie: 'border-slate-200 bg-slate-50 text-slate-700',
  diagnostyka: 'border-sky-200 bg-sky-50 text-sky-800',
  oczekuje_akceptacji: 'border-amber-200 bg-amber-50 text-amber-800',
  zakup_czesci: 'border-red-200 bg-red-50 text-red-700',
  w_realizacji: 'border-amber-300 bg-amber-50 text-amber-900',
  testy_chrono: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  gotowe: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

function formatPolishCount(
  n: number,
  one: string,
  few: string,
  many: string
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} ${few}`;
  }
  return `${n} ${many}`;
}

function getDeadlineInfo(
  isoDate: string | undefined,
  stage: RepairStage
): { label: string; urgent: boolean } | null {
  if (!isoDate) return null;
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const formatted = parsed.toLocaleDateString('pl-PL');
  if (stage === 'gotowe') {
    return { label: `Na: ${formatted}`, urgent: false };
  }
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((parsed.getTime() - todayMid.getTime()) / (24 * 60 * 60 * 1000));
  return { label: `Na: ${formatted}`, urgent: diffDays <= 2 };
}

export const HomeView: React.FC<HomeViewProps> = ({
  repairs,
  quoteItems,
  onOpenWorkbench,
  onOpenProcurement,
  onOpenQuote,
  onOpenHistory,
  onOpenImport,
  onLoadRepair,
  onChangeStage,
}) => {
  const stats = useMemo(() => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    let revenue30d = 0;
    let profit30d = 0;
    let net30d = 0;
    let orders30d = 0;
    let activeCount = 0;

    let partsToOrderCount = 0;
    let partsToOrderBudget = 0;
    let partsOrderedCount = 0;

    const byStage: Record<RepairStage, number> = {
      przyjecie: 0,
      diagnostyka: 0,
      oczekuje_akceptacji: 0,
      zakup_czesci: 0,
      w_realizacji: 0,
      testy_chrono: 0,
      gotowe: 0,
    };

    const pendingPartsPreview: Array<{
      repairId: string;
      replicaLabel: string;
      partName: string;
      supplier: string;
      cost: number;
      status: 'do_zamowienia' | 'zamowione';
    }> = [];

    for (const item of repairs) {
      const stage = item.stage || 'przyjecie';
      byStage[stage] += 1;

      const createdTs = Date.parse(item.createdAt);
      if (!Number.isNaN(createdTs) && now - createdTs <= thirtyDaysMs) {
        revenue30d += item.result?.grossPrice || 0;
        profit30d += item.result?.workshopProfit || 0;
        net30d += item.result?.netPrice || 0;
        orders30d += 1;
      }

      if (stage !== 'gotowe') {
        activeCount += 1;
        for (const p of item.ticket?.parts || []) {
          if (p.suppliedByClient) continue;
          const qty = Math.max(1, p.quantity || 1);
          if (p.purchaseStatus === 'do_zamowienia') {
            partsToOrderCount += 1;
            partsToOrderBudget += (p.purchaseUnitCost || 0) * qty;
            if (pendingPartsPreview.length < 5) {
              pendingPartsPreview.push({
                repairId: item.id,
                replicaLabel: item.replicaLabel,
                partName: `${p.name}${qty > 1 ? ` ×${qty}` : ''}`,
                supplier: p.supplier,
                cost: (p.purchaseUnitCost || 0) * qty,
                status: 'do_zamowienia',
              });
            }
          } else if (p.purchaseStatus === 'zamowione') {
            partsOrderedCount += 1;
            if (pendingPartsPreview.length < 5) {
              pendingPartsPreview.push({
                repairId: item.id,
                replicaLabel: item.replicaLabel,
                partName: `${p.name}${qty > 1 ? ` ×${qty}` : ''}`,
                supplier: p.supplier,
                cost: (p.purchaseUnitCost || 0) * qty,
                status: 'zamowione',
              });
            }
          }
        }
      }
    }

    const avgMargin30d = net30d > 0 ? Math.round((profit30d / net30d) * 100) : 0;

    return {
      revenue30d,
      profit30d,
      orders30d,
      avgMargin30d,
      activeCount,
      partsToOrderCount,
      partsToOrderBudget,
      partsOrderedCount,
      byStage,
      pendingPartsPreview,
    };
  }, [repairs]);

  const recentRepairs = useMemo(() => repairs.slice(0, 6), [repairs]);

  const urgentDeadlines = useMemo(() => {
    return repairs
      .filter((r) => r.stage !== 'gotowe' && Boolean(r.ticket?.targetReadyDate))
      .sort((a, b) =>
        (a.ticket.targetReadyDate || '').localeCompare(
          b.ticket.targetReadyDate || ''
        )
      )
      .slice(0, 5);
  }, [repairs]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 4-Column KPI Summary */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-600">
            <span>Przychód brutto (30 dni)</span>
            <InfoTooltip text="Suma wartości brutto wszystkich zapisanych napraw i kastomizacji z ostatnich 30 dni." />
          </div>
          <p className="mt-1.5 sm:mt-2 font-display text-lg sm:text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatPln(stats.revenue30d)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            {formatPolishCount(stats.orders30d, 'zlecenie', 'zlecenia', 'zleceń')}
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-600">
            <span>Zysk serwisu (30 dni)</span>
            <InfoTooltip text="Robocizna + marża na częściach + materiały po odliczeniu kosztów zakupu części." />
          </div>
          <p className="mt-1.5 sm:mt-2 font-display text-lg sm:text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
            {formatPln(stats.profit30d)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            Marża {stats.avgMargin30d}%
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-600">
            <span>Repliki w serwisie</span>
            <InfoTooltip text="Aktywne zlecenia na wszystkich etapach przed odbiorem przez klienta." />
          </div>
          <p className="mt-1.5 sm:mt-2 font-display text-lg sm:text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {stats.activeCount}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            {stats.byStage.diagnostyka > 0
              ? `${stats.byStage.diagnostyka} w diagnostyce`
              : `${stats.byStage.w_realizacji} na stole`}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenProcurement}
          className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 text-left transition-colors hover:border-[#e88a00]"
        >
          <div className="flex items-center justify-between gap-1.5 text-[11px] sm:text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span>Części do zakupu</span>
              <InfoTooltip
                align="right"
                text="Części ze statusem 'Do zamówienia' w aktywnych naprawach. Kliknij kartę, aby otworzyć listę zakupów."
              />
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[#b86d00]" />
          </div>
          <p
            className={`mt-1.5 sm:mt-2 font-display text-lg sm:text-2xl font-bold tracking-tight tabular-nums ${
              stats.partsToOrderCount > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {stats.partsToOrderCount} poz.
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            {stats.partsToOrderBudget > 0
              ? `Budżet: ${formatPln(stats.partsToOrderBudget)}`
              : `${stats.partsOrderedCount} w drodze`}
          </p>
        </button>
      </section>

      {/* Process Pipeline Strip */}
      <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-slate-900">
              Proces realizacji zleceń
            </h2>
            <InfoTooltip text="Kliknij dowolny etap procesu, aby przefiltrować listę napraw na tym etapie." />
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {formatPolishCount(repairs.length, 'zlecenie', 'zlecenia', 'zleceń')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {REPAIR_STAGE_ORDER.map((stage) => {
            const count = stats.byStage[stage];
            return (
              <button
                key={stage}
                type="button"
                onClick={() => onOpenHistory(stage)}
                className="flex flex-col justify-between rounded-lg border border-stone-200 bg-stone-50/60 p-3 text-left transition-colors hover:border-[#e88a00] hover:bg-amber-50/40"
              >
                <span className="text-[11px] font-medium text-slate-600">
                  {REPAIR_STAGE_LABELS[stage]}
                </span>
                <span className="mt-1.5 font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main 2-Column Overview */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-12 xl:items-start">
        {/* Left: Recent Repairs */}
        <section className="rounded-xl border border-stone-200 bg-white xl:col-span-8">
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 truncate">
                Ostatnie naprawy i kastomizacje
              </h2>
              <InfoTooltip text="Kliknij „Otwórz”, aby przejść do diagnostyki usterki, listy części i wyceny danej repliki." />
            </div>
            {repairs.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenHistory('all')}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#b86d00] hover:underline whitespace-nowrap"
              >
                Wszystkie zlecenia
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {recentRepairs.length === 0 ? (
            <div className="p-6 sm:p-10 text-center">
              <div className="inline-flex items-center justify-center gap-1.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Brak zapisanych zleceń serwisowych
                </h3>
                <InfoTooltip text="Przyjmij replikę w warsztacie, przeprowadź diagnostykę 7 układów i wyceń części oraz robociznę." />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={onOpenWorkbench}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#e88a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#cf7b00]"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  Otwórz warsztat i diagnostykę
                </button>
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-stone-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importuj zlecenia
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="divide-y divide-slate-100 md:hidden">
                {recentRepairs.map((entry) => {
                  const stage = entry.stage || 'przyjecie';
                  const paymentLabel =
                    PAYMENT_STATUS_LABELS[entry.paymentStatus || 'oczekuje'];
                  const deadline = getDeadlineInfo(entry.ticket.targetReadyDate, stage);
                  return (
                    <div key={entry.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {entry.replicaLabel}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {[
                              entry.ticket.projectName ||
                                SERVICE_SCOPE_LABELS[entry.ticket.serviceScope],
                              entry.ticket.clientName || null,
                              entry.partsSummary,
                              paymentLabel,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                            {deadline && (
                              <span
                                className={`ml-1.5 font-mono tabular-nums ${
                                  deadline.urgent
                                    ? 'font-semibold text-red-600'
                                    : 'text-slate-600'
                                }`}
                              >
                                · {deadline.label}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <p className="font-mono text-sm font-bold text-slate-900">
                            {formatPln(entry.result.grossPrice)}
                          </p>
                          <p className="font-mono text-[11px] font-medium text-emerald-700">
                            +{formatPln(entry.result.workshopProfit)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={stage}
                          onChange={(e) =>
                            onChangeStage(entry.id, e.target.value as RepairStage)
                          }
                          aria-label="Etap procesu"
                          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium focus:outline-none ${STAGE_STYLE[stage]}`}
                        >
                          {REPAIR_STAGE_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {REPAIR_STAGE_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => onLoadRepair(entry)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00]"
                        >
                          Otwórz
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                      <th className="px-5 py-2.5 font-medium">Replika / Klient</th>
                      <th className="px-3 py-2.5 font-medium">Części</th>
                      <th className="px-3 py-2.5 font-medium">Etap procesu</th>
                      <th className="px-3 py-2.5 font-medium text-right">Brutto</th>
                      <th className="px-3 py-2.5 font-medium text-right">Zysk</th>
                      <th className="px-5 py-2.5 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentRepairs.map((entry) => {
                      const stage = entry.stage || 'przyjecie';
                      const paymentLabel =
                        PAYMENT_STATUS_LABELS[entry.paymentStatus || 'oczekuje'];
                      const deadline = getDeadlineInfo(entry.ticket.targetReadyDate, stage);
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3">
                            <div className="font-medium text-slate-900">
                              {entry.replicaLabel}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {[
                                entry.ticket.projectName ||
                                  SERVICE_SCOPE_LABELS[entry.ticket.serviceScope],
                                entry.ticket.clientName || null,
                                paymentLabel,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                              {deadline && (
                                <span
                                  className={`ml-1.5 font-mono tabular-nums ${
                                    deadline.urgent
                                      ? 'font-semibold text-red-600'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  · {deadline.label}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                            {entry.partsSummary}
                          </td>
                          <td className="px-3 py-3">
                            <select
                              value={stage}
                              onChange={(e) =>
                                onChangeStage(
                                  entry.id,
                                  e.target.value as RepairStage
                                )
                              }
                              aria-label="Etap procesu"
                              className={`rounded-md border px-2 py-1 text-[11px] font-medium focus:outline-none ${STAGE_STYLE[stage]}`}
                            >
                              {REPAIR_STAGE_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {REPAIR_STAGE_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatPln(entry.result.grossPrice)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                            {formatPln(entry.result.workshopProfit)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => onLoadRepair(entry)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00]"
                            >
                              Otwórz
                              <ArrowUpRight className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Right: Deadlines + Tools + Pending Parts */}
        <div className="space-y-4 xl:col-span-4">
          {/* Urgent Deadlines Before Game */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-[#b86d00]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Najbliższe terminy (przed grą)
                </h2>
                <InfoTooltip text="Aktywne zlecenia z wyznaczoną datą odbioru na strzelankę, posortowane od najpilniejszych." />
              </div>
            </div>

            {urgentDeadlines.length === 0 ? (
              <p className="text-xs text-slate-500">
                Brak aktywnych zleceń z wyznaczonym terminem.
              </p>
            ) : (
              <div className="divide-y divide-stone-100 text-xs">
                {urgentDeadlines.map((entry) => {
                  const dl = getDeadlineInfo(
                    entry.ticket.targetReadyDate,
                    entry.stage
                  );
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">
                          {entry.replicaLabel}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {[
                            entry.ticket.clientName || 'Klient',
                            REPAIR_STAGE_LABELS[entry.stage],
                          ].join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {dl && (
                          <span
                            className={`font-mono text-[11px] tabular-nums ${
                              dl.urgent
                                ? 'font-semibold text-red-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {dl.label.replace('Na: ', '')}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onLoadRepair(entry)}
                          className="rounded border border-stone-200 bg-white p-1 text-slate-600 hover:border-[#e88a00] hover:text-[#b86d00]"
                          title="Otwórz w warsztacie"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Tools not duplicated in TopNav */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-slate-900">Narzędzia</h2>
              <InfoTooltip text="Generator kosztorysów PDF dla klienta oraz import archiwalnych zleceń ze screenów lub wiadomości." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenQuote}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 transition-colors hover:border-[#e88a00] hover:bg-amber-50/30"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 text-[#b86d00] shrink-0" />
                  <span className="truncate">Kosztorys PDF</span>
                </span>
                {quoteItems.length > 0 && (
                  <span className="ml-1 font-mono text-[11px] font-semibold text-[#b86d00] tabular-nums">
                    {quoteItems.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={onOpenImport}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 transition-colors hover:border-[#e88a00] hover:bg-amber-50/30"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Upload className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                  <span className="truncate">Importuj</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </button>
            </div>
          </section>

          {stats.pendingPartsPreview.length > 0 && (
            <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Części do zamówienia / w drodze
                </h2>
                <button
                  type="button"
                  onClick={onOpenProcurement}
                  className="text-xs font-medium text-[#b86d00] hover:underline"
                >
                  Zarządzaj
                </button>
              </div>
              <div className="divide-y divide-stone-100 text-xs">
                {stats.pendingPartsPreview.map((p, i) => (
                  <div key={`${p.repairId}-${i}`} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {p.partName}
                      </span>
                      <span className="font-mono font-semibold text-slate-800 tabular-nums shrink-0">
                        {formatPln(p.cost)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {p.supplier} · {p.replicaLabel} ·{' '}
                      <span
                        className={
                          p.status === 'do_zamowienia'
                            ? 'font-semibold text-red-600'
                            : 'font-medium text-amber-700'
                        }
                      >
                        {p.status === 'do_zamowienia'
                          ? 'Do zamówienia'
                          : 'Zamówione'}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
