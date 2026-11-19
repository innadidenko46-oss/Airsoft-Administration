import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Copy,
  Download,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DriveType,
  PaymentStatus,
  RepairStage,
  SavedRepairOrder,
} from '../types/airsoft';
import {
  PAYMENT_STATUS_LABELS,
  REPAIR_STAGE_LABELS,
  REPAIR_STAGE_ORDER,
  SERVICE_SCOPE_LABELS,
  exportRepairsToCsv,
  formatPln,
} from '../utils/airsoftCalculations';
import { InfoTooltip } from './InfoTooltip';

interface HistoryViewProps {
  repairs: SavedRepairOrder[];
  initialStageFilter?: 'all' | RepairStage;
  onLoadRepair: (entry: SavedRepairOrder) => void;
  onDuplicateRepair: (entry: SavedRepairOrder) => void;
  onChangeStage: (id: string, stage: RepairStage) => void;
  onChangePaymentStatus: (id: string, paymentStatus: PaymentStatus) => void;
  onChangeDocumentRef: (id: string, documentRef: string) => void;
  onDeleteRepair: (id: string) => void;
  onOpenImport: () => void;
  onNotify: (msg: string) => void;
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

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  oczekuje: 'border-slate-200 bg-white text-slate-600',
  zaliczka: 'border-amber-200 bg-amber-50/70 text-amber-800',
  oplacone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  wyslane: 'border-sky-200 bg-sky-50 text-sky-800',
};

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

