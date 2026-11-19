import {
  AirsoftWorkshopSettings,
  DiagnosticState,
  DriveType,
  PartPurchaseStatus,
  PartsCatalogItem,
  PaymentStatus,
  RepairCalculationResult,
  RepairPartItem,
  RepairStage,
  RepairTicketInput,
  SavedRepairOrder,
  ServiceScope,
} from '../types/airsoft';
import { INITIAL_TICKET_INPUT } from '../data/airsoftDefaults';

export const SERVICE_SCOPE_LABELS: Record<ServiceScope, string> = {
  diagnostyka_naprawa: 'Diagnostyka + Naprawa',
  przeglad: 'Przegląd zerowy / Serwis',
  kastomizacja: 'Kastomizacja / Tuning',
  diagnostyka_tylko: 'Sama diagnostyka',
};

export const REPAIR_STAGE_ORDER: RepairStage[] = [
  'przyjecie',
  'diagnostyka',
  'oczekuje_akceptacji',
  'zakup_czesci',
  'w_realizacji',
  'testy_chrono',
  'gotowe',
];

export const REPAIR_STAGE_LABELS: Record<RepairStage, string> = {
  przyjecie: 'Przyjęte',
  diagnostyka: 'Diagnostyka usterki',
  oczekuje_akceptacji: 'Kosztorys / Akceptacja',
  zakup_czesci: 'Zakup części',
  w_realizacji: 'Naprawa / Kastomizacja',
  testy_chrono: 'Testy Chrono',
  gotowe: 'Gotowe / Odebrane',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  oczekuje: 'Oczekuje',
  zaliczka: 'Zaliczka',
  oplacone: 'Opłacone',
  wyslane: 'Wysłane',
};

export const DRIVE_TYPE_LABELS: Record<DriveType, string> = {
  AEG: 'AEG (Elektryczna)',
  HPA: 'HPA',
  GBB: 'GBB (Gazowa)',
  CO2: 'CO2',
  Spring: 'Sprężynowa',
  Inny: 'Inny napęd',
};

export const DIAGNOSTIC_STATE_LABELS: Record<DiagnosticState, string> = {
  niesprawdzono: 'Nie sprawdzono',
  ok: 'Sprawny (OK)',
  uwaga: 'Zużycie / Uwaga',
  usterka: 'Usterka / Do wymiany',
  nd: 'N/D',
};

export const PART_PURCHASE_STATUS_LABELS: Record<PartPurchaseStatus, string> = {
  do_zamowienia: 'Do zamówienia',
  zamowione: 'Zamówione',
  na_miejscu: 'Na miejscu',
  zamontowane: 'Zamontowane',
};

export function computeJouleFromFps(
  fps: number,
  bbWeightGrams: number
): number {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(bbWeightGrams) || bbWeightGrams <= 0) {
    return 0;
  }
  const mps = fps * 0.3048;
  const massKg = bbWeightGrams / 1000;
  const joules = 0.5 * massKg * mps * mps;
  return Math.round(joules * 100) / 100;
}

export function formatReplicaLabel(ticket: RepairTicketInput): string {
  const brandModel = [ticket.replicaBrand, ticket.replicaModel]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ');
  const base = brandModel || ticket.projectName.trim() || 'Replika ASG';
  return `${base} (${ticket.driveType || 'AEG'})`.slice(0, 160);
}

export interface ChronoSeriesStats {
  count: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  spreadFps: number;
  avgJoule: number;
}

