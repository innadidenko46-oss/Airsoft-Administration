import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  AirsoftWorkshopSettings,
  AppView,
  AttachmentImage,
  PartsCatalogItem,
  PaymentStatus,
  QuoteLineItem,
  RepairPartItem,
  RepairStage,
  RepairTicketInput,
  SavedRepairOrder,
  ServiceRateItem,
} from './types/airsoft';
import {
  DEFAULT_PARTS_CATALOG,
  DEFAULT_SERVICE_RATES,
  DEFAULT_SUPPLIERS,
  DEFAULT_WORKSHOP_SETTINGS,
  INITIAL_TICKET_INPUT,
  createDefaultQaChecklist,
  createEmptyDiagnosticChecks,
  createEmptyInternalSpecs,
} from './data/airsoftDefaults';
import {
  REPAIR_STAGE_LABELS,
  calculateRepairQuote,
  formatPartsSummary,
  formatReplicaLabel,
} from './utils/airsoftCalculations';
import { auth } from './firebase';
import {
  bootstrapAirsoftWorkspaceIfEmpty,
  createRepairOrderRecord,
  deleteRepairOrderRecord,
  ensureUserProfile,
  saveWorkspaceConfig,
  saveWorkspaceDraft,
  subscribeRepairOrders,
  subscribeWorkspaceConfig,
  subscribeWorkspaceDraft,
  updateRepairOrderFields,
} from './services/firestoreService';
import { isEmailAllowed } from './utils/authAllowlist';
import { AuthGate } from './components/AuthGate';
import { TopNav } from './components/TopNav';
import { HomeView } from './components/HomeView';
import {
  KnownClientSuggestion,
  RepairWorkbenchView,
} from './components/RepairWorkbenchView';
import { PartsProcurementView } from './components/PartsProcurementView';
import { QuoteBuilderView } from './components/QuoteBuilderView';
import { HistoryView } from './components/HistoryView';
import { DatabaseView } from './components/DatabaseView';
import { ImportOrdersModal } from './components/ImportOrdersModal';

function normalizeTicketInput(raw: Partial<RepairTicketInput>): RepairTicketInput {
  return {
    ...INITIAL_TICKET_INPUT,
    ...raw,
    targetReadyDate: raw.targetReadyDate || '',
    intakeAccessories: Array.isArray(raw.intakeAccessories)
      ? raw.intakeAccessories
      : [],
    internalSpecs: {
      ...createEmptyInternalSpecs(),
      ...(raw.internalSpecs || {}),
    },
    diagnosticChecks:
      Array.isArray(raw.diagnosticChecks) && raw.diagnosticChecks.length > 0
        ? raw.diagnosticChecks
        : createEmptyDiagnosticChecks(),
    qaChecklist:
      Array.isArray(raw.qaChecklist) && raw.qaChecklist.length > 0
        ? raw.qaChecklist
        : createDefaultQaChecklist(),
    chrono: {
      ...INITIAL_TICKET_INPUT.chrono,
      ...(raw.chrono || {}),
    },
    parts: Array.isArray(raw.parts) ? raw.parts : [],
    laborTasks: Array.isArray(raw.laborTasks)
      ? raw.laborTasks
      : INITIAL_TICKET_INPUT.laborTasks,
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
  };
}

function normalizeSettings(
  raw: Partial<AirsoftWorkshopSettings>
): AirsoftWorkshopSettings {
  return {
    ...DEFAULT_WORKSHOP_SETTINGS,
    ...raw,
  };
}

