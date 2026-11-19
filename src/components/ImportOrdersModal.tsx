import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AirsoftWorkshopSettings,
  DriveType,
  PartsCatalogItem,
  PaymentStatus,
  RepairStage,
  SavedRepairOrder,
  ServiceScope,
} from '../types/airsoft';
import {
  DRIVE_TYPE_LABELS,
  ImportedRepairDraft,
  REPAIR_STAGE_LABELS,
  REPAIR_STAGE_ORDER,
  SERVICE_SCOPE_LABELS,
  buildImportedRepairOrder,
  formatPln,
} from '../utils/airsoftCalculations';
import {
  PreparedAiImage,
  extractClipboardImages,
  prepareImageForAiImport,
} from '../utils/imageAttachments';
import { InfoTooltip } from './InfoTooltip';

interface ImportOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  partsCatalog: PartsCatalogItem[];
  settings: AirsoftWorkshopSettings;
  existingRepairs: SavedRepairOrder[];
  onImportRepairs: (entries: SavedRepairOrder[]) => Promise<void> | void;
  onNotify: (msg: string) => void;
}

interface ApiImportedRepair {
  projectName?: string;
  orderDate?: string;
  serviceScope?: string;
  stage?: string;
  paymentStatus?: string;
  replicaBrand?: string;
  replicaModel?: string;
  driveType?: string;
  reportedFault?: string;
  diagnosisSummary?: string;
  agreedGrossPrice?: number | null;
  agreedPriceIsNet?: boolean;
  partsCostEstimate?: number | null;
  clientName?: string;
  clientContact?: string;
  clientDeliveryInfo?: string;
  orderSource?: string;
  documentRef?: string;
  technicalNotes?: string;
  extractionNote?: string;
}

const VALID_SCOPES: ServiceScope[] = [
  'diagnostyka_naprawa',
  'przeglad',
  'kastomizacja',
  'diagnostyka_tylko',
];
const VALID_PAYMENTS: PaymentStatus[] = [
  'oczekuje',
  'zaliczka',
  'oplacone',
  'wyslane',
];
const VALID_DRIVES: DriveType[] = ['AEG', 'HPA', 'GBB', 'CO2', 'Spring', 'Inny'];
const ORDER_SOURCES = [
  'E-mail',
  'OLX',
  'Allegro',
  'Telefon / SMS',
  'Social Media',
  'Inne',
];

function createEmptyDraft(): ImportedRepairDraft {
  return {
    tempId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    selected: true,
    projectName: '',
    orderDate: new Date().toISOString().slice(0, 10),
    serviceScope: 'diagnostyka_naprawa',
    stage: 'gotowe',
    paymentStatus: 'oplacone',
    replicaBrand: '',
    replicaModel: '',
    driveType: 'AEG',
    reportedFault: '',
    diagnosisSummary: '',
    agreedPrice: 0,
    agreedPriceIsNet: false,
    partsCostEstimate: 0,
    clientName: '',
    clientContact: '',
    clientDeliveryInfo: '',
    orderSource: 'E-mail',
    documentRef: '',
    technicalNotes: '',
    extractionNote: '',
  };
}