export function parseChronoSeries(
  raw: string | undefined,
  bbWeightGrams: number
): ChronoSeriesStats {
  if (!raw || !raw.trim()) {
    return { count: 0, avgFps: 0, minFps: 0, maxFps: 0, spreadFps: 0, avgJoule: 0 };
  }
  const nums = raw
    .split(/[\s,;/]+/)
    .map((s) => parseFloat(s.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 20 && n < 1200);

  if (nums.length === 0) {
    return { count: 0, avgFps: 0, minFps: 0, maxFps: 0, spreadFps: 0, avgJoule: 0 };
  }
  const sum = nums.reduce((a, b) => a + b, 0);
  const avgFps = Math.round((sum / nums.length) * 10) / 10;
  const minFps = Math.min(...nums);
  const maxFps = Math.max(...nums);
  const spreadFps = Math.round((maxFps - minFps) * 10) / 10;
  return {
    count: nums.length,
    avgFps,
    minFps,
    maxFps,
    spreadFps,
    avgJoule: computeJouleFromFps(avgFps, bbWeightGrams),
  };
}

export function formatPartsSummary(parts: RepairPartItem[]): string {
  if (!parts || parts.length === 0) return 'Brak części';
  const workshopParts = parts.filter((p) => !p.suppliedByClient);
  const clientCount = parts.length - workshopParts.length;
  if (workshopParts.length === 0) {
    return `${clientCount} cz. klienta`;
  }
  const toOrder = workshopParts.filter(
    (p) => p.purchaseStatus === 'do_zamowienia'
  ).length;
  const ordered = workshopParts.filter(
    (p) => p.purchaseStatus === 'zamowione'
  ).length;
  const ready = workshopParts.filter(
    (p) =>
      p.purchaseStatus === 'na_miejscu' || p.purchaseStatus === 'zamontowane'
  ).length;
  const clientSuffix = clientCount > 0 ? ` (+${clientCount} kl.)` : '';
  if (toOrder > 0) {
    return `${toOrder} do zakupu · ${ready}/${workshopParts.length} got.${clientSuffix}`;
  }
  if (ordered > 0) {
    return `${ordered} w drodze · ${ready}/${workshopParts.length} got.${clientSuffix}`;
  }
  return `${ready}/${workshopParts.length} na miejscu${clientSuffix}`;
}

export function calculateRepairQuote(
  ticket: RepairTicketInput
): RepairCalculationResult {
  const parts = Array.isArray(ticket.parts) ? ticket.parts : [];
  const laborTasks = Array.isArray(ticket.laborTasks) ? ticket.laborTasks : [];

  let partsPurchaseCostTotal = 0;
  let partsClientTotal = 0;
  let partsToOrderCount = 0;
  let partsOrderedCount = 0;
  let partsReadyCount = 0;
  let partsClientSuppliedCount = 0;

  for (const part of parts) {
    const qty = Math.max(1, Math.round(part.quantity || 1));
    if (!part.suppliedByClient) {
      partsPurchaseCostTotal += Math.max(0, part.purchaseUnitCost || 0) * qty;
      partsClientTotal += Math.max(0, part.clientUnitPrice || 0) * qty;

      if (part.purchaseStatus === 'do_zamowienia') partsToOrderCount += 1;
      else if (part.purchaseStatus === 'zamowione') partsOrderedCount += 1;
      else partsReadyCount += 1;
    } else {
      partsClientSuppliedCount += 1;
    }
  }

  const partsMarginProfit = partsClientTotal - partsPurchaseCostTotal;

  let laborTotal = 0;
  let laborHoursTotal = 0;
  for (const task of laborTasks) {
    const hrs = Math.max(0, task.hours || 0);
    laborHoursTotal += hrs;
    if (task.useFixedPrice) {
      laborTotal += Math.max(0, task.fixedPrice || 0);
    } else {
      laborTotal += hrs * Math.max(0, task.hourlyRate || 0);
    }
  }

  const consumablesCost = Math.max(0, ticket.extraMaterialsFlat || 0);
  const diagnosticFee = Math.max(0, ticket.diagnosticFee || 0);
  const subtotalBeforePriority =
    partsClientTotal + laborTotal + consumablesCost + diagnosticFee;

  const priorityPct = Math.max(0, ticket.prioritySurchargePercent || 0);
  const prioritySurchargeAmount = subtotalBeforePriority * (priorityPct / 100);
  const netPrice = subtotalBeforePriority + prioritySurchargeAmount;

  const taxRate = Math.max(0, Math.min(50, ticket.incomeTaxRate || 0));
  const priceWithIncomeTax =
    taxRate === 0
      ? netPrice
      : ticket.incomeTaxMode === 'gross_up'
      ? netPrice / (1 - taxRate / 100)
      : netPrice * (1 + taxRate / 100);
  const incomeTaxAmount = priceWithIncomeTax - netPrice;

  const vatMultiplier = 1 + Math.max(0, ticket.vatRate || 0) / 100;
  const grossPrice = priceWithIncomeTax * vatMultiplier;
  const vatAmount = grossPrice - priceWithIncomeTax;

  // Real consumables out-of-pocket estimate ~35% of flat materials fee; parts purchase cost is 100% direct cost
  const workshopProfit = netPrice - partsPurchaseCostTotal;
  const profitMarginPercent = netPrice > 0 ? (workshopProfit / netPrice) * 100 : 0;

  return {
    partsPurchaseCostTotal,
    partsClientTotal,
    partsMarginProfit,
    partsCountTotal: parts.length,
    partsToOrderCount,
    partsOrderedCount,
    partsReadyCount,
    partsClientSuppliedCount,
    laborTotal,
    laborHoursTotal,
    consumablesCost,
    diagnosticFee,
    prioritySurchargeAmount,
    netPrice,
    priceWithIncomeTax,
    incomeTaxAmount,
    grossPrice,
    vatAmount,
    workshopProfit,
    profitMarginPercent,
  };
}

export function formatPln(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return (
    new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safe) + ' zł'
  );
}

