import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FilePlus2,
  ImagePlus,
  Inbox,
  Link2,
  Loader2,
  Mail,
  Maximize2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  AirsoftWorkshopSettings,
  AttachmentImage,
  DiagnosticState,
  DriveType,
  LaborTaskItem,
  PartCategory,
  PartPurchaseStatus,
  PartsCatalogItem,
  RepairCalculationResult,
  RepairPartItem,
  RepairTicketInput,
  ReplicaInternalSpecs,
  ServiceRateItem,
  ServiceScope,
} from '../types/airsoft';
import {
  INTAKE_ACCESSORY_OPTIONS,
  createDefaultQaChecklist,
  createEmptyInternalSpecs,
} from '../data/airsoftDefaults';
import {
  DIAGNOSTIC_STATE_LABELS,
  PART_PURCHASE_STATUS_LABELS,
  REPAIR_STAGE_LABELS,
  REPAIR_STAGE_ORDER,
  SERVICE_SCOPE_LABELS,
  computeJouleFromFps,
  formatPln,
  formatReplicaLabel,
  parseChronoSeries,
} from '../utils/airsoftCalculations';
import {
  DEFAULT_LEAD_TIMES,
  QuoteLanguage,
  buildSingleRepairEmailReply,
} from '../utils/airsoftEmailTemplates';
import {
  compressImageFileToAttachment,
  extractClipboardImages,
} from '../utils/imageAttachments';
import { InfoTooltip } from './InfoTooltip';
import { VoiceDictationButton } from './VoiceDictationButton';
import { parsePartFromUrl } from '../utils/partUrlParser';

export interface KnownClientSuggestion {
  clientName: string;
  clientContact: string;
  clientDeliveryInfo: string;
  orderSource: string;
}

interface RepairWorkbenchViewProps {
  ticket: RepairTicketInput;
  result: RepairCalculationResult;
  partsCatalog: PartsCatalogItem[];
  serviceRates: ServiceRateItem[];
  suppliers: string[];
  settings: AirsoftWorkshopSettings;
  knownClients: KnownClientSuggestion[];
  onChange: (next: RepairTicketInput) => void;
  onAddCatalogPart?: (part: PartsCatalogItem) => void;
  onClearFields: () => void;
  onSaveAsNew: () => void;
  onUpdateExisting: (repairId: string) => void;
  onAddToQuote: () => void;
  onOpenQuote: () => void;
  onOpenSettings: () => void;
  onNotify: (msg: string) => void;
}

interface ParsedAiEmail {
  projectName: string;
  serviceScope: ServiceScope;
  replicaBrand: string;
  replicaModel: string;
  driveType: DriveType;
  reportedFault: string;
  targetFps?: number | null;
  suggestedCatalogPartIds?: string[];
  isExpressPriority: boolean;
  clientName: string;
  clientContact: string;
  clientDeliveryInfo: string;
  orderSource: string;
  technicalNotes: string;
  detectedLanguage: 'pl' | 'ukr';
}

const PART_CATEGORIES: PartCategory[] = [
  'Pneumatyka',
  'Gearbox / Napęd',
  'Hop-Up / Lufa',
  'Elektronika / Mosfet',
  'Zewnętrzne / Body',
  'HPA / GBB',
  'Materiały serwisowe',
];

const DIAGNOSTIC_OPTIONS: { id: DiagnosticState; short: string; activeClass: string }[] = [
  { id: 'niesprawdzono', short: '—', activeClass: 'bg-slate-200 text-slate-800' },
  { id: 'ok', short: 'OK', activeClass: 'bg-emerald-600 text-white' },
  { id: 'uwaga', short: 'Uwaga', activeClass: 'bg-amber-500 text-white' },
  { id: 'usterka', short: 'Usterka', activeClass: 'bg-red-600 text-white' },
  { id: 'nd', short: 'N/D', activeClass: 'bg-slate-700 text-white' },
];