export const HistoryView: React.FC<HistoryViewProps> = ({
  repairs,
  initialStageFilter = 'all',
  onLoadRepair,
  onDuplicateRepair,
  onChangeStage,
  onChangePaymentStatus,
  onChangeDocumentRef,
  onDeleteRepair,
  onOpenImport,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | RepairStage>(
    initialStageFilter
  );
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentStatus>(
    'all'
  );
  const [driveFilter, setDriveFilter] = useState<'all' | DriveType>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const countsByStage = useMemo(() => {
    const counts: Record<'all' | RepairStage, number> = {
      all: repairs.length,
      przyjecie: 0,
      diagnostyka: 0,
      oczekuje_akceptacji: 0,
      zakup_czesci: 0,
      w_realizacji: 0,
      testy_chrono: 0,
      gotowe: 0,
    };
    for (const r of repairs) {
      const s = r.stage || 'przyjecie';
      counts[s] += 1;
    }
    return counts;
  }, [repairs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repairs.filter((entry) => {
      const entryStage = entry.stage || 'przyjecie';
      const entryPayment = entry.paymentStatus || 'oczekuje';
      const entryDrive = entry.ticket?.driveType || 'AEG';

      if (stageFilter !== 'all' && entryStage !== stageFilter) return false;
      if (paymentFilter !== 'all' && entryPayment !== paymentFilter) return false;
      if (driveFilter !== 'all' && entryDrive !== driveFilter) return false;

      if (q) {
        const partsText = (entry.ticket?.parts || [])
          .map((p) => `${p.name} ${p.supplier}`)
          .join(' ');
        const hay = [
          entry.replicaLabel,
          entry.ticket?.projectName || '',
          entry.ticket?.clientName || '',
          entry.ticket?.clientContact || '',
          entry.ticket?.reportedFault || '',
          entry.ticket?.diagnosisSummary || '',
          entry.documentRef || '',
          partsText,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [repairs, search, stageFilter, paymentFilter, driveFilter]);

  const totalGross = filtered.reduce((s, e) => s + (e.result?.grossPrice || 0), 0);
  const totalProfit = filtered.reduce(
    (s, e) => s + (e.result?.workshopProfit || 0),
    0
  );

  const handleExportCsv = () => {
    if (filtered.length === 0) return;
    const csv = exportRepairsToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `airsoft-serwis-zlecenia-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onNotify('Wyeksportowano listę zleceń ASG do pliku CSV.');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setStageFilter('all')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                stageFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Wszystkie ({countsByStage.all})
            </button>
            {REPAIR_STAGE_ORDER.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => setStageFilter(stage)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  stageFilter === stage
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {REPAIR_STAGE_LABELS[stage]} ({countsByStage[stage]})
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs xl:justify-end">
            <div className="flex items-center gap-2.5">
              <span>
                <span className="text-slate-500">Brutto: </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatPln(totalGross)}
                </span>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                <span className="text-slate-500">Zysk: </span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  {formatPln(totalProfit)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenImport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e88a00]/40 bg-amber-50/70 px-3 py-1.5 text-xs font-semibold text-[#b86d00] hover:bg-amber-100/70 whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                Importuj zlecenia
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-center lg:gap-3">
          <div className="relative sm:col-span-3 lg:flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj repliki, klienta, usterki, części, nr paczki..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#e88a00] focus:outline-none"
            />
          </div>

          <select
            value={paymentFilter}
            onChange={(e) =>
              setPaymentFilter(e.target.value as 'all' | PaymentStatus)
            }
            aria-label="Filtruj po statusie płatności"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
          >
            <option value="all">Wszystkie płatności</option>
            <option value="oczekuje">{PAYMENT_STATUS_LABELS.oczekuje}</option>
            <option value="zaliczka">{PAYMENT_STATUS_LABELS.zaliczka}</option>
            <option value="oplacone">{PAYMENT_STATUS_LABELS.oplacone}</option>
            <option value="wyslane">{PAYMENT_STATUS_LABELS.wyslane}</option>
          </select>

          <select
            value={driveFilter}
            onChange={(e) =>
              setDriveFilter(e.target.value as 'all' | DriveType)
            }
            aria-label="Filtruj po napędzie"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
          >
            <option value="all">Wszystkie napędy</option>
            <option value="AEG">AEG</option>
            <option value="HPA">HPA</option>
            <option value="GBB">GBB</option>
            <option value="CO2">CO2</option>
            <option value="Spring">Spring</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
          <div className="inline-flex items-center justify-center gap-1.5">
            <h3 className="text-base font-semibold text-slate-900">
              Brak zleceń w tym widoku
            </h3>
            <InfoTooltip text="Zapisuj nowe naprawy z zakładki Warsztat lub zaimportuj wcześniejsze zlecenia serwisowe." />
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((entry) => {
              const stage = entry.stage || 'przyjecie';
              const paymentStatus = entry.paymentStatus || 'oczekuje';
              const deadline = getDeadlineInfo(entry.ticket.targetReadyDate, stage);
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {entry.replicaLabel}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[
                          entry.ticket.projectName ||
                            SERVICE_SCOPE_LABELS[entry.ticket.serviceScope],
                          entry.ticket.clientName || null,
                          entry.partsSummary,
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
                      <p className="font-mono text-xs font-semibold text-emerald-700">
                        +{formatPln(entry.result.workshopProfit)}
                      </p>
                    </div>
                  </div>

                  {entry.ticket.diagnosisSummary && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                      Diagnoza: {entry.ticket.diagnosisSummary}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={stage}
                      onChange={(e) =>
                        onChangeStage(entry.id, e.target.value as RepairStage)
                      }
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium focus:outline-none ${STAGE_STYLE[stage]}`}
                    >
                      {REPAIR_STAGE_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {REPAIR_STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={paymentStatus}
                      onChange={(e) =>
                        onChangePaymentStatus(
                          entry.id,
                          e.target.value as PaymentStatus
                        )
                      }
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium focus:outline-none ${PAYMENT_STYLE[paymentStatus]}`}
                    >
                      <option value="oczekuje">{PAYMENT_STATUS_LABELS.oczekuje}</option>
                      <option value="zaliczka">{PAYMENT_STATUS_LABELS.zaliczka}</option>
                      <option value="oplacone">{PAYMENT_STATUS_LABELS.oplacone}</option>
                      <option value="wyslane">{PAYMENT_STATUS_LABELS.wyslane}</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    <button
                      type="button"
                      onClick={() => onLoadRepair(entry)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-[#e88a00] hover:text-[#b86d00]"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Otwórz w warsztacie
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateRepair(entry)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                      title="Duplikuj"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRepair(entry.id)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Usuń"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">Replika / Klient</th>
                  <th className="py-3 px-4 font-medium">Diagnostyka / Usterka</th>
                  <th className="py-3 px-4 font-medium">Proces i płatność</th>
                  <th className="py-3 px-4 font-medium">Części & Chrono</th>
                  <th className="py-3 px-4 font-medium text-right">Zysk</th>
                  <th className="py-3 px-4 font-medium text-right">Brutto</th>
                  <th className="py-3 px-4 font-medium text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => {
                  const stage = entry.stage || 'przyjecie';
                  const paymentStatus = entry.paymentStatus || 'oczekuje';
                  const deadline = getDeadlineInfo(entry.ticket.targetReadyDate, stage);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-3 px-4 max-w-[240px]">
                        <p className="font-medium text-slate-900">
                          {entry.replicaLabel}
                        </p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {new Date(entry.createdAt).toLocaleDateString('pl-PL')}
                          {entry.ticket.clientName && ` · ${entry.ticket.clientName}`}
                          {entry.ticket.clientContact &&
                            ` · ${entry.ticket.clientContact}`}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                          {entry.ticket.projectName ||
                            SERVICE_SCOPE_LABELS[entry.ticket.serviceScope]}
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
                      </td>
                      <td className="py-3 px-4 max-w-[240px] text-xs">
                        {entry.ticket.diagnosisSummary ? (
                          <p className="text-slate-800 line-clamp-2">
                            {entry.ticket.diagnosisSummary}
                          </p>
                        ) : entry.ticket.reportedFault ? (
                          <p className="text-slate-600 line-clamp-2">
                            Zgłoszenie: {entry.ticket.reportedFault}
                          </p>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={stage}
                              onChange={(e) =>
                                onChangeStage(
                                  entry.id,
                                  e.target.value as RepairStage
                                )
                              }
                              className={`rounded-md border px-2 py-1 text-xs font-medium focus:outline-none ${STAGE_STYLE[stage]}`}
                            >
                              {REPAIR_STAGE_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {REPAIR_STAGE_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <select
                              value={paymentStatus}
                              onChange={(e) =>
                                onChangePaymentStatus(
                                  entry.id,
                                  e.target.value as PaymentStatus
                                )
                              }
                              className={`rounded-md border px-2 py-1 text-xs font-medium focus:outline-none ${PAYMENT_STYLE[paymentStatus]}`}
                            >
                              <option value="oczekuje">
                                {PAYMENT_STATUS_LABELS.oczekuje}
                              </option>
                              <option value="zaliczka">
                                {PAYMENT_STATUS_LABELS.zaliczka}
                              </option>
                              <option value="oplacone">
                                {PAYMENT_STATUS_LABELS.oplacone}
                              </option>
                              <option value="wyslane">
                                {PAYMENT_STATUS_LABELS.wyslane}
                              </option>
                            </select>
                          </div>
                          <input
                            type="text"
                            value={entry.documentRef || ''}
                            onChange={(e) =>
                              onChangeDocumentRef(entry.id, e.target.value)
                            }
                            placeholder="Nr dok. / paczki InPost"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">
                          {entry.partsSummary}
                        </p>
                        {(entry.ticket.chrono?.beforeFps > 0 ||
                          entry.ticket.chrono?.afterFps > 0) && (
                          <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {entry.ticket.chrono.beforeFps || '—'} →{' '}
                            {entry.ticket.chrono.afterFps ||
                              entry.ticket.chrono.targetFps ||
                              '—'}{' '}
                            FPS
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatPln(entry.result.workshopProfit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatPln(entry.result.grossPrice)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onLoadRepair(entry)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Otwórz
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateRepair(entry)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Duplikuj"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {confirmDeleteId === entry.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  onDeleteRepair(entry.id);
                                }}
                                className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                              >
                                Usuń
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-md px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100"
                              >
                                Nie
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(entry.id)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Usuń zlecenie"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