export function formatNumber(value: number, decimals = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
}

export function exportRepairsToCsv(entries: SavedRepairOrder[]): string {
  const headers = [
    'Data przyjęcia',
    'Etap procesu',
    'Status płatności',
    'Dokument / Paczka',
    'Zakres',
    'Nazwa zlecenia',
    'Replika',
    'Napęd',
    'Klient',
    'Kontakt',
    'Dostawa / NIP',
    'Źródło',
    'Zgłoszona usterka',
    'Diagnoza serwisu',
    'Chrono przed (FPS)',
    'Chrono po / cel (FPS)',
    'Części (podsumowanie)',
    'Koszt zakupu części (zł)',
    'Części dla klienta (zł)',
    'Robocizna (zł)',
    'Zysk warsztatu (zł)',
    'Razem netto (zł)',
    'Razem brutto VAT (zł)',
  ];

  const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;

  const rows = entries.map((e) => [
    new Date(e.createdAt).toLocaleString('pl-PL'),
    REPAIR_STAGE_LABELS[e.stage || 'przyjecie'],
    PAYMENT_STATUS_LABELS[e.paymentStatus || 'oczekuje'],
    esc(e.documentRef || ''),
    SERVICE_SCOPE_LABELS[e.ticket.serviceScope || 'diagnostyka_naprawa'],
    esc(e.ticket.projectName || 'Bez nazwy'),
    esc(`${e.ticket.replicaBrand} ${e.ticket.replicaModel}`.trim()),
    e.ticket.driveType || 'AEG',
    esc(e.ticket.clientName || ''),
    esc(e.ticket.clientContact || ''),
    esc(e.ticket.clientDeliveryInfo || ''),
    esc(e.ticket.orderSource || 'E-mail'),
    esc(e.ticket.reportedFault || ''),
    esc(e.ticket.diagnosisSummary || ''),
    e.ticket.chrono?.beforeFps || 0,
    e.ticket.chrono?.afterFps || e.ticket.chrono?.targetFps || 0,
    esc(e.partsSummary || ''),
    e.result.partsPurchaseCostTotal.toFixed(2).replace('.', ','),
    e.result.partsClientTotal.toFixed(2).replace('.', ','),
    e.result.laborTotal.toFixed(2).replace('.', ','),
    e.result.workshopProfit.toFixed(2).replace('.', ','),
    e.result.priceWithIncomeTax.toFixed(2).replace('.', ','),
    e.result.grossPrice.toFixed(2).replace('.', ','),
  ]);

  return '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
}

export interface ImportedRepairDraft {
  tempId: string;
  selected: boolean;
  projectName: string;
  orderDate: string;
  serviceScope: ServiceScope;
  stage: RepairStage;
  paymentStatus: PaymentStatus;
  replicaBrand: string;
  replicaModel: string;
  driveType: DriveType;
  reportedFault: string;
  diagnosisSummary: string;
  agreedPrice: number;
  agreedPriceIsNet: boolean;
  partsCostEstimate: number;
  clientName: string;
  clientContact: string;
  clientDeliveryInfo: string;
  orderSource: string;
  documentRef: string;
  technicalNotes: string;
  extractionNote: string;
}

