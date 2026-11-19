import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  PackageCheck,
  Search,
} from 'lucide-react';
import {
  PartPurchaseStatus,
  RepairPartItem,
  SavedRepairOrder,
} from '../types/airsoft';
import {
  PART_PURCHASE_STATUS_LABELS,
  REPAIR_STAGE_LABELS,
  formatPln,
} from '../utils/airsoftCalculations';
import { InfoTooltip } from './InfoTooltip';

interface PartsProcurementViewProps {
  repairs: SavedRepairOrder[];
  suppliers: string[];
  onUpdatePartInRepair: (
    repairId: string,
    partId: string,
    patch: Partial<RepairPartItem>
  ) => void;
  onOpenRepair: (repair: SavedRepairOrder) => void;
  onNotify: (msg: string) => void;
}

interface FlattenedPartRow {
  repair: SavedRepairOrder;
  part: RepairPartItem;
  totalPurchaseCost: number;
  totalClientPrice: number;
}

const STATUS_BADGE_STYLE: Record<PartPurchaseStatus, string> = {
  do_zamowienia: 'border-red-200 bg-red-50 text-red-700',
  zamowione: 'border-amber-200 bg-amber-50 text-amber-800',
  na_miejscu: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  zamontowane: 'border-slate-200 bg-slate-100 text-slate-700',
};