export const RepairWorkbenchView: React.FC<RepairWorkbenchViewProps> = ({
  ticket,
  result,
  partsCatalog,
  serviceRates,
  suppliers,
  settings,
  knownClients,
  onChange,
  onAddCatalogPart,
  onClearFields,
  onSaveAsNew,
  onUpdateExisting,
  onAddToQuote,
  onOpenQuote,
  onOpenSettings,
  onNotify,
}) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [emailPasteOpen, setEmailPasteOpen] = useState(false);
  const [emailRawText, setEmailRawText] = useState('');
  const [isParsingEmail, setIsParsingEmail] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [voiceError, setVoiceError] = useState<string | null>(null);

  const [partUrlOpen, setPartUrlOpen] = useState(false);
  const [partUrlInput, setPartUrlInput] = useState('');
  const [savePartToWarehouse, setSavePartToWarehouse] = useState(true);
  const [isImportingPartUrl, setIsImportingPartUrl] = useState(false);
  const [partUrlError, setPartUrlError] = useState<string | null>(null);
  const partUrlFetchingRef = useRef(false);

  const [selectedCatalogPartId, setSelectedCatalogPartId] = useState(
    partsCatalog[0]?.id || ''
  );
  const [selectedServiceId, setSelectedServiceId] = useState(
    serviceRates[0]?.id || ''
  );

  const [clientOpen, setClientOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [printModalMode, setPrintModalMode] = useState<'hangtag' | 'certificate' | null>(
    null
  );
  const [previewPhoto, setPreviewPhoto] = useState<AttachmentImage | null>(null);
  const [emailLang, setEmailLang] = useState<QuoteLanguage>('pl');
  const [leadTimeIndex, setLeadTimeIndex] = useState(1);
  const [customEmailBody, setCustomEmailBody] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    setCustomEmailBody(null);
  }, [ticket.editingOrderId]);

  useEffect(() => {
    if (
      partsCatalog.length > 0 &&
      !partsCatalog.some((p) => p.id === selectedCatalogPartId)
    ) {
      setSelectedCatalogPartId(partsCatalog[0].id);
    }
  }, [partsCatalog, selectedCatalogPartId]);

  useEffect(() => {
    if (
      serviceRates.length > 0 &&
      !serviceRates.some((s) => s.id === selectedServiceId)
    ) {
      setSelectedServiceId(serviceRates[0].id);
    }
  }, [serviceRates, selectedServiceId]);

  const handleClearClick = () => {
    setCustomEmailBody(null);
    onClearFields();
  };

  const updateField = <K extends keyof RepairTicketInput>(
    key: K,
    value: RepairTicketInput[K]
  ) => {
    onChange({ ...ticket, [key]: value });
  };

  const updateChrono = (
    patch: Partial<RepairTicketInput['chrono']>
  ) => {
    const nextChrono = { ...ticket.chrono, ...patch };
    nextChrono.beforeJoule = computeJouleFromFps(
      nextChrono.beforeFps,
      nextChrono.bbWeightGrams
    );
    nextChrono.afterJoule = computeJouleFromFps(
      nextChrono.afterFps,
      nextChrono.bbWeightGrams
    );
    updateField('chrono', nextChrono);
  };

  const toggleAccessory = (label: string) => {
    const current = ticket.intakeAccessories || [];
    const exists = current.includes(label);
    const next = exists
      ? current.filter((item) => item !== label)
      : [...current, label];
    updateField('intakeAccessories', next);
  };

  const updateInternalSpecs = (patch: Partial<ReplicaInternalSpecs>) => {
    const base = ticket.internalSpecs || createEmptyInternalSpecs();
    updateField('internalSpecs', { ...base, ...patch });
  };

  const handleQaToggle = (qaId: string) => {
    const current =
      ticket.qaChecklist && ticket.qaChecklist.length > 0
        ? ticket.qaChecklist
        : createDefaultQaChecklist();
    updateField(
      'qaChecklist',
      current.map((item) =>
        item.id === qaId ? { ...item, done: !item.done } : item
      )
    );
  };

  const handleDiagnosticChange = (
    checkId: string,
    patch: Partial<{ state: DiagnosticState; note: string }>
  ) => {
    updateField(
      'diagnosticChecks',
      ticket.diagnosticChecks.map((c) => (c.id === checkId ? { ...c, ...patch } : c))
    );
  };

  const handleAddPartFromCatalog = (catalogId: string) => {
    const found = partsCatalog.find((p) => p.id === catalogId);
    if (!found) return;
    const newPart: RepairPartItem = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      catalogId: found.id,
      name: found.name,
      category: found.category,
      supplier: found.supplier,
      productUrl: found.productUrl || '',
      quantity: 1,
      purchaseUnitCost: found.defaultPurchaseCost,
      clientUnitPrice: found.defaultClientPrice,
      purchaseStatus: 'do_zamowienia',
      orderRef: '',
      note: '',
    };
    updateField('parts', [...ticket.parts, newPart]);
    onNotify(`Dodano część: ${found.name}`);
  };

  const handleAddCustomPart = () => {
    const newPart: RepairPartItem = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: '',
      category: 'Gearbox / Napęd',
      supplier: suppliers[0] || 'Taiwangun',
      productUrl: '',
      quantity: 1,
      purchaseUnitCost: 0,
      clientUnitPrice: 0,
      purchaseStatus: 'do_zamowienia',
      orderRef: '',
      note: '',
    };
    updateField('parts', [...ticket.parts, newPart]);
  };

  const handleImportPartFromUrl = async (rawUrlOverride?: string) => {
    const targetUrl = (rawUrlOverride ?? partUrlInput).trim();
    if (!targetUrl || partUrlFetchingRef.current) return;

    partUrlFetchingRef.current = true;
    setIsImportingPartUrl(true);
    setPartUrlError(null);

    try {
      const parsed = await parsePartFromUrl(targetUrl, suppliers);
      const purchaseCost =
        parsed.purchaseCostPln !== null ? Math.max(0, parsed.purchaseCostPln) : 0;
      const clientPrice =
        purchaseCost > 0
          ? Math.round(purchaseCost * (1 + settings.defaultPartsMarkupPercent / 100))
          : 0;
      const catalogId =
        savePartToWarehouse && onAddCatalogPart
          ? `part-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
          : undefined;

      if (catalogId && onAddCatalogPart) {
        onAddCatalogPart({
          id: catalogId,
          name: parsed.name,
          category: parsed.category,
          supplier: parsed.supplier,
          productUrl: parsed.productUrl,
          defaultPurchaseCost: purchaseCost,
          defaultClientPrice: clientPrice,
          stockQty: 0,
          ...(parsed.notes ? { notes: parsed.notes } : {}),
        });
      }

      const newPart: RepairPartItem = {
        id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        ...(catalogId ? { catalogId } : {}),
        name: parsed.name,
        category: parsed.category,
        supplier: parsed.supplier,
        productUrl: parsed.productUrl,
        quantity: 1,
        purchaseUnitCost: purchaseCost,
        clientUnitPrice: clientPrice,
        purchaseStatus: 'do_zamowienia',
        orderRef: '',
        note: parsed.notes,
      };
      updateField('parts', [...ticket.parts, newPart]);
      setPartUrlInput('');
      setPartUrlOpen(false);
      onNotify(
        purchaseCost > 0
          ? `Dodano z linku: ${parsed.name}`
          : `Dodano z linku: ${parsed.name} (uzupełnij cenę zakupu)`
      );
    } catch (err: unknown) {
      setPartUrlError(
        err instanceof Error
          ? err.message
          : 'Nie udało się pobrać danych części z podanego linku.'
      );
    } finally {
      partUrlFetchingRef.current = false;
      setIsImportingPartUrl(false);
    }
  };

  const handleUpdatePart = (id: string, patch: Partial<RepairPartItem>) => {
    updateField(
      'parts',
      ticket.parts.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (
          patch.purchaseUnitCost !== undefined &&
          p.clientUnitPrice === 0 &&
          settings.defaultPartsMarkupPercent >= 0
        ) {
          next.clientUnitPrice =
            Math.round(
              patch.purchaseUnitCost *
                (1 + settings.defaultPartsMarkupPercent / 100) *
                100
            ) / 100;
        }
        return next;
      })
    );
  };

  const handleRemovePart = (id: string) => {
    updateField(
      'parts',
      ticket.parts.filter((p) => p.id !== id)
    );
  };

  const handleAddServiceFromCatalog = (serviceId: string) => {
    const srv = serviceRates.find((s) => s.id === serviceId);
    if (!srv) return;
    const task: LaborTaskItem = {
      id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      serviceId: srv.id,
      name: srv.name,
      hours: srv.defaultHours,
      hourlyRate: settings.defaultTechHourlyRate,
      fixedPrice: srv.fixedPrice,
      useFixedPrice: srv.useFixedPrice,
    };
    updateField('laborTasks', [...ticket.laborTasks, task]);
  };

  const handleAddCustomLabor = () => {
    const task: LaborTaskItem = {
      id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: 'Prace serwisowe / regulacja',
      hours: 1,
      hourlyRate: settings.defaultTechHourlyRate,
      fixedPrice: settings.defaultTechHourlyRate,
      useFixedPrice: false,
    };
    updateField('laborTasks', [...ticket.laborTasks, task]);
  };

  const handleUpdateLabor = (id: string, patch: Partial<LaborTaskItem>) => {
    updateField(
      'laborTasks',
      ticket.laborTasks.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  };

  const handleRemoveLabor = (id: string) => {
    updateField(
      'laborTasks',
      ticket.laborTasks.filter((l) => l.id !== id)
    );
  };

  const handleAddDiagnosticPhotos = async (files: File[]) => {
    const current = ticket.attachments || [];
    const remaining = Math.max(0, 6 - current.length);
    if (remaining === 0) {
      onNotify('Maksymalnie 6 zdjęć diagnostycznych w jednym zleceniu.');
      return;
    }
    const batch = files.slice(0, remaining);
    const created: AttachmentImage[] = [];
    for (let i = 0; i < batch.length; i++) {
      try {
        const idx = current.length + i + 1;
        const att = await compressImageFileToAttachment(
          batch[i],
          idx === 1 ? 'Zdjęcie diagnostyki / usterki' : `Diagnostyka #${idx}`
        );
        created.push(att);
      } catch {
        onNotify('Nie udało się wczytać zdjęcia ze schowka.');
      }
    }
    if (created.length > 0) {
      updateField('attachments', [...current, ...created]);
      onNotify('Dodano zdjęcie diagnostyczne do zlecenia.');
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isTextField =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement;
      const hasPlainText =
        (e.clipboardData?.getData('text/plain') || '').trim().length > 0;
      if (isTextField && hasPlainText) return;
      const images = extractClipboardImages(e.clipboardData);
      if (images.length > 0) {
        e.preventDefault();
        void handleAddDiagnosticPhotos(images);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const handleParseClientEmail = async () => {
    if (!emailRawText.trim()) return;
    setIsParsingEmail(true);
    setParseError(null);
    try {
      const resp = await fetch('/api/parse-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailText: emailRawText,
          partsCatalog: partsCatalog.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            supplier: p.supplier,
          })),
        }),
      });
      const json = (await resp.json()) as { data?: ParsedAiEmail; error?: string };
      if (!resp.ok || !json.data) {
        throw new Error(json.error || 'Błąd analizy wiadomości.');
      }

      const d = json.data;
      const matchedParts: RepairPartItem[] = (d.suggestedCatalogPartIds || [])
        .map((cid) => partsCatalog.find((p) => p.id === cid))
        .filter((p): p is PartsCatalogItem => Boolean(p))
        .map((p, idx) => ({
          id: `ai-part-${Date.now()}-${idx}`,
          catalogId: p.id,
          name: p.name,
          category: p.category,
          supplier: p.supplier,
          productUrl: p.productUrl || '',
          quantity: 1,
          purchaseUnitCost: p.defaultPurchaseCost,
          clientUnitPrice: p.defaultClientPrice,
          purchaseStatus: 'do_zamowienia',
        }));

      onChange({
        ...ticket,
        serviceScope: d.serviceScope || ticket.serviceScope,
        projectName: d.projectName || ticket.projectName,
        replicaBrand: d.replicaBrand || ticket.replicaBrand,
        replicaModel: d.replicaModel || ticket.replicaModel,
        driveType: d.driveType || ticket.driveType,
        reportedFault: d.reportedFault || ticket.reportedFault,
        prioritySurchargePercent: d.isExpressPriority ? 25 : 0,
        clientName: d.clientName || ticket.clientName,
        clientContact: d.clientContact || ticket.clientContact,
        clientDeliveryInfo: d.clientDeliveryInfo || ticket.clientDeliveryInfo,
        orderSource: d.orderSource || ticket.orderSource,
        technicalNotes: d.technicalNotes || ticket.technicalNotes,
        chrono: {
          ...ticket.chrono,
          targetFps: d.targetFps && d.targetFps > 0 ? d.targetFps : ticket.chrono.targetFps,
        },
        parts: matchedParts.length > 0 ? [...ticket.parts, ...matchedParts] : ticket.parts,
      });

      if (d.detectedLanguage === 'ukr') setEmailLang('ukr');
      else setEmailLang('pl');

      setEmailPasteOpen(false);
      setClientOpen(true);
      onNotify('Uzupełniono dane repliki i usterki na podstawie wiadomości klienta.');
    } catch (err: unknown) {
      setParseError(
        err instanceof Error ? err.message : 'Nie udało się przeanalizować wiadomości.'
      );
    } finally {
      setIsParsingEmail(false);
    }
  };

  const activeLeadTime =
    DEFAULT_LEAD_TIMES[emailLang][leadTimeIndex] ??
    DEFAULT_LEAD_TIMES[emailLang][1];

  const generatedEmail = useMemo(
    () =>
      buildSingleRepairEmailReply({
        lang: emailLang,
        ticket,
        result,
        leadTime: activeLeadTime,
        companyName: settings.companyName,
      }),
    [emailLang, ticket, result, activeLeadTime, settings.companyName]
  );

  const displayedEmail = customEmailBody ?? generatedEmail;

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(displayedEmail);
      setCopiedEmail(true);
      onNotify(
        emailLang === 'pl'
          ? 'Skopiowano kosztorys e-mail (PL) do schowka.'
          : 'Скопійовано лист з кошторисом (UKR) у буфер обміну.'
      );
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      onNotify('Nie udało się skopiować treści.');
    }
  };

  const mailtoHref = `mailto:${encodeURIComponent(
    ticket.clientContact.includes('@') ? ticket.clientContact : ''
  )}?subject=${encodeURIComponent(
    emailLang === 'pl'
      ? `Diagnostyka i kosztorys serwisu — ${formatReplicaLabel(ticket)}`
      : `Діагностика та кошторис сервісу — ${formatReplicaLabel(ticket)}`
  )}&body=${encodeURIComponent(displayedEmail)}`;

  const targetJouleEstimate = computeJouleFromFps(
    ticket.chrono.targetFps,
    ticket.chrono.bbWeightGrams
  );

  const beforeSeriesStats = useMemo(
    () =>
      parseChronoSeries(
        ticket.chrono.beforeSeries,
        ticket.chrono.bbWeightGrams
      ),
    [ticket.chrono.beforeSeries, ticket.chrono.bbWeightGrams]
  );

  const afterSeriesStats = useMemo(
    () =>
      parseChronoSeries(
        ticket.chrono.afterSeries,
        ticket.chrono.bbWeightGrams
      ),
    [ticket.chrono.afterSeries, ticket.chrono.bbWeightGrams]
  );

  const specs = ticket.internalSpecs || createEmptyInternalSpecs();
  const qaItems =
    ticket.qaChecklist && ticket.qaChecklist.length > 0
      ? ticket.qaChecklist
      : [];
  const qaDoneCount = qaItems.filter((q) => q.done).length;

  const faultyChecksCount = ticket.diagnosticChecks.filter(
    (c) => c.state === 'usterka' || c.state === 'uwaga'
  ).length;

  return (
    <>
    <div className={`space-y-4 ${printModalMode ? 'no-print' : ''}`}>
      {ticket.editingOrderId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 font-semibold text-amber-950">
            <span>Edytujesz zlecenie: {formatReplicaLabel(ticket)}</span>
            <InfoTooltip text="Zmiany w diagnostyce, częściach i etapie procesu zapiszesz przyciskiem 'Zapisz zmiany w zleceniu' w panelu po prawej." />
          </div>
          <button
            type="button"
            onClick={handleClearClick}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/60"
          >
            Nowe zlecenie
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
        {/* LEFT WORKBENCH: Process + Replica + Diagnostics + Parts + Labor */}
        <div className="space-y-5 xl:col-span-8">
          {/* 1. Process Stage & Replica Card */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base font-bold text-slate-900">
                  Karta repliki i przyjęcie
                </h1>
                <InfoTooltip text="Wybierz aktualny etap procesu naprawy, uzupełnij model repliki lub wklej wiadomość od klienta do analizy AI." />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintModalMode('hangtag')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00]"
                >
                  <Printer className="h-3.5 w-3.5 text-[#b86d00]" />
                  Zawieszka / Karta buildu
                </button>
                <button
                  type="button"
                  onClick={() => setEmailPasteOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#e88a00] hover:text-[#b86d00]"
                >
                  <Inbox className="h-3.5 w-3.5 text-[#e88a00]" />
                  Wklej wiadomość klienta (AI)
                </button>
                <button
                  type="button"
                  onClick={handleClearClick}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-stone-50 hover:text-slate-900"
                  title="Wyczyść formularz"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Wyczyść
                </button>
              </div>
            </div>

            {emailPasteOpen && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Analiza wiadomości od klienta (PL / UKR / EN)
                  </span>
                  <button
                    type="button"
                    onClick={() => setEmailPasteOpen(false)}
                    className="text-xs text-slate-400 hover:text-slate-700"
                  >
                    Zamknij
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={emailRawText}
                  onChange={(e) => setEmailRawText(e.target.value)}
                  placeholder="Wklej wiadomość z OLX, Messengera, Allegro lub e-maila (np. 'Cześć, mam Specna Arms SA-E07, przestała strzelać na semi, chcę też przegląd i Perun V2...')"
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
                {parseError && (
                  <p className="text-xs text-red-600">{parseError}</p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isParsingEmail || !emailRawText.trim()}
                    onClick={handleParseClientEmail}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#e88a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#cf7b00] disabled:opacity-50"
                  >
                    {isParsingEmail && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Wypełnij kartę repliki
                  </button>
                </div>
              </div>
            )}

            {/* 7-Stage Process Stepper */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Etap procesu serwisowego
              </label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
                {REPAIR_STAGE_ORDER.map((stage, idx) => {
                  const active = ticket.stage === stage;
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => updateField('stage', stage)}
                      className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors ${
                        active
                          ? 'border-[#e88a00] bg-amber-50 text-slate-900 font-semibold'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-[10px] text-slate-400">
                        Etap {idx + 1}
                      </span>
                      <span className="block truncate">
                        {REPAIR_STAGE_LABELS[stage]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Service Scope */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Specjalizacja / rodzaj zlecenia
              </label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(Object.keys(SERVICE_SCOPE_LABELS) as ServiceScope[]).map(
                  (scope) => {
                    const active = ticket.serviceScope === scope;
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => updateField('serviceScope', scope)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {SERVICE_SCOPE_LABELS[scope]}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Replica Specs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-700">
                  Producent / Marka
                </label>
                <input
                  type="text"
                  value={ticket.replicaBrand}
                  onChange={(e) => updateField('replicaBrand', e.target.value)}
                  placeholder="np. Specna Arms, Cyma, LCT"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-slate-700">
                  Model / Platforma repliki
                </label>
                <input
                  type="text"
                  value={ticket.replicaModel}
                  onChange={(e) => updateField('replicaModel', e.target.value)}
                  placeholder="np. SA-E07 Edge / AK-74M / MK18"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700">
                  Napęd
                </label>
                <select
                  value={ticket.driveType}
                  onChange={(e) =>
                    updateField('driveType', e.target.value as DriveType)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                >
                  <option value="AEG">AEG</option>
                  <option value="HPA">HPA</option>
                  <option value="GBB">GBB</option>
                  <option value="CO2">CO2</option>
                  <option value="Spring">Spring</option>
                  <option value="Inny">Inny</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-700">
                  Tytuł zlecenia / cel prac
                </label>
                <input
                  type="text"
                  value={ticket.projectName}
                  onChange={(e) => updateField('projectName', e.target.value)}
                  placeholder="np. Naprawa napędu + Perun V2 + R-Hop"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">
                  Nr seryjny / znak
                </label>
                <input
                  type="text"
                  value={ticket.serialOrMarking}
                  onChange={(e) => updateField('serialOrMarking', e.target.value)}
                  placeholder="Opcjonalnie"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700">
                  Potrzebna na dzień / grę
                </label>
                <input
                  type="date"
                  value={ticket.targetReadyDate || ''}
                  onChange={(e) => updateField('targetReadyDate', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700">
                  Uwagi przy przyjęciu
                </label>
                <input
                  type="text"
                  value={ticket.intakeCondition}
                  onChange={(e) => updateField('intakeCondition', e.target.value)}
                  placeholder="np. Rysy na body, brak dekla"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
              </div>
            </div>

            {/* Intake Accessories Checklist */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-600">
                  Przyjęte akcesoria
                </span>
                <InfoTooltip text="Zaznacz dodatki zostawione z repliką (magazynek, bateria, tłumik, kolimator), żeby nic nie zginęło przy odbiorze." />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {INTAKE_ACCESSORY_OPTIONS.map((acc) => {
                  const selected = (ticket.intakeAccessories || []).includes(acc);
                  return (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => toggleAccessory(acc)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                        selected
                          ? 'border-[#e88a00] bg-amber-50 text-slate-900 font-semibold'
                          : 'border-stone-200 bg-white text-slate-600 hover:bg-stone-50'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3 text-[#b86d00]" />}
                      {acc}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Collapsible Internal Replica Specs & ETU Settings */}
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSpecsOpen((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                <span className="text-left">
                  Wymiary wewnętrzne i ustawienia ETU / Mosfet
                  <span className="ml-2 font-normal text-slate-500">
                    ({[
                      specs.gearboxVersion,
                      specs.nozzleLengthMm ? `dysza ${specs.nozzleLengthMm}` : null,
                      specs.innerBarrelMm ? `lufa ${specs.innerBarrelMm}` : null,
                      specs.testBattery || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')})
                  </span>
                </span>
                {specsOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                )}
              </button>

              {specsOpen && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-600">
                      Standard Gearbox / Baza
                    </label>
                    <select
                      value={specs.gearboxVersion}
                      onChange={(e) =>
                        updateInternalSpecs({ gearboxVersion: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    >
                      <option value="V2">Gearbox V2 (M4/AR15/MP5)</option>
                      <option value="V3">Gearbox V3 (AK/G36/AUG)</option>
                      <option value="V2.5 / SR25">Gearbox V2.5 / SR25</option>
                      <option value="V6">Gearbox V6 (P90/Thompson)</option>
                      <option value="V7">Gearbox V7 (M14)</option>
                      <option value="Ares / Specyficzny">Ares EFCS / Specyficzny</option>
                      <option value="HPA / GBB">Układ HPA / GBB</option>
                      <option value="Sprężynowy">Czterotakt / Sprężyna</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600">
                      Dysza (mm)
                    </label>
                    <input
                      type="text"
                      value={specs.nozzleLengthMm}
                      onChange={(e) =>
                        updateInternalSpecs({ nozzleLengthMm: e.target.value })
                      }
                      placeholder="np. 21.4 mm"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600">
                      Lufa wewn. (mm)
                    </label>
                    <input
                      type="text"
                      value={specs.innerBarrelMm}
                      onChange={(e) =>
                        updateInternalSpecs({ innerBarrelMm: e.target.value })
                      }
                      placeholder="np. 363 mm"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600">
                      Typ cylindra
                    </label>
                    <input
                      type="text"
                      value={specs.cylinderType}
                      onChange={(e) =>
                        updateInternalSpecs({ cylinderType: e.target.value })
                      }
                      placeholder="np. Typ 1 / Pełny"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600">
                      Łożyska (mm)
                    </label>
                    <input
                      type="text"
                      value={specs.bearingsMm}
                      onChange={(e) =>
                        updateInternalSpecs({ bearingsMm: e.target.value })
                      }
                      placeholder="np. 8 mm"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-600">
                      Bateria testowa / zasilanie
                    </label>
                    <input
                      type="text"
                      value={specs.testBattery}
                      onChange={(e) =>
                        updateInternalSpecs({ testBattery: e.target.value })
                      }
                      placeholder="np. 11.1V LiPo 25C / HPA 95 PSI"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <label className="block text-[11px] font-medium text-slate-600">
                      Ustawienia ETU / Mosfet (Perun, Gate, FCU)
                    </label>
                    <input
                      type="text"
                      value={specs.etuSettings}
                      onChange={(e) =>
                        updateInternalSpecs({ etuSettings: e.target.value })
                      }
                      placeholder="np. AB: ON, Pre-cocking: Poziom 2, Czułość spustu: 2/5, Dwell: 18 ms"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Client Card */}
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setClientOpen((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                <span>
                  Dane klienta i wysyłki
                  {ticket.clientName && (
                    <span className="ml-2 font-normal text-slate-500">
                      ({ticket.clientName}
                      {ticket.clientContact ? ` · ${ticket.clientContact}` : ''})
                    </span>
                  )}
                </span>
                {clientOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {clientOpen && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Klient (imię / ksywka / team)
                    </label>
                    <input
                      type="text"
                      list="known-airsoft-clients"
                      value={ticket.clientName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = knownClients.find(
                          (c) => c.clientName.toLowerCase() === val.trim().toLowerCase()
                        );
                        if (match) {
                          onChange({
                            ...ticket,
                            clientName: match.clientName,
                            clientContact: ticket.clientContact || match.clientContact,
                            clientDeliveryInfo:
                              ticket.clientDeliveryInfo || match.clientDeliveryInfo,
                            orderSource: ticket.orderSource || match.orderSource,
                          });
                        } else {
                          updateField('clientName', val);
                        }
                      }}
                      placeholder="np. Jan Kowalski / Team Alfa"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                    <datalist id="known-airsoft-clients">
                      {knownClients.map((c) => (
                        <option key={c.clientName} value={c.clientName} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Telefon / E-mail / Messenger
                    </label>
                    <input
                      type="text"
                      value={ticket.clientContact}
                      onChange={(e) => updateField('clientContact', e.target.value)}
                      placeholder="np. 600 123 456 / mail@..."
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Paczkomat InPost / Adres zwrotny / NIP
                    </label>
                    <input
                      type="text"
                      value={ticket.clientDeliveryInfo}
                      onChange={(e) =>
                        updateField('clientDeliveryInfo', e.target.value)
                      }
                      placeholder="np. InPost WAW123M lub odbiór osobisty"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Źródło zgłoszenia
                    </label>
                    <select
                      value={ticket.orderSource}
                      onChange={(e) => updateField('orderSource', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                    >
                      <option value="E-mail">E-mail</option>
                      <option value="Social Media">Facebook / Messenger / IG</option>
                      <option value="OLX">OLX</option>
                      <option value="Allegro">Allegro</option>
                      <option value="Telefon / SMS">Telefon / SMS</option>
                      <option value="Odbiór lokalny">Odbiór lokalny / Strzelanka</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 2. Fault Diagnostics & Chrono Telemetry */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Diagnostyka usterki i pomiary chrono
                </h2>
                <InfoTooltip text="Zapisz objawy zgłoszone przez gracza, sprawdź 7 układów repliki na stole i zmierz FPS/J przed oraz po serwisie." />
              </div>
              {faultyChecksCount > 0 && (
                <span className="text-xs font-semibold text-red-600 tabular-nums">
                  Wykryto {faultyChecksCount}{' '}
                  {faultyChecksCount === 1 ? 'problem' : 'problemy'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="block text-xs font-medium text-slate-700">
                      Objawy zgłoszone przez klienta
                    </label>
                    <InfoTooltip text="Wpisz opis awarii lub kliknij Nagraj głosem, aby podyktować usterkę przez mikrofon." />
                  </div>
                  <VoiceDictationButton
                    context="reportedFault"
                    onTranscript={(spoken) => {
                      setVoiceError(null);
                      const prev = ticket.reportedFault.trim();
                      updateField(
                        'reportedFault',
                        prev ? `${prev}\n${spoken}` : spoken
                      );
                      onNotify('Dodano głosowy opis usterki.');
                    }}
                    onError={(msg) => setVoiceError(msg)}
                  />
                </div>
                <textarea
                  rows={3}
                  value={ticket.reportedFault}
                  onChange={(e) => updateField('reportedFault', e.target.value)}
                  placeholder="np. Silnik kręci ale tłok stoi, brak podawania na semi, spadek FPS poniżej 300..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Diagnoza techniczna serwisu (przyczyna usterki)
                  </label>
                  <VoiceDictationButton
                    context="diagnosisSummary"
                    onTranscript={(spoken) => {
                      setVoiceError(null);
                      const prev = ticket.diagnosisSummary.trim();
                      updateField(
                        'diagnosisSummary',
                        prev ? `${prev}\n${spoken}` : spoken
                      );
                      onNotify('Dodano głosową diagnozę serwisu.');
                    }}
                    onError={(msg) => setVoiceError(msg)}
                  />
                </div>
                <textarea
                  rows={3}
                  value={ticket.diagnosisSummary}
                  onChange={(e) =>
                    updateField('diagnosisSummary', e.target.value)
                  }
                  placeholder="np. Zerwane pierwsze 3 zęby tłoka, nieszczelny o-ring głowicy tłoka, spalone styki spustu..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
              </div>
            </div>
            {voiceError && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span>{voiceError}</span>
                <button
                  type="button"
                  onClick={() => setVoiceError(null)}
                  className="text-red-500 hover:text-red-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* 7-Subsystem Diagnostic Checklist */}
            <div>
              <h3 className="text-xs font-semibold text-slate-800 mb-2">
                Przegląd układów repliki (karta diagnostyczna)
              </h3>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {ticket.diagnosticChecks.map((chk) => (
                  <div
                    key={chk.id}
                    className="flex flex-col gap-2 p-2.5 sm:p-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-900">
                        {chk.subsystem}
                      </p>
                      <input
                        type="text"
                        value={chk.note}
                        onChange={(e) =>
                          handleDiagnosticChange(chk.id, { note: e.target.value })
                        }
                        placeholder="Uwagi serwisanta (np. luz na zębatce tłokowej, nieszczelna dysza)..."
                        className="mt-1 w-full rounded border border-slate-200/80 bg-slate-50/50 px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-[#e88a00] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div
                      className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 shrink-0"
                      role="group"
                      aria-label={chk.subsystem}
                    >
                      {DIAGNOSTIC_OPTIONS.map((opt) => {
                        const isActive = chk.state === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              handleDiagnosticChange(chk.id, { state: opt.id })
                            }
                            title={DIAGNOSTIC_STATE_LABELS[opt.id]}
                            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                              isActive
                                ? opt.activeClass
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {opt.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chrono Telemetry */}
            <div className="rounded-lg bg-stone-50 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Pomiary Chronografu (FPS / J / RPS)
                </span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-600">Kulki:</span>
                  <InfoTooltip text="Masa kulek używana do przeliczania energii (J) ze zmierzonej prędkości (FPS)." />
                  <select
                    value={ticket.chrono.bbWeightGrams}
                    onChange={(e) =>
                      updateChrono({
                        bbWeightGrams: parseFloat(e.target.value) || 0.2,
                      })
                    }
                    className="rounded-md border border-stone-200 bg-white px-2 py-1 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  >
                    <option value={0.2}>0.20 g</option>
                    <option value={0.25}>0.25 g</option>
                    <option value={0.28}>0.28 g</option>
                    <option value={0.3}>0.30 g</option>
                    <option value={0.32}>0.32 g</option>
                    <option value={0.36}>0.36 g</option>
                    <option value={0.4}>0.40 g</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Przed: FPS
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={ticket.chrono.beforeFps || ''}
                    onChange={(e) =>
                      updateChrono({ beforeFps: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                  <span className="mt-0.5 block font-mono text-[10px] text-slate-500 tabular-nums">
                    {ticket.chrono.beforeJoule.toFixed(2)} J
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Przed: RPS
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={ticket.chrono.beforeRps || ''}
                    onChange={(e) =>
                      updateChrono({ beforeRps: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Cel klienta: FPS
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={ticket.chrono.targetFps || ''}
                    onChange={(e) =>
                      updateChrono({ targetFps: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="400"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                  <span className="mt-0.5 block font-mono text-[10px] text-slate-500 tabular-nums">
                    {targetJouleEstimate.toFixed(2)} J
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Po serwisie: FPS
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={ticket.chrono.afterFps || ''}
                    onChange={(e) =>
                      updateChrono({ afterFps: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-emerald-700 tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                  <span className="mt-0.5 block font-mono text-[10px] font-medium text-emerald-700 tabular-nums">
                    {ticket.chrono.afterJoule.toFixed(2)} J
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Po serwisie: RPS
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={ticket.chrono.afterRps || ''}
                    onChange={(e) =>
                      updateChrono({ afterRps: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-emerald-700 tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                </div>
              </div>

              {ticket.chrono.afterFps > 0 &&
                ticket.chrono.targetFps > 0 &&
                ticket.chrono.afterFps > ticket.chrono.targetFps + 10 && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 tabular-nums">
                    Uwaga: pomiar po serwisie ({ticket.chrono.afterFps} FPS) przekracza limit celu ({ticket.chrono.targetFps} FPS) o +
                    {ticket.chrono.afterFps - ticket.chrono.targetFps} FPS.
                  </div>
                )}

              {/* Shot-to-shot chrono series & spread */}
              <div className="grid grid-cols-1 gap-3 border-t border-stone-200/80 pt-3 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-medium text-slate-600">
                      Seria PRZED (FPS)
                    </label>
                    {beforeSeriesStats && (
                      <button
                        type="button"
                        onClick={() =>
                          updateChrono({ beforeFps: beforeSeriesStats.avgFps })
                        }
                        className="text-[10px] font-semibold text-[#b86d00] hover:underline"
                      >
                        Użyj średniej ({beforeSeriesStats.avgFps} FPS)
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={ticket.chrono.beforeSeries || ''}
                    onChange={(e) =>
                      updateChrono({ beforeSeries: e.target.value })
                    }
                    placeholder="np. 342, 349, 336, 345, 340"
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                  {beforeSeriesStats && (
                    <p className="mt-1 font-mono text-[10px] text-slate-500 tabular-nums">
                      Śr. {beforeSeriesStats.avgFps} FPS ({beforeSeriesStats.avgJoule.toFixed(2)} J) ·{' '}
                      {beforeSeriesStats.minFps}–{beforeSeriesStats.maxFps} · Δ{' '}
                      {beforeSeriesStats.spreadFps} FPS
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-medium text-slate-600">
                      Seria PO serwisie (FPS)
                    </label>
                    {afterSeriesStats && (
                      <button
                        type="button"
                        onClick={() =>
                          updateChrono({ afterFps: afterSeriesStats.avgFps })
                        }
                        className="text-[10px] font-semibold text-emerald-700 hover:underline"
                      >
                        Użyj średniej ({afterSeriesStats.avgFps} FPS)
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={ticket.chrono.afterSeries || ''}
                    onChange={(e) =>
                      updateChrono({ afterSeries: e.target.value })
                    }
                    placeholder="np. 401, 402, 400, 401, 402"
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono text-xs font-medium text-emerald-800 tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                  {afterSeriesStats && (
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
                      <span className="text-emerald-700">
                        Śr. {afterSeriesStats.avgFps} FPS ({afterSeriesStats.avgJoule.toFixed(2)} J) ·{' '}
                        {afterSeriesStats.minFps}–{afterSeriesStats.maxFps}
                      </span>
                      <span>·</span>
                      <span
                        className={
                          afterSeriesStats.spreadFps <= 3
                            ? 'font-semibold text-emerald-700'
                            : afterSeriesStats.spreadFps <= 7
                            ? 'text-slate-600'
                            : 'font-semibold text-amber-700'
                        }
                      >
                        Δ {afterSeriesStats.spreadFps} FPS
                      </span>
                      <InfoTooltip text="Rozrzut ≤ 3 FPS: bardzo szczelny układ; 4–7 FPS: stabilny; > 7 FPS: sprawdź szczelność pneumatyki." />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Diagnostic Photos (Ctrl+V) */}
            <div className="border-t border-stone-100 pt-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">
                    Zdjęcia z diagnostyki
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    ({(ticket.attachments || []).length}/6)
                  </span>
                  <InfoTooltip text="Wklej zdjęcie ze schowka (Ctrl+V) lub dodaj z dysku (maks. 6 zdjęć z usterki albo chronografu)." />
                </div>
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) void handleAddDiagnosticPhotos(files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-[#e88a00]" />
                    Dodaj zdjęcie z dysku
                  </button>
                </div>
              </div>

              {(ticket.attachments || []).length > 0 && (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {(ticket.attachments || []).map((att) => (
                    <div
                      key={att.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-1.5"
                    >
                      <div className="relative h-24 overflow-hidden rounded bg-white">
                        <img
                          src={att.dataUrl}
                          alt={att.caption}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute right-1 top-1 flex gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto(att)}
                            className="rounded bg-slate-900/75 p-1 text-white hover:bg-slate-900"
                            title="Powiększ"
                          >
                            <Maximize2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateField(
                                'attachments',
                                (ticket.attachments || []).filter(
                                  (x) => x.id !== att.id
                                )
                              )
                            }
                            className="rounded bg-red-600/85 p-1 text-white hover:bg-red-700"
                            title="Usuń"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={att.caption}
                        onChange={(e) =>
                          updateField(
                            'attachments',
                            (ticket.attachments || []).map((x) =>
                              x.id === att.id
                                ? { ...x, caption: e.target.value }
                                : x
                            )
                          )
                        }
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-[#e88a00] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 3. Repair & Tuning Parts BOM + Procurement */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Części naprawcze i tuningowe
                </h2>
                <InfoTooltip text="Dodaj potrzebne części z katalogu lub ręcznie. Części oznaczone jako 'Do zamówienia' automatycznie trafiają do kolejki zakupowej." />
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-xs font-medium text-[#b86d00] hover:underline"
              >
                Edytuj katalog części
              </button>
            </div>

            {/* Quick Add Part Bar */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={selectedCatalogPartId}
                onChange={(e) => setSelectedCatalogPartId(e.target.value)}
                aria-label="Wybierz część z katalogu"
                className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
              >
                {partsCatalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.supplier} · zakup {formatPln(p.defaultPurchaseCost, 0)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleAddPartFromCatalog(selectedCatalogPartId)}
                disabled={!selectedCatalogPartId}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5 text-[#e88a00]" />
                Dodaj z katalogu
              </button>
              <button
                type="button"
                onClick={() => {
                  setPartUrlOpen((v) => !v);
                  setPartUrlError(null);
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  partUrlOpen
                    ? 'border-[#e88a00] bg-amber-50 text-amber-950 font-semibold'
                    : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50'
                }`}
              >
                <Link2 className="h-3.5 w-3.5 text-[#b86d00]" />
                Z linku (URL)
              </button>
              <button
                type="button"
                onClick={handleAddCustomPart}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-stone-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Własna część
              </button>
            </div>

            {partUrlOpen && (
              <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    Wklej link do części w sklepie (np. Taiwangun, Gunfire, SpecShop)
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={savePartToWarehouse}
                      onChange={(e) => setSavePartToWarehouse(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-stone-300 accent-[#e88a00]"
                    />
                    Zapisz też w magazynie części
                  </label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="url"
                    value={partUrlInput}
                    onChange={(e) => {
                      setPartUrlInput(e.target.value);
                      if (partUrlError) setPartUrlError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleImportPartFromUrl();
                      }
                    }}
                    onPaste={(e) => {
                      const pasted = (e.clipboardData.getData('text/plain') || '').trim();
                      if (/^https?:\/\//i.test(pasted) && !partUrlInput.trim()) {
                        setPartUrlInput(pasted);
                        e.preventDefault();
                        void handleImportPartFromUrl(pasted);
                      }
                    }}
                    placeholder="https://www.taiwangun.com/..."
                    disabled={isImportingPartUrl}
                    className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    disabled={isImportingPartUrl || !partUrlInput.trim()}
                    onClick={() => void handleImportPartFromUrl()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#e88a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#cf7b00] disabled:opacity-50 whitespace-nowrap"
                  >
                    {isImportingPartUrl ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Pobieram...
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        Pobierz i dodaj
                      </>
                    )}
                  </button>
                </div>
                {partUrlError && (
                  <p className="text-xs font-medium text-red-600">{partUrlError}</p>
                )}
              </div>
            )}

            {ticket.parts.length === 0 ? (
              <p className="rounded-lg bg-stone-50 px-4 py-2.5 text-xs text-slate-500">
                Brak przypisanych części.
              </p>
            ) : (
              <div className="space-y-3">
                {ticket.parts.map((part) => (
                  <div
                    key={part.id}
                    className="rounded-lg border border-stone-200 bg-stone-50/40 p-3 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 pb-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !part.suppliedByClient;
                          handleUpdatePart(part.id, {
                            suppliedByClient: nextVal,
                            ...(nextVal
                              ? {
                                  purchaseUnitCost: 0,
                                  clientUnitPrice: 0,
                                  purchaseStatus: 'na_miejscu',
                                }
                              : { purchaseStatus: 'do_zamowienia' }),
                          });
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          part.suppliedByClient
                            ? 'border-amber-300 bg-amber-50 text-amber-900 font-semibold'
                            : 'border-stone-200 bg-white text-slate-600 hover:bg-stone-50'
                        }`}
                      >
                        {part.suppliedByClient && (
                          <Check className="h-3 w-3 text-[#b86d00]" />
                        )}
                        {part.suppliedByClient
                          ? 'Część powierzona przez klienta (0 zł)'
                          : 'Oznacz jako część klienta'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemovePart(part.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Usuń część"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                      <div className="sm:col-span-6">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Nazwa części
                        </label>
                        <input
                          type="text"
                          value={part.name}
                          onChange={(e) =>
                            handleUpdatePart(part.id, { name: e.target.value })
                          }
                          placeholder="np. Dysza EPeS 21.4mm"
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#e88a00] focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Kategoria
                        </label>
                        <select
                          value={part.category}
                          onChange={(e) =>
                            handleUpdatePart(part.id, {
                              category: e.target.value as PartCategory,
                            })
                          }
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                        >
                          {PART_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Sklep / Dostawca
                        </label>
                        <select
                          value={part.supplier}
                          disabled={Boolean(part.suppliedByClient)}
                          onChange={(e) =>
                            handleUpdatePart(part.id, { supplier: e.target.value })
                          }
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#e88a00] focus:outline-none"
                        >
                          {Array.from(new Set([...suppliers, part.supplier])).map(
                            (sup) => (
                              <option key={sup} value={sup}>
                                {sup}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Ilość
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={part.quantity}
                          onChange={(e) =>
                            handleUpdatePart(part.id, {
                              quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Koszt zakupu (zł)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={Boolean(part.suppliedByClient)}
                          value={part.suppliedByClient ? 0 : part.purchaseUnitCost}
                          onChange={(e) =>
                            handleUpdatePart(part.id, {
                              purchaseUnitCost: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            })
                          }
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tabular-nums disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#e88a00] focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Cena dla klienta (zł)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={Boolean(part.suppliedByClient)}
                          value={part.suppliedByClient ? 0 : part.clientUnitPrice}
                          onChange={(e) =>
                            handleUpdatePart(part.id, {
                              clientUnitPrice: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            })
                          }
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs font-semibold text-slate-900 tabular-nums disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#e88a00] focus:outline-none"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-3">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Status zakupu części
                        </label>
                        {part.suppliedByClient ? (
                          <div className="mt-0.5 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-xs font-medium text-amber-900">
                            Powierzona przez klienta
                          </div>
                        ) : (
                          <select
                            value={part.purchaseStatus}
                            onChange={(e) =>
                              handleUpdatePart(part.id, {
                                purchaseStatus: e.target.value as PartPurchaseStatus,
                              })
                            }
                            className={`mt-0.5 w-full rounded-md border px-2 py-1.5 text-xs font-medium focus:outline-none ${
                              part.purchaseStatus === 'do_zamowienia'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : part.purchaseStatus === 'zamowione'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : part.purchaseStatus === 'na_miejscu'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-700'
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
                      </div>

                      <div className="col-span-2 sm:col-span-3">
                        <label className="block text-[10px] font-medium text-slate-500">
                          Link / Nr zamówienia
                        </label>
                        <div className="mt-0.5 flex items-center gap-1">
                          <input
                            type="text"
                            value={part.productUrl}
                            onChange={(e) =>
                              handleUpdatePart(part.id, {
                                productUrl: e.target.value,
                              })
                            }
                            placeholder="https://..."
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
                          />
                          {part.productUrl && (
                            <a
                              href={part.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md border border-slate-200 bg-white p-1.5 text-[#b86d00] hover:bg-slate-50 shrink-0"
                              title="Otwórz link do sklepu"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 4. Service Labor, Consumables & Surcharges */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Robocizna, materiały i priorytet
              </h2>
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-xs font-medium text-[#b86d00] hover:underline"
              >
                Edytuj cennik usług
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                aria-label="Wybierz usługę z cennika"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
              >
                {serviceRates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatPln(s.fixedPrice, 0)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleAddServiceFromCatalog(selectedServiceId)}
                disabled={!selectedServiceId}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5 text-[#e88a00]" />
                Dodaj usługę
              </button>
              <button
                type="button"
                onClick={handleAddCustomLabor}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Własna robocizna
              </button>
            </div>

            {ticket.laborTasks.length > 0 && (
              <div className="space-y-2">
                {ticket.laborTasks.map((task) => (
                  <div
                    key={task.id}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/40 p-2.5 sm:grid-cols-12 sm:items-center"
                  >
                    <div className="sm:col-span-6">
                      <input
                        type="text"
                        value={task.name}
                        onChange={(e) =>
                          handleUpdateLabor(task.id, { name: e.target.value })
                        }
                        aria-label="Nazwa usługi"
                        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#e88a00] focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <select
                        value={task.useFixedPrice ? 'fixed' : 'hourly'}
                        onChange={(e) =>
                          handleUpdateLabor(task.id, {
                            useFixedPrice: e.target.value === 'fixed',
                          })
                        }
                        aria-label="Tryb rozliczenia usługi"
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
                      >
                        <option value="fixed">Ryczałt</option>
                        <option value="hourly">Godziny</option>
                      </select>
                    </div>
                    {task.useFixedPrice ? (
                      <div className="sm:col-span-3">
                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={task.fixedPrice}
                          onChange={(e) =>
                            handleUpdateLabor(task.id, {
                              fixedPrice: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            })
                          }
                          aria-label="Kwota ryczałtu"
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-right font-mono text-xs font-semibold tabular-nums focus:border-[#e88a00] focus:outline-none"
                        />
                      </div>
                    ) : (
                      <div className="sm:col-span-3 flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={task.hours}
                          onChange={(e) =>
                            handleUpdateLabor(task.id, {
                              hours: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          aria-label="Liczba godzin"
                          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-500">h×</span>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={task.hourlyRate}
                          onChange={(e) =>
                            handleUpdateLabor(task.id, {
                              hourlyRate: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            })
                          }
                          aria-label="Stawka godzinowa"
                          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                        />
                      </div>
                    )}
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveLabor(task.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Usuń pozycję robocizny"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-slate-100 pt-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Materiały (smary, podkładki, cyna)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={ticket.extraMaterialsFlat}
                  onChange={(e) =>
                    updateField(
                      'extraMaterialsFlat',
                      Math.max(0, parseFloat(e.target.value) || 0)
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Opłata diagnostyczna (zł)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={ticket.diagnosticFee}
                  onChange={(e) =>
                    updateField(
                      'diagnosticFee',
                      Math.max(0, parseFloat(e.target.value) || 0)
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Ekspres przed grą (+%)
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  {[0, 20, 35].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => updateField('prioritySurchargePercent', pct)}
                      className={`flex-1 rounded-lg border py-2 font-mono text-xs font-medium tabular-nums ${
                        ticket.prioritySurchargePercent === pct
                          ? 'border-[#e88a00] bg-amber-50 text-slate-900 font-semibold'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pct === 0 ? 'Standard' : `+${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Notatki wewnętrzne serwisu
              </label>
              <input
                type="text"
                value={ticket.technicalNotes}
                onChange={(e) => updateField('technicalNotes', e.target.value)}
                placeholder="np. Klient prosi o ograniczenie na semi do 1.5J na kulkach 0.30g..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
              />
            </div>
          </section>

          {/* 5. Outgoing Final QA Checklist */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Kontrola jakości przed wydaniem
                </h2>
                <InfoTooltip text="Ostatnia weryfikacja przed spakowaniem repliki i starych części do paczki lub przekazaniem klientowi." />
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    qaDoneCount === qaItems.length && qaItems.length > 0
                      ? 'text-emerald-700'
                      : 'text-slate-600'
                  }`}
                >
                  {qaDoneCount}/{qaItems.length} sprawdzonych
                </span>
                {qaItems.length === 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateField('qaChecklist', createDefaultQaChecklist())
                    }
                    className="text-xs font-medium text-[#b86d00] hover:underline"
                  >
                    Załaduj checklistę
                  </button>
                )}
              </div>
            </div>

            {(ticket.stage === 'testy_chrono' || ticket.stage === 'gotowe') &&
              qaItems.length > 0 &&
              qaDoneCount < qaItems.length && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 tabular-nums">
                  Uwaga: pozostało {qaItems.length - qaDoneCount} pkt kontroli jakości do odhaczenia przed wydaniem repliki.
                </div>
              )}

            <div className="space-y-2">
              {qaItems.map((qa) => (
                <label
                  key={qa.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-xs transition-colors ${
                    qa.done
                      ? 'border-emerald-200 bg-emerald-50/50 text-slate-900'
                      : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={qa.done}
                    onChange={() => handleQaToggle(qa.id)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-[#e88a00]"
                  />
                  <span className={qa.done ? 'font-medium text-emerald-950' : ''}>
                    {qa.label}
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT STICKY SUMMARY: Financial Breakdown + Save + Email Reply */}
        <aside className="space-y-4 xl:col-span-4 xl:sticky xl:top-20">
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span>Razem dla klienta (brutto)</span>
                  <InfoTooltip text="Suma cen części dla klienta, robocizny, materiałów, diagnostyki oraz podatków." />
                </div>
                <p className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {formatPln(result.grossPrice)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-600">Zysk serwisu</p>
                <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums">
                  +{formatPln(result.workshopProfit)}
                </p>
                <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                  Marża {Math.round(result.profitMarginPercent)}%
                </p>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-stone-100 pt-3 text-xs">
              <div className="flex justify-between text-slate-600 tabular-nums">
                <span>Części (zakup sklepowy)</span>
                <span className="font-mono font-medium text-slate-800">
                  {formatPln(result.partsPurchaseCostTotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 tabular-nums">
                <span>Części (dla klienta)</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatPln(result.partsClientTotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 tabular-nums">
                <span>Robocizna serwisowa</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatPln(result.laborTotal)}
                </span>
              </div>
              {(result.consumablesCost > 0 || result.diagnosticFee > 0) && (
                <div className="flex justify-between text-slate-600 tabular-nums">
                  <span>Materiały + Diagnostyka</span>
                  <span className="font-mono font-medium text-slate-900">
                    {formatPln(result.consumablesCost + result.diagnosticFee)}
                  </span>
                </div>
              )}
              {result.prioritySurchargeAmount > 0 && (
                <div className="flex justify-between text-[#b86d00] tabular-nums">
                  <span>Dopłata ekspres ({ticket.prioritySurchargePercent}%)</span>
                  <span className="font-mono font-medium">
                    +{formatPln(result.prioritySurchargeAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 tabular-nums">
                <span>Wartość netto</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatPln(result.netPrice)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 tabular-nums">
                <span>
                  PIT ({ticket.incomeTaxRate}%) + VAT ({ticket.vatRate}%)
                </span>
                <span className="font-mono">
                  {formatPln(result.incomeTaxAmount + result.vatAmount)}
                </span>
              </div>
            </div>

            {result.partsCountTotal > 0 && (() => {
              const clientParts = result.partsClientSuppliedCount || 0;
              const workshopParts = result.partsCountTotal - clientParts;
              return (
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-slate-700 tabular-nums space-y-0.5">
                  {workshopParts > 0 && (
                    <p>
                      Części do zakupu: {result.partsToOrderCount} do zam. ·{' '}
                      {result.partsOrderedCount} zamówione · {result.partsReadyCount} gotowe
                    </p>
                  )}
                  {clientParts > 0 && (
                    <p className="text-amber-800">
                      Części powierzone przez klienta: {clientParts} poz.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="space-y-2 pt-1">
              {ticket.editingOrderId ? (
                <button
                  type="button"
                  onClick={() => onUpdateExisting(ticket.editingOrderId!)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#e88a00] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#cf7b00]"
                >
                  <Save className="h-4 w-4" />
                  Zapisz zmiany w zleceniu
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSaveAsNew}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#e88a00] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#cf7b00]"
                >
                  <BookmarkPlus className="h-4 w-4" />
                  Zapisz zlecenie w bazie
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {ticket.editingOrderId && (
                  <button
                    type="button"
                    onClick={onSaveAsNew}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Zapisz jako nowe
                  </button>
                )}
                <button
                  type="button"
                  onClick={onAddToQuote}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 ${
                    !ticket.editingOrderId ? 'col-span-1' : ''
                  }`}
                >
                  <FilePlus2 className="h-3.5 w-3.5 text-[#b86d00]" />
                  Dodaj do PDF
                </button>
                {!ticket.editingOrderId && (
                  <button
                    type="button"
                    onClick={onOpenQuote}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Otwórz kosztorys PDF
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Instant Client Email Reply (PL / UKR) */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Wiadomość z diagnozą i wyceną
                </h3>
                <InfoTooltip text="Gotowy kosztorys w języku PL lub UKR. Możesz go ręcznie edytować przed skopiowaniem." />
              </div>
              <div className="flex items-center rounded-md bg-slate-100 p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setEmailLang('pl');
                    setCustomEmailBody(null);
                  }}
                  className={`rounded px-2 py-1 ${
                    emailLang === 'pl'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  PL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailLang('ukr');
                    setCustomEmailBody(null);
                  }}
                  className={`rounded px-2 py-1 ${
                    emailLang === 'ukr'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  UKR
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={leadTimeIndex}
                onChange={(e) => {
                  setLeadTimeIndex(parseInt(e.target.value, 10));
                  setCustomEmailBody(null);
                }}
                aria-label="Szacowany czas realizacji"
                className="flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
              >
                {DEFAULT_LEAD_TIMES[emailLang].map((lt, idx) => (
                  <option key={lt} value={idx}>
                    Termin: {lt}
                  </option>
                ))}
              </select>
              {customEmailBody !== null && (
                <button
                  type="button"
                  onClick={() => setCustomEmailBody(null)}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#b86d00] hover:bg-amber-50 whitespace-nowrap"
                >
                  Przywróć automat
                </button>
              )}
            </div>

            <textarea
              rows={9}
              value={displayedEmail}
              onChange={(e) => setCustomEmailBody(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-stone-50/60 p-2.5 text-xs leading-relaxed text-slate-800 focus:border-[#e88a00] focus:bg-white focus:outline-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyEmail}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {copiedEmail ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Kopiuj treść
              </button>
              <a
                href={mailtoHref}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Mail className="h-3.5 w-3.5" />
                Otwórz w poczcie
              </a>
            </div>
          </section>
        </aside>
      </div>

      {/* Photo Lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="max-h-[90vh] max-w-3xl overflow-hidden rounded-xl bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewPhoto.dataUrl}
              alt={previewPhoto.caption}
              className="max-h-[75vh] w-auto rounded-lg object-contain"
            />
            <div className="mt-2 flex items-center justify-between gap-4 px-1">
              <span className="text-xs font-medium text-slate-800">
                {previewPhoto.caption}
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Printable Hang-Tag / Build Certificate Modal */}
    {printModalMode && (
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-4 print:static print:overflow-visible print:bg-white print:p-0"
        onClick={() => setPrintModalMode(null)}
      >
        <div
          className="mx-auto max-w-3xl space-y-4 print:max-w-none print:space-y-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Toolbar (hidden in print) */}
          <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <div className="flex items-center rounded-lg bg-slate-100 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setPrintModalMode('hangtag')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  printModalMode === 'hangtag'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Zawieszka serwisowa (na replikę)
              </button>
              <button
                type="button"
                onClick={() => setPrintModalMode('certificate')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  printModalMode === 'certificate'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Karta buildu / Certyfikat chrono (PDF)
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#e88a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#cf7b00]"
              >
                <Printer className="h-3.5 w-3.5" />
                Drukuj / Zapisz PDF
              </button>
              <button
                type="button"
                onClick={() => setPrintModalMode(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Zamknij
              </button>
            </div>
          </div>

          {/* Template 1: Workshop Hang-Tag */}
          {printModalMode === 'hangtag' && (
            <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-slate-400 bg-white p-6 text-slate-900 shadow-xl print:border-slate-800 print:shadow-none">
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#b86d00]">
                    {settings.companyName}
                  </p>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    ZAWIESZKA SERWISOWA
                  </h2>
                </div>
                <div className="text-right font-mono text-[11px] text-slate-600 tabular-nums">
                  <p>{new Date().toLocaleDateString('pl-PL')}</p>
                  <p className="font-bold text-slate-900">{ticket.driveType}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Replika i nr seryjny
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    {formatReplicaLabel(ticket)}
                  </p>
                  {ticket.serialOrMarking && (
                    <p className="font-mono text-[11px] text-slate-600">
                      S/N: {ticket.serialOrMarking}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 border-y border-slate-200 py-2.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      Klient / Kontakt
                    </p>
                    <p className="font-semibold text-slate-900">
                      {ticket.clientName || 'Nie podano'}
                    </p>
                    {ticket.clientContact && (
                      <p className="text-[11px] text-slate-600">
                        {ticket.clientContact}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      Termin / Limit FPS
                    </p>
                    <p className="font-mono font-semibold text-slate-900 tabular-nums">
                      {ticket.targetReadyDate
                        ? new Date(`${ticket.targetReadyDate}T12:00:00`).toLocaleDateString('pl-PL')
                        : 'Standard'}
                    </p>
                    <p className="font-mono text-[11px] text-slate-600 tabular-nums">
                      Cel: {ticket.chrono.targetFps || '—'} FPS ({ticket.chrono.bbWeightGrams}g)
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Zakres / Zgłoszenie
                  </p>
                  <p className="font-medium text-slate-800">
                    {ticket.projectName || SERVICE_SCOPE_LABELS[ticket.serviceScope]}
                  </p>
                  {ticket.reportedFault && (
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {ticket.reportedFault}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Przyjęte z repliką (akcesoria)
                  </p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {(ticket.intakeAccessories || []).length > 0
                      ? (ticket.intakeAccessories || []).join(' · ')
                      : 'Sama replika (bez akcesoriów)'}
                  </p>
                  {ticket.intakeCondition && (
                    <p className="text-[11px] text-slate-600">
                      Uwagi: {ticket.intakeCondition}
                    </p>
                  )}
                </div>

                {ticket.parts.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      Przypisane części ({ticket.parts.length} poz.)
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-700">
                      {ticket.parts
                        .map(
                          (p) =>
                            `${p.name}${p.suppliedByClient ? ' [klienta]' : ''}`
                        )
                        .join(', ')}
                    </p>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Etap: {REPAIR_STAGE_LABELS[ticket.stage]}</span>
                  <span>Podpis serwisanta: __________________</span>
                </div>
              </div>
            </div>
          )}

          {/* Template 2: Build Certificate / Chrono Passport PDF */}
          {printModalMode === 'certificate' && (
            <div className="rounded-xl border border-slate-200 bg-white p-7 text-slate-900 shadow-xl print:border-0 print:p-0 print:shadow-none space-y-5">
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#b86d00]">
                    {settings.companyName}
                  </p>
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    KARTA BUILDU I RAPORT CHRONO
                  </h2>
                  <p className="text-xs text-slate-500">
                    {[settings.companyEmail, settings.companyPhone]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-600 tabular-nums">
                  <p className="font-semibold text-slate-900">
                    Data: {new Date().toLocaleDateString('pl-PL')}
                  </p>
                  {ticket.clientName && <p>Klient: {ticket.clientName}</p>}
                  {ticket.serialOrMarking && (
                    <p className="font-mono text-[11px]">
                      S/N: {ticket.serialOrMarking}
                    </p>
                  )}
                </div>
              </div>

              {/* Replica & Internal Specs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3.5 text-xs space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Specyfikacja repliki
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    {formatReplicaLabel(ticket)} ({ticket.driveType})
                  </p>
                  <p className="text-slate-700">
                    Zakres: {ticket.projectName || SERVICE_SCOPE_LABELS[ticket.serviceScope]}
                  </p>
                  <p className="text-slate-600">
                    Gearbox: {specs.gearboxVersion || '—'} · Łożyska: {specs.bearingsMm || '—'}
                  </p>
                  <p className="text-slate-600">
                    Dysza: {specs.nozzleLengthMm || '—'} · Lufa wewn.: {specs.innerBarrelMm || '—'} · Cylinder: {specs.cylinderType || '—'}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3.5 text-xs space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Pomiary Chronografu ({ticket.chrono.bbWeightGrams.toFixed(2)} g)
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono tabular-nums">
                    <div>
                      <p className="text-[10px] text-slate-400">PRZED SERWISEM</p>
                      <p className="text-sm font-semibold text-slate-700">
                        {ticket.chrono.beforeFps || '—'} FPS ({ticket.chrono.beforeJoule.toFixed(2)} J)
                      </p>
                      {ticket.chrono.beforeRps > 0 && (
                        <p className="text-[11px] text-slate-500">
                          {ticket.chrono.beforeRps} kul/s
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-700">PO SERWISIE</p>
                      <p className="text-sm font-bold text-emerald-800">
                        {ticket.chrono.afterFps || '—'} FPS ({ticket.chrono.afterJoule.toFixed(2)} J)
                      </p>
                      {ticket.chrono.afterRps > 0 && (
                        <p className="text-[11px] text-emerald-700">
                          {ticket.chrono.afterRps} kul/s
                        </p>
                      )}
                    </div>
                  </div>
                  {afterSeriesStats && (
                    <p className="pt-1 font-mono text-[11px] text-slate-600 tabular-nums">
                      Seria końcowa ({afterSeriesStats.count} strz.): {afterSeriesStats.minFps}–{afterSeriesStats.maxFps} FPS (rozrzut Δ {afterSeriesStats.spreadFps} FPS)
                    </p>
                  )}
                  {(specs.testBattery || specs.etuSettings) && (
                    <p className="text-[11px] text-slate-600">
                      {[
                        specs.testBattery ? `Zasilanie: ${specs.testBattery}` : null,
                        specs.etuSettings ? `ETU: ${specs.etuSettings}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>

              {(ticket.diagnosisSummary || ticket.reportedFault) && (
                <div className="rounded-lg bg-slate-50 p-3.5 text-xs space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Diagnostyka i opis prac
                  </p>
                  {ticket.reportedFault && (
                    <p className="text-slate-600">
                      Zgłoszenie: {ticket.reportedFault}
                    </p>
                  )}
                  {ticket.diagnosisSummary && (
                    <p className="font-medium text-slate-900">
                      Rozpoznanie i wykonanie: {ticket.diagnosisSummary}
                    </p>
                  )}
                </div>
              )}

              {/* Installed Parts Table */}
              {ticket.parts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Zainstalowane podzespoły
                  </p>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-1.5 font-medium">Część</th>
                        <th className="py-1.5 font-medium">Układ</th>
                        <th className="py-1.5 font-medium text-right">Ilość</th>
                        <th className="py-1.5 font-medium text-right">Uwagi / Pochodzenie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ticket.parts.map((p) => (
                        <tr key={p.id}>
                          <td className="py-1.5 font-medium text-slate-900">
                            {p.name}
                          </td>
                          <td className="py-1.5 text-slate-600">{p.category}</td>
                          <td className="py-1.5 text-right font-mono tabular-nums">
                            {p.quantity} szt.
                          </td>
                          <td className="py-1.5 text-right text-slate-600">
                            {p.suppliedByClient
                              ? 'Część klienta'
                              : formatPln(p.clientUnitPrice * p.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* QA Sign-Off & Footer */}
              <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Kontrola końcowa przed wydaniem
                  </p>
                  <ul className="space-y-1 text-[11px] text-slate-700">
                    {qaItems.map((q) => (
                      <li key={q.id}>
                        [{q.done ? '✓' : ' '}] {q.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col justify-between text-right">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Podsumowanie rozliczenia (brutto)
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                      {formatPln(result.grossPrice)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Zalecamy stosowanie markowych kulek bezszwowych (np. BLS / Specna Edge) oraz baterii 11.1V max 25-30C dla ETU.
                    </p>
                  </div>
                  <p className="mt-4 text-[11px] text-slate-400">
                    Dokument wygenerowany w systemie {settings.companyName}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
};