function syncSettingsIntoTicket(
  base: RepairTicketInput,
  s: AirsoftWorkshopSettings
): RepairTicketInput {
  return {
    ...base,
    incomeTaxRate: s.defaultIncomeTaxRate,
    incomeTaxMode: s.defaultIncomeTaxMode,
    vatRate: s.defaultVatRate,
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [accessDeniedEmail, setAccessDeniedEmail] = useState<string | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<AppView>('home');
  const [historyStageFilter, setHistoryStageFilter] = useState<'all' | RepairStage>(
    'all'
  );

  const [partsCatalog, setPartsCatalog] =
    useState<PartsCatalogItem[]>(DEFAULT_PARTS_CATALOG);
  const [serviceRates, setServiceRates] =
    useState<ServiceRateItem[]>(DEFAULT_SERVICE_RATES);
  const [suppliers, setSuppliers] = useState<string[]>(DEFAULT_SUPPLIERS);
  const [settings, setSettings] = useState<AirsoftWorkshopSettings>(
    DEFAULT_WORKSHOP_SETTINGS
  );

  const [currentTicket, setCurrentTicket] = useState<RepairTicketInput>(() =>
    syncSettingsIntoTicket(INITIAL_TICKET_INPUT, DEFAULT_WORKSHOP_SETTINGS)
  );
  const [repairs, setRepairs] = useState<SavedRepairOrder[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteLineItem[]>([]);
  const [quoteAttachments, setQuoteAttachments] = useState<AttachmentImage[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const userRef = useRef<User | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const hasHydratedRef = useRef(false);

  const notify = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        userRef.current = null;
        setUser(null);
        setAccessDeniedEmail(null);
        setAuthReady(true);
        return;
      }

      if (!isEmailAllowed(nextUser.email)) {
        const blocked = nextUser.email || 'nieznany adres';
        await signOut(auth);
        userRef.current = null;
        setUser(null);
        setAccessDeniedEmail(blocked);
        setAuthReady(true);
        return;
      }

      userRef.current = nextUser;
      setUser(nextUser);
      setAccessDeniedEmail(null);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Bootstrap & subscribe to isolated Airsoft Firestore workspace
  useEffect(() => {
    if (!user || !user.emailVerified) {
      hasHydratedRef.current = false;
      setRepairs([]);
      return;
    }

    let isCancelled = false;
    let unsubConfig: (() => void) | undefined;
    let unsubDraft: (() => void) | undefined;
    let unsubRepairs: (() => void) | undefined;

    const initAirsoftCloud = async () => {
      setCloudLoading(true);
      setCloudError(null);

      try {
        await ensureUserProfile(user);
        await bootstrapAirsoftWorkspaceIfEmpty(user.uid, {
          partsCatalog: DEFAULT_PARTS_CATALOG,
          serviceRates: DEFAULT_SERVICE_RATES,
          suppliers: DEFAULT_SUPPLIERS,
          settings: DEFAULT_WORKSHOP_SETTINGS,
          currentTicket: syncSettingsIntoTicket(
            INITIAL_TICKET_INPUT,
            DEFAULT_WORKSHOP_SETTINGS
          ),
          quoteItems: [],
          quoteAttachments: [],
        });

        if (isCancelled) return;

        unsubConfig = subscribeWorkspaceConfig((cfg) => {
          if (!cfg) return;
          if (cfg.partsCatalog.length > 0) setPartsCatalog(cfg.partsCatalog);
          if (cfg.serviceRates.length > 0) setServiceRates(cfg.serviceRates);
          if (cfg.suppliers.length > 0) setSuppliers(cfg.suppliers);
          setSettings(normalizeSettings(cfg.settings));
        });

        unsubDraft = subscribeWorkspaceDraft((draft) => {
          if (!draft) return;
          setCurrentTicket(normalizeTicketInput(draft.currentTicket));
          setQuoteItems(draft.quoteItems);
          setQuoteAttachments(draft.quoteAttachments);
          hasHydratedRef.current = true;
        });

        unsubRepairs = subscribeRepairOrders((orders) => {
          setRepairs(orders);
        });

        hasHydratedRef.current = true;
      } catch (err) {
        console.error('Airsoft workspace init error:', err);
        if (!isCancelled) {
          setCloudError(
            'Nie udało się połączyć z bazą Airsoft w chmurze. Sprawdź uprawnienia konta.'
          );
        }
      } finally {
        if (!isCancelled) {
          setCloudLoading(false);
        }
      }
    };

    void initAirsoftCloud();

    return () => {
      isCancelled = true;
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
      unsubConfig?.();
      unsubDraft?.();
      unsubRepairs?.();
    };
  }, [user, authVersion]);

  const scheduleDraftCloudSave = (
    nextTicket: RepairTicketInput,
    nextQuoteItems: QuoteLineItem[],
    nextQuoteAttachments: AttachmentImage[]
  ) => {
    const uid = userRef.current?.uid;
    if (!uid || !hasHydratedRef.current) return;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      void saveWorkspaceDraft(
        uid,
        nextTicket,
        nextQuoteItems,
        nextQuoteAttachments
      ).catch((err) => console.error('Draft sync error:', err));
    }, 600);
  };

  const calculationResult = useMemo(
    () => calculateRepairQuote(currentTicket),
    [currentTicket]
  );

  const partsToOrderCount = useMemo(() => {
    let count = 0;
    for (const r of repairs) {
      if (r.stage === 'gotowe') continue;
      for (const p of r.ticket.parts || []) {
        if (!p.suppliedByClient && p.purchaseStatus === 'do_zamowienia') count += 1;
      }
    }
    return count;
  }, [repairs]);

  const knownClients = useMemo<KnownClientSuggestion[]>(() => {
    const map = new Map<string, KnownClientSuggestion>();
    for (const r of repairs) {
      const name = (r.ticket.clientName || '').trim();
      const contact = (r.ticket.clientContact || '').trim();
      if (!name && !contact) continue;
      const key = `${name.toLowerCase()}||${contact.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          clientName: name,
          clientContact: contact,
          clientDeliveryInfo: (r.ticket.clientDeliveryInfo || '').trim(),
          orderSource: r.ticket.orderSource || 'E-mail',
        });
      }
    }
    return Array.from(map.values());
  }, [repairs]);

  const updateTicketState = (next: RepairTicketInput) => {
    setCurrentTicket(next);
    scheduleDraftCloudSave(next, quoteItems, quoteAttachments);
  };

  const updateQuoteState = (
    nextItems: QuoteLineItem[],
    nextAttachments: AttachmentImage[]
  ) => {
    setQuoteItems(nextItems);
    setQuoteAttachments(nextAttachments);
    scheduleDraftCloudSave(currentTicket, nextItems, nextAttachments);
  };

  const handleSaveConfig = (
    nextParts: PartsCatalogItem[],
    nextRates: ServiceRateItem[],
    nextSuppliers: string[],
    nextSettings: AirsoftWorkshopSettings
  ) => {
    setPartsCatalog(nextParts);
    setServiceRates(nextRates);
    setSuppliers(nextSuppliers);
    setSettings(nextSettings);

    const uid = userRef.current?.uid;
    if (uid) {
      void saveWorkspaceConfig(
        uid,
        nextParts,
        nextRates,
        nextSuppliers,
        nextSettings
      ).catch((err) => {
        console.error('Config sync error:', err);
        notify('Błąd zapisu ustawień do bazy danych.');
      });
    }
  };

  const handleClearWorkbench = () => {
    const fresh: RepairTicketInput = {
      ...syncSettingsIntoTicket(INITIAL_TICKET_INPUT, settings),
      targetReadyDate: '',
      intakeAccessories: [],
      internalSpecs: createEmptyInternalSpecs(),
      diagnosticChecks: createEmptyDiagnosticChecks(),
      qaChecklist: createDefaultQaChecklist(),
      laborTasks: [
        {
          id: `lab-${Date.now()}`,
          serviceId: serviceRates[0]?.id,
          name: serviceRates[0]?.name || 'Diagnostyka / Serwis ASG',
          hours: serviceRates[0]?.defaultHours || 1,
          hourlyRate: settings.defaultTechHourlyRate,
          fixedPrice: serviceRates[0]?.fixedPrice || 120,
          useFixedPrice: serviceRates[0]?.useFixedPrice ?? true,
        },
      ],
      extraMaterialsFlat: settings.defaultConsumablesFee,
      diagnosticFee: settings.defaultDiagnosticFee,
    };
    updateTicketState(fresh);
    notify('Utworzono czystą kartę przyjęcia nowej repliki.');
  };

  const handleNewTicketFromNav = () => {
    handleClearWorkbench();
    setActiveView('workbench');
  };

  const handleSaveAsNewRepair = async () => {
    const uid = userRef.current?.uid;
    if (!uid) return;

    const cleanTicket: RepairTicketInput = { ...currentTicket };
    delete cleanTicket.editingOrderId;

    const newId = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newRecord: SavedRepairOrder = {
      id: newId,
      createdAt: new Date().toISOString(),
      stage: cleanTicket.stage || 'przyjecie',
      paymentStatus: 'oczekuje',
      documentRef: '',
      ticket: cleanTicket,
      result: calculationResult,
      replicaLabel: formatReplicaLabel(cleanTicket),
      partsSummary: formatPartsSummary(cleanTicket.parts),
    };

    try {
      await createRepairOrderRecord(uid, newRecord);
      updateTicketState({ ...cleanTicket, editingOrderId: newId });
      notify(`Zapisano nowe zlecenie w bazie: ${newRecord.replicaLabel}`);
    } catch (err) {
      console.error('Create repair failed:', err);
      notify('Nie udało się zapisać zlecenia w bazie.');
    }
  };

  const handleUpdateExistingRepair = async (repairId: string) => {
    const cleanTicket: RepairTicketInput = { ...currentTicket };
    delete cleanTicket.editingOrderId;

    const replicaLabel = formatReplicaLabel(cleanTicket);
    const partsSummary = formatPartsSummary(cleanTicket.parts);

    try {
      await updateRepairOrderFields(repairId, {
        stage: cleanTicket.stage,
        ticket: cleanTicket,
        result: calculationResult,
        replicaLabel,
        partsSummary,
      });
      notify(`Zaktualizowano kartę zlecenia: ${replicaLabel}`);
    } catch (err) {
      console.error('Update repair failed:', err);
      notify('Nie udało się zaktualizować zlecenia w bazie.');
    }
  };

  const handleAddToQuote = () => {
    const vatFactor =
      calculationResult.netPrice > 0
        ? calculationResult.grossPrice / calculationResult.netPrice
        : 1 + settings.defaultVatRate / 100;
    const taxFactor =
      calculationResult.netPrice > 0
        ? calculationResult.priceWithIncomeTax / calculationResult.netPrice
        : 1;
    const priorityFactor =
      currentTicket.prioritySurchargePercent > 0
        ? 1 + currentTicket.prioritySurchargePercent / 100
        : 1;

    const generatedItems: QuoteLineItem[] = [];
    const baseTs = Date.now();

    currentTicket.parts.forEach((p, idx) => {
      const qty = Math.max(1, p.quantity || 1);
      if (p.suppliedByClient) {
        generatedItems.push({
          id: `q-part-${baseTs}-${idx}`,
          kind: 'part',
          name: p.name,
          specLabel: 'Część powierzona przez klienta',
          quantity: qty,
          unitNetPrice: 0,
          totalNetPrice: 0,
          totalWithIncomeTax: 0,
          totalGrossPrice: 0,
          totalCost: 0,
          totalProfit: 0,
        });
        return;
      }
      const unitNet = p.clientUnitPrice * priorityFactor;
      const totalNet = unitNet * qty;
      const totalCost = p.purchaseUnitCost * qty;
      generatedItems.push({
        id: `q-part-${baseTs}-${idx}`,
        kind: 'part',
        name: p.name,
        specLabel: `Część (${p.supplier})`,
        quantity: qty,
        unitNetPrice: unitNet,
        totalNetPrice: totalNet,
        totalWithIncomeTax: totalNet * taxFactor,
        totalGrossPrice: totalNet * vatFactor,
        totalCost,
        totalProfit: totalNet - totalCost,
      });
    });

    currentTicket.laborTasks.forEach((task, idx) => {
      const baseCost = task.useFixedPrice
        ? task.fixedPrice
        : task.hours * task.hourlyRate;
      const totalNet = baseCost * priorityFactor;
      if (totalNet <= 0) return;
      generatedItems.push({
        id: `q-lab-${baseTs}-${idx}`,
        kind: 'labor',
        name: task.name,
        specLabel: task.useFixedPrice
          ? 'Usługa serwisowa (ryczałt)'
          : `Robocizna (${task.hours} h)`,
        quantity: 1,
        unitNetPrice: totalNet,
        totalNetPrice: totalNet,
        totalWithIncomeTax: totalNet * taxFactor,
        totalGrossPrice: totalNet * vatFactor,
        totalCost: 0,
        totalProfit: totalNet,
      });
    });

    const consumablesNet = currentTicket.extraMaterialsFlat * priorityFactor;
    if (consumablesNet > 0) {
      generatedItems.push({
        id: `q-cons-${baseTs}`,
        kind: 'labor',
        name: 'Materiały eksploatacyjne (smary, zmywacz, podkładki)',
        specLabel: 'Materiały warsztatowe',
        quantity: 1,
        unitNetPrice: consumablesNet,
        totalNetPrice: consumablesNet,
        totalWithIncomeTax: consumablesNet * taxFactor,
        totalGrossPrice: consumablesNet * vatFactor,
        totalCost: 0,
        totalProfit: consumablesNet,
      });
    }

    const diagNet = currentTicket.diagnosticFee * priorityFactor;
    if (diagNet > 0) {
      generatedItems.push({
        id: `q-diag-${baseTs}`,
        kind: 'diagnostic',
        name: 'Diagnostyka usterki i pomiary na chronografie',
        specLabel: 'Diagnostyka techniczna',
        quantity: 1,
        unitNetPrice: diagNet,
        totalNetPrice: diagNet,
        totalWithIncomeTax: diagNet * taxFactor,
        totalGrossPrice: diagNet * vatFactor,
        totalCost: 0,
        totalProfit: diagNet,
      });
    }

    if (generatedItems.length === 0) {
      notify('Dodaj co najmniej jedną część lub usługę przed utworzeniem kosztorysu.');
      return;
    }

    const combinedAttachments = [...quoteAttachments];
    for (const att of currentTicket.attachments) {
      if (combinedAttachments.length >= 6) break;
      if (!combinedAttachments.some((x) => x.dataUrl === att.dataUrl)) {
        combinedAttachments.push({ ...att });
      }
    }

    updateQuoteState(generatedItems, combinedAttachments);
    setActiveView('quote');
    notify('Przeniesiono pozycje i zdjęcia do kosztorysu PDF dla klienta.');
  };

  const handleLoadRepair = (entry: SavedRepairOrder) => {
    const loadedTicket: RepairTicketInput = {
      ...normalizeTicketInput(entry.ticket),
      stage: entry.stage,
      editingOrderId: entry.id,
    };
    updateTicketState(loadedTicket);
    setActiveView('workbench');
    notify(`Wczytano zlecenie: ${entry.replicaLabel}`);
  };

  const handleDuplicateRepair = async (entry: SavedRepairOrder) => {
    const uid = userRef.current?.uid;
    if (!uid) return;
    const cleanTicket = normalizeTicketInput(entry.ticket);
    delete cleanTicket.editingOrderId;
    cleanTicket.stage = 'przyjecie';

    const copyRecord: SavedRepairOrder = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      stage: 'przyjecie',
      paymentStatus: 'oczekuje',
      documentRef: '',
      ticket: cleanTicket,
      result: calculateRepairQuote(cleanTicket),
      replicaLabel: formatReplicaLabel(cleanTicket),
      partsSummary: formatPartsSummary(cleanTicket.parts),
    };

    try {
      await createRepairOrderRecord(uid, copyRecord);
      notify(`Utworzono duplikat zlecenia: ${copyRecord.replicaLabel}`);
    } catch (err) {
      console.error('Duplicate failed:', err);
      notify('Nie udało się zduplikować zlecenia.');
    }
  };

  const handleChangeStage = async (repairId: string, stage: RepairStage) => {
    setRepairs((prev) =>
      prev.map((r) => (r.id === repairId ? { ...r, stage } : r))
    );
    if (currentTicket.editingOrderId === repairId) {
      setCurrentTicket((prev) => ({ ...prev, stage }));
    }
    try {
      await updateRepairOrderFields(repairId, { stage });
      notify(`Zmieniono etap na: ${REPAIR_STAGE_LABELS[stage]}`);
    } catch (err) {
      console.error('Stage update failed:', err);
      notify('Nie udało się zmienić etapu zlecenia.');
    }
  };

  const handleChangePaymentStatus = async (
    repairId: string,
    paymentStatus: PaymentStatus
  ) => {
    setRepairs((prev) =>
      prev.map((r) => (r.id === repairId ? { ...r, paymentStatus } : r))
    );
    try {
      await updateRepairOrderFields(repairId, { paymentStatus });
    } catch (err) {
      console.error('Payment status update failed:', err);
      notify('Nie udało się zapisać statusu płatności.');
    }
  };

  const handleChangeDocumentRef = async (
    repairId: string,
    documentRef: string
  ) => {
    setRepairs((prev) =>
      prev.map((r) => (r.id === repairId ? { ...r, documentRef } : r))
    );
    try {
      await updateRepairOrderFields(repairId, { documentRef });
    } catch (err) {
      console.error('DocumentRef update failed:', err);
      notify('Nie udało się zapisać numeru dokumentu.');
    }
  };

  const handleUpdatePartInRepair = async (
    repairId: string,
    partId: string,
    patch: Partial<RepairPartItem>
  ) => {
    const target = repairs.find((r) => r.id === repairId);
    if (!target) return;

    const updatedParts = (target.ticket.parts || []).map((p) =>
      p.id === partId ? { ...p, ...patch } : p
    );
    const updatedTicket: RepairTicketInput = {
      ...target.ticket,
      parts: updatedParts,
    };
    const updatedResult = calculateRepairQuote(updatedTicket);
    const updatedSummary = formatPartsSummary(updatedParts);

    setRepairs((prev) =>
      prev.map((r) =>
        r.id === repairId
          ? {
              ...r,
              ticket: updatedTicket,
              result: updatedResult,
              partsSummary: updatedSummary,
            }
          : r
      )
    );

    if (currentTicket.editingOrderId === repairId) {
      updateTicketState({
        ...currentTicket,
        parts: updatedParts,
      });
    }

    try {
      await updateRepairOrderFields(repairId, {
        ticket: updatedTicket,
        result: updatedResult,
        partsSummary: updatedSummary,
      });
    } catch (err) {
      console.error('Part purchase status sync failed:', err);
      notify('Nie udało się zaktualizować statusu części w bazie.');
    }
  };

  const handleDeleteRepair = async (repairId: string) => {
    setRepairs((prev) => prev.filter((r) => r.id !== repairId));
    if (currentTicket.editingOrderId === repairId) {
      const detached = { ...currentTicket };
      delete detached.editingOrderId;
      updateTicketState(detached);
    }
    try {
      await deleteRepairOrderRecord(repairId);
      notify('Usunięto zlecenie z bazy.');
    } catch (err) {
      console.error('Delete failed:', err);
      notify('Nie udało się usunąć zlecenia.');
    }
  };

  const handleImportRepairs = async (entries: SavedRepairOrder[]) => {
    const uid = userRef.current?.uid;
    if (!uid) return;
    for (const entry of entries) {
      await createRepairOrderRecord(uid, entry);
    }
    notify(`Zaimportowano ${entries.length} zleceń do bazy Airsoft.`);
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f4f2]">
        <Loader2 className="h-6 w-6 animate-spin text-[#e88a00]" />
      </div>
    );
  }

  if (!user || !user.emailVerified) {
    return (
      <AuthGate
        user={user}
        accessDeniedEmail={accessDeniedEmail}
        onClearAccessDenied={() => setAccessDeniedEmail(null)}
        onVerifiedRefresh={async () => {
          if (auth.currentUser) {
            await auth.currentUser.reload();
            userRef.current = auth.currentUser;
            setUser(auth.currentUser);
            setAuthVersion((v) => v + 1);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f2] text-stone-900">
      <TopNav
        activeView={activeView}
        partsToOrderCount={partsToOrderCount}
        onSelectView={(view) => {
          if (view === 'history') setHistoryStageFilter('all');
          setActiveView(view);
        }}
        onNewTicket={handleNewTicketFromNav}
        userEmail={user.email}
        onLogout={() => {
          void signOut(auth);
        }}
      />

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
        {cloudLoading && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#e88a00]" />
            Synchronizuję bazę danych serwisu ASG...
          </div>
        )}

        {cloudError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {cloudError}
          </div>
        )}

        {activeView === 'home' && (
          <HomeView
            repairs={repairs}
            quoteItems={quoteItems}
            onOpenWorkbench={() => setActiveView('workbench')}
            onOpenProcurement={() => setActiveView('procurement')}
            onOpenQuote={() => setActiveView('quote')}
            onOpenHistory={(stageFilter) => {
              setHistoryStageFilter(stageFilter || 'all');
              setActiveView('history');
            }}
            onOpenImport={() => setImportModalOpen(true)}
            onLoadRepair={handleLoadRepair}
            onChangeStage={handleChangeStage}
          />
        )}

        {activeView === 'workbench' && (
          <RepairWorkbenchView
            ticket={currentTicket}
            result={calculationResult}
            partsCatalog={partsCatalog}
            serviceRates={serviceRates}
            suppliers={suppliers}
            settings={settings}
            knownClients={knownClients}
            onChange={updateTicketState}
            onClearFields={handleClearWorkbench}
            onSaveAsNew={handleSaveAsNewRepair}
            onUpdateExisting={handleUpdateExistingRepair}
            onAddToQuote={handleAddToQuote}
            onOpenQuote={() => setActiveView('quote')}
            onOpenSettings={() => setActiveView('database')}
            onNotify={notify}
          />
        )}

        {activeView === 'procurement' && (
          <PartsProcurementView
            repairs={repairs}
            suppliers={suppliers}
            onUpdatePartInRepair={handleUpdatePartInRepair}
            onOpenRepair={handleLoadRepair}
            onNotify={notify}
          />
        )}

        {activeView === 'quote' && (
          <QuoteBuilderView
            items={quoteItems}
            attachments={quoteAttachments}
            settings={settings}
            initialClientName={currentTicket.clientName}
            initialClientContact={currentTicket.clientContact}
            initialReplicaLabel={formatReplicaLabel(currentTicket)}
            onUpdateItemQty={(id, qty) => {
              const next = quoteItems.map((it) => {
                if (it.id !== id) return it;
                const unitTax = it.totalWithIncomeTax / it.quantity;
                const unitGross = it.totalGrossPrice / it.quantity;
                const unitCost = it.totalCost / it.quantity;
                const unitProfit = it.totalProfit / it.quantity;
                return {
                  ...it,
                  quantity: qty,
                  totalNetPrice: it.unitNetPrice * qty,
                  totalWithIncomeTax: unitTax * qty,
                  totalGrossPrice: unitGross * qty,
                  totalCost: unitCost * qty,
                  totalProfit: unitProfit * qty,
                };
              });
              updateQuoteState(next, quoteAttachments);
            }}
            onRemoveItem={(id) => {
              const next = quoteItems.filter((it) => it.id !== id);
              updateQuoteState(next, quoteAttachments);
            }}
            onAddAttachments={(added) => {
              const next = [...quoteAttachments, ...added].slice(0, 6);
              updateQuoteState(quoteItems, next);
            }}
            onUpdateAttachmentCaption={(id, caption) => {
              const next = quoteAttachments.map((a) =>
                a.id === id ? { ...a, caption } : a
              );
              updateQuoteState(quoteItems, next);
            }}
            onRemoveAttachment={(id) => {
              const next = quoteAttachments.filter((a) => a.id !== id);
              updateQuoteState(quoteItems, next);
            }}
            onClearQuote={() => {
              updateQuoteState([], []);
              notify('Wyczyszczono kosztorys.');
            }}
            onBackToWorkbench={() => setActiveView('workbench')}
            onNotify={notify}
          />
        )}

        {activeView === 'history' && (
          <HistoryView
            key={historyStageFilter}
            repairs={repairs}
            initialStageFilter={historyStageFilter}
            onLoadRepair={handleLoadRepair}
            onDuplicateRepair={handleDuplicateRepair}
            onChangeStage={handleChangeStage}
            onChangePaymentStatus={handleChangePaymentStatus}
            onChangeDocumentRef={handleChangeDocumentRef}
            onDeleteRepair={handleDeleteRepair}
            onOpenImport={() => setImportModalOpen(true)}
            onNotify={notify}
          />
        )}

        {activeView === 'database' && (
          <DatabaseView
            partsCatalog={partsCatalog}
            serviceRates={serviceRates}
            suppliers={suppliers}
            settings={settings}
            onSavePartsCatalog={(nextParts) =>
              handleSaveConfig(nextParts, serviceRates, suppliers, settings)
            }
            onSaveServiceRates={(nextRates) =>
              handleSaveConfig(partsCatalog, nextRates, suppliers, settings)
            }
            onSaveSuppliers={(nextSuppliers) =>
              handleSaveConfig(partsCatalog, serviceRates, nextSuppliers, settings)
            }
            onSaveSettings={(nextSettings) =>
              handleSaveConfig(partsCatalog, serviceRates, suppliers, nextSettings)
            }
            onNotify={notify}
          />
        )}
      </main>

      <ImportOrdersModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        partsCatalog={partsCatalog}
        settings={settings}
        existingRepairs={repairs}
        onImportRepairs={handleImportRepairs}
        onNotify={notify}
      />

      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-stone-700 bg-[#181b18] px-4 py-2.5 text-xs font-medium text-white shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