export const PartsProcurementView: React.FC<PartsProcurementViewProps> = ({
  repairs,
  suppliers,
  onUpdatePartInRepair,
  onOpenRepair,
  onNotify,
}) => {
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | PartPurchaseStatus>('active');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'supplier' | 'repair'>('supplier');
  const [search, setSearch] = useState('');
  const [copiedList, setCopiedList] = useState(false);

  const allRows = useMemo<FlattenedPartRow[]>(() => {
    const rows: FlattenedPartRow[] = [];
    for (const repair of repairs) {
      if (repair.stage === 'gotowe' && statusFilter === 'active') continue;
      for (const part of repair.ticket?.parts || []) {
        const qty = Math.max(1, part.quantity || 1);
        rows.push({
          repair,
          part,
          totalPurchaseCost: (part.purchaseUnitCost || 0) * qty,
          totalClientPrice: (part.clientUnitPrice || 0) * qty,
        });
      }
    }
    return rows;
  }, [repairs, statusFilter]);

  const counts = useMemo(() => {
    let toOrder = 0;
    let toOrderCost = 0;
    let ordered = 0;
    let orderedCost = 0;
    let ready = 0;

    for (const repair of repairs) {
      if (repair.stage === 'gotowe') continue;
      for (const p of repair.ticket?.parts || []) {
        if (p.suppliedByClient) continue;
        const qty = Math.max(1, p.quantity || 1);
        const cost = (p.purchaseUnitCost || 0) * qty;
        if (p.purchaseStatus === 'do_zamowienia') {
          toOrder += 1;
          toOrderCost += cost;
        } else if (p.purchaseStatus === 'zamowione') {
          ordered += 1;
          orderedCost += cost;
        } else if (p.purchaseStatus === 'na_miejscu') {
          ready += 1;
        }
      }
    }
    return { toOrder, toOrderCost, ordered, orderedCost, ready };
  }, [repairs]);

  const supplierOptions = useMemo(() => {
    const set = new Set<string>(suppliers);
    for (const row of allRows) {
      if (row.part.supplier && !row.part.suppliedByClient) set.add(row.part.supplier);
    }
    return Array.from(set);
  }, [suppliers, allRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (statusFilter === 'active') {
        if (row.part.suppliedByClient) return false;
        if (row.part.purchaseStatus === 'zamontowane') return false;
      } else if (statusFilter !== 'all') {
        if (row.part.suppliedByClient) return false;
        if (row.part.purchaseStatus !== statusFilter) return false;
      }

      if (supplierFilter !== 'all' && row.part.supplier !== supplierFilter) {
        return false;
      }

      if (q) {
        const hay = [
          row.part.name,
          row.part.supplier,
          row.part.category,
          row.part.orderRef || '',
          row.repair.replicaLabel,
          row.repair.ticket.clientName || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, statusFilter, supplierFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; subtitle?: string; repair?: SavedRepairOrder; rows: FlattenedPartRow[] }>();
    for (const row of filtered) {
      const key =
        groupBy === 'supplier'
          ? row.part.supplier || 'Inny sklep'
          : row.repair.id;
      if (!map.has(key)) {
        map.set(key, {
          title:
            groupBy === 'supplier'
              ? row.part.supplier || 'Inny sklep'
              : row.repair.replicaLabel,
          subtitle:
            groupBy === 'repair'
              ? [
                  row.repair.ticket.clientName || 'Klient',
                  REPAIR_STAGE_LABELS[row.repair.stage],
                ].join(' · ')
              : undefined,
          repair: groupBy === 'repair' ? row.repair : undefined,
          rows: [],
        });
      }
      map.get(key)!.rows.push(row);
    }
    return Array.from(map.entries());
  }, [filtered, groupBy]);

  const handleCopyShoppingList = async () => {
    const purchasable = filtered.filter((r) => !r.part.suppliedByClient);
    if (purchasable.length === 0) {
      onNotify('Brak części do zakupu w bieżącym filtrze.');
      return;
    }
    const lines: string[] = [];
    for (const [, group] of grouped) {
      const groupRows = group.rows.filter((r) => !r.part.suppliedByClient);
      if (groupRows.length === 0) continue;
      const groupSum = groupRows.reduce((s, r) => s + r.totalPurchaseCost, 0);
      lines.push(`=== ${group.title} (${formatPln(groupSum)}) ===`);
      for (const r of groupRows) {
        const qty = Math.max(1, r.part.quantity || 1);
        const urlPart = r.part.productUrl ? ` | ${r.part.productUrl}` : '';
        lines.push(
          `- ${r.part.name} ×${qty} (${formatPln(r.totalPurchaseCost)}) [${r.repair.replicaLabel} / ${
            r.repair.ticket.clientName || 'Klient'
          }]${urlPart}`
        );
      }
      lines.push('');
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n').trim());
      setCopiedList(true);
      onNotify('Skopiowano listę zakupów części do schowka.');
      setTimeout(() => setCopiedList(false), 2000);
    } catch {
      onNotify('Nie udało się skopiować listy.');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Procurement KPIs */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span>Do zamówienia</span>
            <InfoTooltip text="Części ze statusem 'Do zamówienia' w aktywnych zleceniach (bez części powierzonych przez klienta)." />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-red-600 tabular-nums">
              {counts.toOrder} poz.
            </span>
            <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {formatPln(counts.toOrderCost)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Zamówione (w drodze)</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-amber-700 tabular-nums">
              {counts.ordered} poz.
            </span>
            <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {formatPln(counts.orderedCost)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span>Odebrane / Na stole</span>
            <InfoTooltip
              align="right"
              text="Części odebrane ze sklepu i gotowe do montażu w replice."
            />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-emerald-700 tabular-nums">
              {counts.ready} poz.
            </span>
          </div>
        </div>
      </section>

      {/* Filter & Group Controls */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'active', label: 'Aktywne zakupy' },
                { id: 'do_zamowienia', label: `Do zamówienia (${counts.toOrder})` },
                { id: 'zamowione', label: `Zamówione (${counts.ordered})` },
                { id: 'na_miejscu', label: `Na miejscu (${counts.ready})` },
                { id: 'all', label: 'Wszystkie' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg bg-slate-100 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setGroupBy('supplier')}
                className={`rounded-md px-2.5 py-1 transition-colors whitespace-nowrap ${
                  groupBy === 'supplier'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wg sklepu
              </button>
              <button
                type="button"
                onClick={() => setGroupBy('repair')}
                className={`rounded-md px-2.5 py-1 transition-colors whitespace-nowrap ${
                  groupBy === 'repair'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wg repliki
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyShoppingList}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
            >
              {copiedList ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Kopiuj listę zakupów
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-center lg:gap-3">
          <div className="relative lg:flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj części, repliki, klienta, nr zamówienia..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#e88a00] focus:outline-none"
            />
          </div>

          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            aria-label="Filtruj po sklepie"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
          >
            <option value="all">Wszystkie sklepy / dostawcy</option>
            {supplierOptions.map((sup) => (
              <option key={sup} value={sup}>
                {sup}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Grouped Parts List */}
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
          <PackageCheck className="mx-auto h-8 w-8 text-stone-300" />
          <div className="mt-3 inline-flex items-center justify-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Brak części w tym widoku
            </h3>
            <InfoTooltip text="Części naprawcze i tuningowe dodane w Warsztacie pojawiają się tutaj automatycznie do zamówienia." />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupKey, group]) => {
            const groupPurchaseSum = group.rows.reduce(
              (s, r) => s + r.totalPurchaseCost,
              0
            );
            return (
              <section
                key={groupKey}
                className="rounded-xl border border-stone-200 bg-white overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50/80 px-4 py-3 sm:px-5">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {group.title}
                    </h3>
                    {group.subtitle && (
                      <p className="text-[11px] text-slate-500">
                        {group.subtitle}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                      Zakup: {formatPln(groupPurchaseSum)}
                    </span>
                    {group.repair && (
                      <button
                        type="button"
                        onClick={() => onOpenRepair(group.repair!)}
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00]"
                      >
                        Otwórz zlecenie
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="divide-y divide-stone-100 md:hidden">
                  {group.rows.map(({ repair, part, totalPurchaseCost }) => {
                    const qty = Math.max(1, part.quantity || 1);
                    return (
                      <div
                        key={`${repair.id}-${part.id}`}
                        className="space-y-2.5 px-4 py-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">
                              {part.name}{' '}
                              <span className="font-mono text-xs text-slate-600">
                                ×{qty}
                              </span>
                            </p>
                            <p className="text-xs text-slate-500">
                              {[
                                part.category,
                                groupBy === 'repair' && !part.suppliedByClient
                                  ? part.supplier
                                  : null,
                                repair.replicaLabel,
                                repair.ticket.clientName || null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                            {part.suppliedByClient
                              ? 'Klienta'
                              : formatPln(totalPurchaseCost)}
                          </span>
                        </div>

                        {!part.suppliedByClient && (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={part.orderRef || ''}
                              onChange={(e) =>
                                onUpdatePartInRepair(repair.id, part.id, {
                                  orderRef: e.target.value,
                                })
                              }
                              placeholder="Nr zam. / paczki"
                              aria-label="Numer zamówienia sklepowego"
                              className="flex-1 min-w-[120px] rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
                            />
                            <select
                              value={part.purchaseStatus}
                              onChange={(e) =>
                                onUpdatePartInRepair(repair.id, part.id, {
                                  purchaseStatus: e.target
                                    .value as PartPurchaseStatus,
                                })
                              }
                              aria-label="Status zakupu części"
                              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium focus:outline-none ${
                                STATUS_BADGE_STYLE[part.purchaseStatus]
                              }`}
                            >
                              <option value="do_zamowienia">
                                {PART_PURCHASE_STATUS_LABELS.do_zamowienia}
                              </option>
                              <option value="zamowione">
                                {PART_PURCHASE_STATUS_LABELS.zamowione}
                              </option>
                              <option value="na_miejscu">
                                {PART_PURCHASE_STATUS_LABELS.na_miejscu}
                              </option>
                              <option value="zamontowane">
                                {PART_PURCHASE_STATUS_LABELS.zamontowane}
                              </option>
                            </select>
                            <button
                              type="button"
                              onClick={() => onOpenRepair(repair)}
                              className="rounded-md border border-stone-200 bg-white p-1.5 text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00]"
                              title="Przejdź do zlecenia"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop High-Density Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-100 bg-white text-slate-500">
                        <th className="py-2.5 pl-5 pr-3 font-medium">Część</th>
                        <th className="py-2.5 px-3 font-medium">
                          {groupBy === 'supplier'
                            ? 'Replika / Klient'
                            : 'Sklep / Układ'}
                        </th>
                        <th className="py-2.5 px-3 font-medium">Nr zam.</th>
                        <th className="py-2.5 px-3 font-medium text-right">Zakup</th>
                        <th className="py-2.5 px-3 font-medium">Status</th>
                        <th className="py-2.5 pl-3 pr-5 text-right">Zlecenie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {group.rows.map(({ repair, part, totalPurchaseCost }) => {
                        const qty = Math.max(1, part.quantity || 1);
                        return (
                          <tr
                            key={`${repair.id}-${part.id}`}
                            className="hover:bg-stone-50/70"
                          >
                            <td className="py-3 pl-5 pr-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">
                                  {part.name}
                                </span>
                                <span className="font-mono font-semibold text-slate-600 tabular-nums">
                                  ×{qty}
                                </span>
                                {part.productUrl && (
                                  <a
                                    href={part.productUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#b86d00] hover:underline"
                                  >
                                    Link
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                              {part.note && (
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {part.note}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              {groupBy === 'supplier'
                                ? [
                                    repair.replicaLabel,
                                    repair.ticket.clientName || null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                                : [
                                    part.suppliedByClient
                                      ? 'Część klienta'
                                      : part.supplier,
                                    part.category,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </td>
                            <td className="py-3 px-3">
                              {part.suppliedByClient ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <input
                                  type="text"
                                  value={part.orderRef || ''}
                                  onChange={(e) =>
                                    onUpdatePartInRepair(repair.id, part.id, {
                                      orderRef: e.target.value,
                                    })
                                  }
                                  placeholder="Nr zam."
                                  aria-label="Numer zamówienia sklepowego"
                                  className="w-28 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#e88a00] focus:outline-none"
                                />
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                              {part.suppliedByClient
                                ? '0,00 zł'
                                : formatPln(totalPurchaseCost)}
                            </td>
                            <td className="py-3 px-3">
                              {part.suppliedByClient ? (
                                <span className="text-[11px] font-medium text-amber-800">
                                  Powierzona
                                </span>
                              ) : (
                                <select
                                  value={part.purchaseStatus}
                                  onChange={(e) =>
                                    onUpdatePartInRepair(repair.id, part.id, {
                                      purchaseStatus: e.target
                                        .value as PartPurchaseStatus,
                                    })
                                  }
                                  aria-label="Status zakupu części"
                                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium focus:outline-none ${
                                    STATUS_BADGE_STYLE[part.purchaseStatus]
                                  }`}
                                >
                                  <option value="do_zamowienia">
                                    {PART_PURCHASE_STATUS_LABELS.do_zamowienia}
                                  </option>
                                  <option value="zamowione">
                                    {PART_PURCHASE_STATUS_LABELS.zamowione}
                                  </option>
                                  <option value="na_miejscu">
                                    {PART_PURCHASE_STATUS_LABELS.na_miejscu}
                                  </option>
                                  <option value="zamontowane">
                                    {PART_PURCHASE_STATUS_LABELS.zamontowane}
                                  </option>
                                </select>
                              )}
                            </td>
                            <td className="py-3 pl-3 pr-5 text-right">
                              <button
                                type="button"
                                onClick={() => onOpenRepair(repair)}
                                className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00]"
                                title="Przejdź do zlecenia"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