export function buildImportedRepairOrder(
  draft: ImportedRepairDraft,
  settings: AirsoftWorkshopSettings,
  partsCatalog: PartsCatalogItem[],
  indexOffset = 0
): SavedRepairOrder {
  const scope: ServiceScope = draft.serviceScope || 'diagnostyka_naprawa';
  const grossOrNet = Math.max(0, draft.agreedPrice || 0);
  const vatMult = 1 + Math.max(0, settings.defaultVatRate) / 100;
  const taxRate = Math.max(0, Math.min(50, settings.defaultIncomeTaxRate));

  const priceWithIncomeTax = draft.agreedPriceIsNet
    ? grossOrNet
    : grossOrNet / vatMult;
  const grossPrice = draft.agreedPriceIsNet ? grossOrNet * vatMult : grossOrNet;
  const netPrice =
    taxRate === 0
      ? priceWithIncomeTax
      : settings.defaultIncomeTaxMode === 'gross_up'
      ? priceWithIncomeTax * (1 - taxRate / 100)
      : priceWithIncomeTax / (1 + taxRate / 100);

  const partsCost = Math.max(0, draft.partsCostEstimate || 0);
  const laborEst = Math.max(0, netPrice - partsCost);

  const ticket: RepairTicketInput = {
    ...INITIAL_TICKET_INPUT,
    stage: draft.stage || 'gotowe',
    serviceScope: scope,
    projectName: draft.projectName.trim() || 'Naprawa / serwis repliki ASG',
    replicaBrand: draft.replicaBrand.trim(),
    replicaModel: draft.replicaModel.trim(),
    driveType: draft.driveType || 'AEG',
    clientName: draft.clientName.trim(),
    clientContact: draft.clientContact.trim(),
    clientDeliveryInfo: draft.clientDeliveryInfo.trim(),
    orderSource: draft.orderSource.trim() || 'E-mail',
    reportedFault: draft.reportedFault.trim(),
    diagnosisSummary: draft.diagnosisSummary.trim(),
    parts:
      partsCost > 0
        ? [
            {
              id: `imp-part-${Date.now()}-${indexOffset}`,
              catalogId: partsCatalog[0]?.id,
              name: 'Części naprawcze wg korespondencji',
              category: 'Gearbox / Napęd',
              supplier: 'Magazyn własny',
              productUrl: '',
              quantity: 1,
              purchaseUnitCost: partsCost,
              clientUnitPrice: partsCost,
              purchaseStatus: draft.stage === 'gotowe' ? 'zamontowane' : 'na_miejscu',
            },
          ]
        : [],
    laborTasks: [
      {
        id: `imp-lab-${Date.now()}-${indexOffset}`,
        name: draft.projectName.trim() || 'Robocizna serwisowa',
        hours: 1,
        hourlyRate: settings.defaultTechHourlyRate,
        fixedPrice: Math.round(laborEst * 100) / 100,
        useFixedPrice: true,
      },
    ],
    extraMaterialsFlat: 0,
    diagnosticFee: 0,
    technicalNotes: draft.technicalNotes.trim(),
    incomeTaxRate: settings.defaultIncomeTaxRate,
    incomeTaxMode: settings.defaultIncomeTaxMode,
    vatRate: settings.defaultVatRate,
  };

  const baseResult = calculateRepairQuote(ticket);
  const finalResult: RepairCalculationResult =
    grossOrNet > 0
      ? {
          ...baseResult,
          netPrice,
          priceWithIncomeTax,
          incomeTaxAmount: Math.max(0, priceWithIncomeTax - netPrice),
          grossPrice,
          vatAmount: Math.max(0, grossPrice - priceWithIncomeTax),
          workshopProfit: netPrice - partsCost,
          profitMarginPercent:
            netPrice > 0 ? ((netPrice - partsCost) / netPrice) * 100 : 0,
        }
      : baseResult;

  const todayStr = new Date().toISOString().slice(0, 10);
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.orderDate)
    ? draft.orderDate
    : todayStr;
  const createdAtIso =
    cleanDate === todayStr
      ? new Date(Date.now() - indexOffset * 1000).toISOString()
      : `${cleanDate}T12:00:00.000Z`;

  return {
    id: `rep-${Date.now()}-${indexOffset}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: createdAtIso,
    stage: draft.stage || 'gotowe',
    paymentStatus: draft.paymentStatus || 'oplacone',
    documentRef: draft.documentRef.trim().slice(0, 160),
    ticket,
    result: finalResult,
    replicaLabel: formatReplicaLabel(ticket),
    partsSummary: formatPartsSummary(ticket.parts),
  };
}