export const ImportOrdersModal: React.FC<ImportOrdersModalProps> = ({
  isOpen,
  onClose,
  partsCatalog,
  settings,
  existingRepairs,
  onImportRepairs,
  onNotify,
}) => {
  const [step, setStep] = useState<'source' | 'review'>('source');
  const [rawText, setRawText] = useState('');
  const [aiImages, setAiImages] = useState<PreparedAiImage[]>([]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [drafts, setDrafts] = useState<ImportedRepairDraft[]>([]);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const textFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAnalyzing && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAnalyzing, isSaving, onClose]);

  const addImageFiles = async (files: File[]) => {
    const remainingSlots = Math.max(0, 6 - aiImages.length);
    if (remainingSlots === 0) {
      onNotify('Możesz dodać maksymalnie 6 zrzutów ekranu do jednej analizy.');
      return;
    }

    const imageFiles = files
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, remainingSlots);
    if (imageFiles.length === 0) return;

    try {
      const prepared = await Promise.all(
        imageFiles.map((f) =>
          prepareImageForAiImport(f, f.name || 'zrzut-ekranu.png')
        )
      );
      setAiImages((prev) => [...prev, ...prepared].slice(0, 6));
      setErrorMsg(null);
    } catch {
      setErrorMsg('Nie udało się wczytać jednego ze zrzutów ekranu.');
    }
  };

  const addImageFilesRef = useRef(addImageFiles);
  addImageFilesRef.current = addImageFiles;

  useEffect(() => {
    if (!isOpen || step !== 'source') return;
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const imgs = extractClipboardImages(e.clipboardData);
      if (imgs.length > 0) {
        e.preventDefault();
        void addImageFilesRef.current(imgs);
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [isOpen, step]);

  const handleTextFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const content = await file.text();
      setRawText((prev) =>
        prev.trim() ? `${prev.trim()}\n\n--- ${file.name} ---\n${content}` : content
      );
      setErrorMsg(null);
      onNotify(`Wczytano zawartość pliku ${file.name}.`);
    } catch {
      setErrorMsg('Nie udało się odczytać pliku tekstowego / CSV.');
    }
  };

  const handleRemoveImage = (index: number) => {
    setAiImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!rawText.trim() && aiImages.length === 0) {
      setErrorMsg(
        'Wklej historię korespondencji / tabelę albo dodaj co najmniej jeden zrzut ekranu.'
      );
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/import-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawText.trim(),
          images: aiImages.map((img) => ({
            mimeType: img.mimeType,
            dataBase64: img.dataBase64,
          })),
          todayIso: new Date().toISOString().slice(0, 10),
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          json?.error || 'Błąd podczas analizy materiałów do importu.'
        );
      }

      const rawOrders: ApiImportedRepair[] = Array.isArray(json?.data?.orders)
        ? json.data.orders
        : [];

      if (rawOrders.length === 0) {
        setErrorMsg(
          'Nie rozpoznano żadnego zlecenia ASG w podanych materiałach. Możesz doprecyzować opis lub dodać wiersz ręcznie.'
        );
        setIsAnalyzing(false);
        return;
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const mappedDrafts: ImportedRepairDraft[] = rawOrders.map((item, idx) => {
        const scope = VALID_SCOPES.includes(item.serviceScope as ServiceScope)
          ? (item.serviceScope as ServiceScope)
          : 'diagnostyka_naprawa';
        const stage = REPAIR_STAGE_ORDER.includes(item.stage as RepairStage)
          ? (item.stage as RepairStage)
          : 'gotowe';
        const paymentStatus = VALID_PAYMENTS.includes(
          item.paymentStatus as PaymentStatus
        )
          ? (item.paymentStatus as PaymentStatus)
          : 'oplacone';
        const driveType = VALID_DRIVES.includes(item.driveType as DriveType)
          ? (item.driveType as DriveType)
          : 'AEG';

        const rawDate =
          typeof item.orderDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.orderDate.trim())
            ? item.orderDate.trim()
            : todayIso;

        const cleanSource = ORDER_SOURCES.includes(item.orderSource || '')
          ? (item.orderSource as string)
          : item.orderSource || 'E-mail';

        return {
          tempId: `imp-draft-${Date.now()}-${idx}`,
          selected: true,
          projectName:
            (item.projectName || '').trim() || `Naprawa / serwis ASG #${idx + 1}`,
          orderDate: rawDate,
          serviceScope: scope,
          stage,
          paymentStatus,
          replicaBrand: (item.replicaBrand || '').trim(),
          replicaModel: (item.replicaModel || '').trim(),
          driveType,
          reportedFault: (item.reportedFault || '').trim(),
          diagnosisSummary: (item.diagnosisSummary || '').trim(),
          agreedPrice:
            typeof item.agreedGrossPrice === 'number' && item.agreedGrossPrice > 0
              ? Number(item.agreedGrossPrice)
              : 0,
          agreedPriceIsNet: Boolean(item.agreedPriceIsNet),
          partsCostEstimate:
            typeof item.partsCostEstimate === 'number' &&
            item.partsCostEstimate > 0
              ? Number(item.partsCostEstimate)
              : 0,
          clientName: (item.clientName || '').trim(),
          clientContact: (item.clientContact || '').trim(),
          clientDeliveryInfo: (item.clientDeliveryInfo || '').trim(),
          orderSource: cleanSource,
          documentRef: (item.documentRef || '').trim(),
          technicalNotes: (item.technicalNotes || '').trim(),
          extractionNote: (item.extractionNote || '').trim(),
        };
      });

      setDrafts(mappedDrafts);
      setStep('review');
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Błąd połączenia podczas analizy importu.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartManual = () => {
    setDrafts([createEmptyDraft()]);
    setErrorMsg(null);
    setStep('review');
  };

  const handleAddEmptyDraft = () => {
    setDrafts((prev) => [...prev, createEmptyDraft()]);
  };

  const updateDraft = (tempId: string, patch: Partial<ImportedRepairDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d))
    );
  };

  const removeDraft = (tempId: string) => {
    setDrafts((prev) => prev.filter((d) => d.tempId !== tempId));
  };

  const previews = useMemo(
    () =>
      drafts.map((d, idx) =>
        buildImportedRepairOrder(d, settings, partsCatalog, idx)
      ),
    [drafts, settings, partsCatalog]
  );

  const duplicateFlags = useMemo(() => {
    return drafts.map((d) => {
      const nameNorm = d.projectName.trim().toLowerCase();
      const docNorm = d.documentRef.trim().toLowerCase();
      const clientNorm = d.clientName.trim().toLowerCase();

      return existingRepairs.some((existing) => {
        if (
          docNorm &&
          (existing.documentRef || '').trim().toLowerCase() === docNorm
        ) {
          return true;
        }
        const exName = (existing.ticket.projectName || '').trim().toLowerCase();
        const exClient = (existing.ticket.clientName || '').trim().toLowerCase();
        if (
          nameNorm &&
          exName === nameNorm &&
          (!clientNorm || exClient === clientNorm)
        ) {
          return true;
        }
        return false;
      });
    });
  }, [drafts, existingRepairs]);

  const selectedCount = drafts.filter((d) => d.selected).length;

  const handleConfirmImport = async () => {
    const chosen = drafts
      .map((d, idx) => ({ draft: d, built: previews[idx] }))
      .filter((pair) => pair.draft.selected);

    if (chosen.length === 0) {
      setErrorMsg('Zaznacz co najmniej jedno zlecenie do zapisania w bazie.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      await onImportRepairs(chosen.map((c) => c.built));
      setRawText('');
      setAiImages([]);
      setDrafts([]);
      setStep('source');
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Nie udało się zapisać zaimportowanych zleceń.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-0 sm:p-4 backdrop-blur-[1px]">
      <div className="flex h-full max-h-full sm:h-auto sm:max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 truncate">
              Import istniejących napraw i zleceń ASG
            </h2>
            <InfoTooltip text="Przenieś wcześniejsze naprawy i tuningi replik, wklejając rozmowy z OLX/Allegro/e-maila, listy CSV lub zrzuty ekranu (Ctrl+V)." />
            <div className="ml-2 hidden sm:flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setStep('source')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  step === 'source'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Korespondencja i zrzuty
              </button>
              <button
                type="button"
                onClick={() => {
                  if (drafts.length === 0) {
                    handleStartManual();
                  } else {
                    setStep('review');
                  }
                }}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  step === 'review'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Weryfikacja i zapis ({drafts.length})
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing || isSaving}
            aria-label="Zamknij okno importu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Step Switcher */}
        <div className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-slate-50 p-1.5 text-xs sm:hidden">
          <button
            type="button"
            onClick={() => setStep('source')}
            className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
              step === 'source'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            1. Dane i zrzuty
          </button>
          <button
            type="button"
            onClick={() => {
              if (drafts.length === 0) {
                handleStartManual();
              } else {
                setStep('review');
              }
            }}
            className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
              step === 'review'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            2. Weryfikacja ({drafts.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto bg-[#f3f4f2] p-3.5 sm:p-6">
          {errorMsg && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 'source' ? (
            <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="import-raw-text"
                      className="text-sm font-semibold text-slate-900"
                    >
                      Historia korespondencji lub lista napraw ASG
                    </label>
                    <InfoTooltip text="Wklej wątek e-mail, czat Messenger/OLX/Allegro/SMS albo wiersze z Excela. AI rozpozna markę repliki, usterkę, wycenę oraz klienta." />
                  </div>
                  <input
                    ref={textFileInputRef}
                    type="file"
                    accept=".txt,.csv,.tsv,.log,.md"
                    className="hidden"
                    onChange={(e) => {
                      void handleTextFileUpload(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => textFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
                    Wczytaj .csv / .txt
                  </button>
                </div>

                <textarea
                  id="import-raw-text"
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Wklej tutaj wiadomości z klientem o naprawie lub tuningu repliki, daty, kwoty, listę części albo wiersze z arkusza...&#10;&#10;Możesz też nacisnąć Ctrl+V ze zrzutem ekranu w schowku."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#e88a00] focus:outline-none sm:min-h-[240px]"
                />
              </section>

              <section className="flex flex-col justify-between space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900">
                        Zrzuty ekranu ({aiImages.length}/6)
                      </span>
                      <InfoTooltip
                        align="right"
                        text="Obsługuje zrzuty czatów, zamówień z Taiwangun/Gunfire, listów przewozowych oraz notatek serwisowych."
                      />
                    </div>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          void addImageFiles(Array.from(e.target.files));
                        }
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={aiImages.length >= 6}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Dodaj pliki
                    </button>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files) {
                        void addImageFiles(Array.from(e.dataTransfer.files));
                      }
                    }}
                    className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                      isDragging
                        ? 'border-[#e88a00] bg-amber-50/50'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <ImagePlus className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-xs font-medium text-slate-700">
                      Naciśnij{' '}
                      <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px]">
                        Ctrl+V
                      </kbd>{' '}
                      lub przeciągnij zrzuty tutaj
                    </p>
                  </div>

                  {aiImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {aiImages.map((img, idx) => (
                        <div
                          key={img.id}
                          className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                        >
                          <img
                            src={img.previewUrl}
                            alt={img.fileName}
                            className="h-24 w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            aria-label="Usuń zrzut"
                            className="absolute right-1.5 top-1.5 rounded-md bg-slate-900/75 p-1 text-white opacity-90 hover:bg-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              {drafts.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                  <p className="text-sm font-semibold text-slate-900">
                    Brak pozycji na liście do importu
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddEmptyDraft}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#e88a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#cf7b00]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Dodaj zlecenie ręcznie
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('source')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Wróć do wklejania
                    </button>
                  </div>
                </div>
              ) : (
                drafts.map((draft, idx) => {
                  const preview = previews[idx];
                  const isPossibleDuplicate = duplicateFlags[idx];

                  return (
                    <div
                      key={draft.tempId}
                      className={`rounded-xl border bg-white p-4 sm:p-5 transition-opacity ${
                        draft.selected
                          ? 'border-slate-200'
                          : 'border-slate-200 opacity-55'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-100 pb-3">
                        <div className="flex flex-1 flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                selected: e.target.checked,
                              })
                            }
                            aria-label="Wybierz zlecenie do importu"
                            className="h-4 w-4 rounded border-slate-300 text-[#e88a00] focus:ring-[#e88a00] shrink-0"
                          />
                          <input
                            type="text"
                            value={draft.projectName}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                projectName: e.target.value,
                              })
                            }
                            placeholder="Tytuł zlecenia serwisowego"
                            className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-900 focus:border-[#e88a00] focus:outline-none"
                          />
                          <input
                            type="date"
                            value={draft.orderDate}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                orderDate: e.target.value,
                              })
                            }
                            aria-label="Data historyczna zlecenia"
                            className="w-full sm:w-auto rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none tabular-nums"
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          {isPossibleDuplicate && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Podobne zlecenie już istnieje
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeDraft(draft.tempId)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Usuń z listy importu"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {draft.extractionNote && (
                        <p className="mt-2.5 text-xs text-[#b86d00]">
                          {draft.extractionNote}
                        </p>
                      )}

                      {/* Stage, Scope, Payment, Source, DocRef */}
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Zakres
                          </label>
                          <select
                            value={draft.serviceScope}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                serviceScope: e.target.value as ServiceScope,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          >
                            {(Object.keys(SERVICE_SCOPE_LABELS) as ServiceScope[]).map(
                              (sc) => (
                                <option key={sc} value={sc}>
                                  {SERVICE_SCOPE_LABELS[sc]}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Etap procesu
                          </label>
                          <select
                            value={draft.stage}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                stage: e.target.value as RepairStage,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          >
                            {REPAIR_STAGE_ORDER.map((st) => (
                              <option key={st} value={st}>
                                {REPAIR_STAGE_LABELS[st]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Status płatności
                          </label>
                          <select
                            value={draft.paymentStatus}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                paymentStatus: e.target.value as PaymentStatus,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          >
                            <option value="oczekuje">Oczekuje</option>
                            <option value="zaliczka">Zaliczka</option>
                            <option value="oplacone">Opłacone</option>
                            <option value="wyslane">Wysłane</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Źródło
                          </label>
                          <select
                            value={draft.orderSource}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                orderSource: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          >
                            {ORDER_SOURCES.map((src) => (
                              <option key={src} value={src}>
                                {src}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Nr faktury / paczki
                          </label>
                          <input
                            type="text"
                            value={draft.documentRef}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                documentRef: e.target.value,
                              })
                            }
                            placeholder="np. FV/10/2025 lub InPost"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Replica & Client */}
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Producent repliki
                          </label>
                          <input
                            type="text"
                            value={draft.replicaBrand}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                replicaBrand: e.target.value,
                              })
                            }
                            placeholder="np. Specna Arms"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Model repliki
                          </label>
                          <input
                            type="text"
                            value={draft.replicaModel}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                replicaModel: e.target.value,
                              })
                            }
                            placeholder="np. MK18 SA-E07"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Napęd
                          </label>
                          <select
                            value={draft.driveType}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                driveType: e.target.value as DriveType,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          >
                            {VALID_DRIVES.map((dt) => (
                              <option key={dt} value={dt}>
                                {DRIVE_TYPE_LABELS[dt]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Klient
                          </label>
                          <input
                            type="text"
                            value={draft.clientName}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                clientName: e.target.value,
                              })
                            }
                            placeholder="Imię / nick"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Kontakt
                          </label>
                          <input
                            type="text"
                            value={draft.clientContact}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                clientContact: e.target.value,
                              })
                            }
                            placeholder="E-mail / telefon"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Dostawa / NIP
                          </label>
                          <input
                            type="text"
                            value={draft.clientDeliveryInfo}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                clientDeliveryInfo: e.target.value,
                              })
                            }
                            placeholder="Paczkomat / adres"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Fault, Diagnosis & Financials */}
                      <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-6">
                        <div className="lg:col-span-2">
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Zgłoszona usterka
                          </label>
                          <input
                            type="text"
                            value={draft.reportedFault}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                reportedFault: e.target.value,
                              })
                            }
                            placeholder="Objawy podane przez klienta"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Rozpoznanie / wykonany zakres
                          </label>
                          <input
                            type="text"
                            value={draft.diagnosisSummary}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                diagnosisSummary: e.target.value,
                              })
                            }
                            placeholder="Co zdiagnozowano / wymieniono"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Koszt części (zł)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={draft.partsCostEstimate}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                partsCostEstimate: Math.max(
                                  0,
                                  parseFloat(e.target.value) || 0
                                ),
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Ustalona kwota ({draft.agreedPriceIsNet ? 'netto' : 'brutto'})
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={draft.agreedPrice}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                agreedPrice: Math.max(
                                  0,
                                  parseFloat(e.target.value) || 0
                                ),
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums focus:border-[#e88a00] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{preview.replicaLabel}</span>
                        <div className="flex items-center gap-4 font-mono tabular-nums">
                          <span>
                            Zysk warsztatu:{' '}
                            <strong
                              className={
                                preview.result.workshopProfit >= 0
                                  ? 'text-emerald-700'
                                  : 'text-red-600'
                              }
                            >
                              {formatPln(preview.result.workshopProfit)}
                            </strong>
                          </span>
                          <span>
                            Brutto:{' '}
                            <strong className="text-slate-900">
                              {formatPln(preview.result.grossPrice)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          {step === 'source' ? (
            <>
              <button
                type="button"
                onClick={handleStartManual}
                className="text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
              >
                Wpisz ręcznie bez AI
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 rounded-lg bg-[#e88a00] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#cf7b00] disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analizuję dane ASG...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Rozpoznaj zlecenia ASG (AI)
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('source')}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Wróć
                </button>
                <button
                  type="button"
                  onClick={handleAddEmptyDraft}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Dodaj wiersz
                </button>
              </div>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isSaving || selectedCount === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Zapisywanie...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    Zapisz zaznaczone ({selectedCount})
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
