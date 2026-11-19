import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Mail,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import {
  AirsoftWorkshopSettings,
  AttachmentImage,
  QuoteLineItem,
} from '../types/airsoft';
import { formatPln } from '../utils/airsoftCalculations';
import {
  DEFAULT_LEAD_TIMES,
  QuoteLanguage,
  buildMultiEstimateEmailReply,
} from '../utils/airsoftEmailTemplates';
import {
  compressImageFileToAttachment,
  extractClipboardImages,
} from '../utils/imageAttachments';
import { InfoTooltip } from './InfoTooltip';

interface QuoteBuilderViewProps {
  items: QuoteLineItem[];
  attachments: AttachmentImage[];
  settings: AirsoftWorkshopSettings;
  initialClientName?: string;
  initialClientContact?: string;
  initialReplicaLabel?: string;
  onUpdateItemQty: (id: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onAddAttachments: (added: AttachmentImage[]) => void;
  onUpdateAttachmentCaption: (id: string, caption: string) => void;
  onRemoveAttachment: (id: string) => void;
  onClearQuote: () => void;
  onBackToWorkbench: () => void;
  onNotify: (msg: string) => void;
}

export const QuoteBuilderView: React.FC<QuoteBuilderViewProps> = ({
  items,
  attachments,
  settings,
  initialClientName = '',
  initialClientContact = '',
  initialReplicaLabel = '',
  onUpdateItemQty,
  onRemoveItem,
  onAddAttachments,
  onUpdateAttachmentCaption,
  onRemoveAttachment,
  onClearQuote,
  onBackToWorkbench,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<QuoteLanguage>('pl');
  const [clientName, setClientName] = useState(initialClientName);
  const [clientContact, setClientContact] = useState(initialClientContact);
  const [replicaLabel, setReplicaLabel] = useState(initialReplicaLabel);
  const [quoteNumber, setQuoteNumber] = useState(
    () =>
      `ASG/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(
        2,
        '0'
      )}/01`
  );
  const [leadTime, setLeadTime] = useState(DEFAULT_LEAD_TIMES.pl[1]);
  const [shippingGross, setShippingGross] = useState(0);
  const [showInternalMargin, setShowInternalMargin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const prevInitialNameRef = useRef(initialClientName);
  const prevInitialContactRef = useRef(initialClientContact);
  const prevInitialReplicaRef = useRef(initialReplicaLabel);

  useEffect(() => {
    if (initialClientName !== prevInitialNameRef.current) {
      prevInitialNameRef.current = initialClientName;
      setClientName(initialClientName);
    }
  }, [initialClientName]);

  useEffect(() => {
    if (initialClientContact !== prevInitialContactRef.current) {
      prevInitialContactRef.current = initialClientContact;
      setClientContact(initialClientContact);
    }
  }, [initialClientContact]);

  useEffect(() => {
    if (initialReplicaLabel !== prevInitialReplicaRef.current) {
      prevInitialReplicaRef.current = initialReplicaLabel;
      setReplicaLabel(initialReplicaLabel);
    }
  }, [initialReplicaLabel]);

  const handleLanguageChange = (nextLang: QuoteLanguage) => {
    setLang(nextLang);
    if (
      DEFAULT_LEAD_TIMES.pl.includes(leadTime) ||
      DEFAULT_LEAD_TIMES.ukr.includes(leadTime)
    ) {
      const idx =
        DEFAULT_LEAD_TIMES.pl.indexOf(leadTime) !== -1
          ? DEFAULT_LEAD_TIMES.pl.indexOf(leadTime)
          : DEFAULT_LEAD_TIMES.ukr.indexOf(leadTime);
      setLeadTime(DEFAULT_LEAD_TIMES[nextLang][idx >= 0 ? idx : 1]);
    }
  };

  const handleAddFiles = async (files: File[]) => {
    const remaining = Math.max(0, 6 - attachments.length);
    if (remaining === 0) {
      onNotify('Maksymalnie 6 zdjęć z diagnostyki na jednym kosztorysie PDF.');
      return;
    }
    const batch = files.slice(0, remaining);
    const created: AttachmentImage[] = [];
    for (let i = 0; i < batch.length; i++) {
      const idx = attachments.length + i + 1;
      try {
        const att = await compressImageFileToAttachment(
          batch[i],
          idx === 1 ? 'Diagnostyka / pomiar chrono' : `Zdjęcie serwisowe #${idx}`
        );
        created.push(att);
      } catch {
        onNotify('Nie udało się odczytać obrazu ze schowka lub dysku.');
      }
    }
    if (created.length > 0) {
      onAddAttachments(created);
      onNotify(
        created.length === 1
          ? 'Dodano zdjęcie z diagnostyki do kosztorysu PDF.'
          : `Dodano ${created.length} zdjęcia do kosztorysu PDF.`
      );
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
        void handleAddFiles(images);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const itemsGrossSum = items.reduce((s, i) => s + i.totalGrossPrice, 0);
  const totalCostSum = items.reduce((s, i) => s + i.totalCost, 0);
  const totalProfitSum = items.reduce((s, i) => s + i.totalProfit, 0);
  const totalGrossWithShipping = itemsGrossSum + Math.max(0, shippingGross || 0);

  const emailReplyText = useMemo(
    () =>
      buildMultiEstimateEmailReply({
        lang,
        quoteNumber,
        replicaLabel: replicaLabel.trim() || 'repliki ASG',
        items,
        shippingGross: Math.max(0, shippingGross || 0),
        totalGross: totalGrossWithShipping,
        leadTime,
        companyName: settings.companyName || 'AIRSOFT Serwis & Custom',
        hasPhotos: attachments.length > 0,
      }),
    [
      lang,
      quoteNumber,
      replicaLabel,
      items,
      shippingGross,
      totalGrossWithShipping,
      leadTime,
      settings.companyName,
      attachments.length,
    ]
  );

  const handleCopyEmail = async () => {
    if (items.length === 0) return;
    try {
      await navigator.clipboard.writeText(emailReplyText);
      setCopied(true);
      onNotify(
        lang === 'pl'
          ? 'Skopiowano kosztorys e-mail (PL) z cenami brutto.'
          : 'Скопійовано кошторис e-mail (UKR) з цінами брутто.'
      );
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onNotify('Nie udało się skopiować treści.');
    }
  };

  const mailtoHref = `mailto:?subject=${encodeURIComponent(
    lang === 'pl'
      ? `Kosztorys serwisu (${quoteNumber}) — ${settings.companyName || 'AIRSOFT Serwis'}`
      : `Кошторис сервісу (${quoteNumber}) — ${settings.companyName || 'AIRSOFT Serwis'}`
  )}&body=${encodeURIComponent(emailReplyText)}`;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-10 text-center">
        <div className="inline-flex items-center justify-center gap-1.5">
          <h2 className="text-lg font-semibold text-slate-900">
            Kosztorys dla klienta jest pusty
          </h2>
          <InfoTooltip text="Dobierz części i robociznę w karcie zlecenia w Warsztacie, a następnie kliknij „Dodaj do PDF”, aby wygenerować kosztorys." />
        </div>
        <div className="mt-5">
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="inline-flex items-center gap-2 rounded-lg bg-[#e88a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#cf7b00]"
          >
            <ArrowLeft className="h-4 w-4" />
            Wróć do warsztatu
          </button>
        </div>
      </div>
    );
  }

  const copyLabels =
    lang === 'pl'
      ? {
          offerTitle: 'KOSZTORYS SERWISU / KASTOMIZACJI ASG',
          date: 'Data wystawienia',
          leadTime: 'Szacowany czas realizacji',
          recipient: 'Klient i replika',
          lp: 'Lp.',
          item: 'Część / Usługa serwisowa',
          qty: 'Ilość',
          unitGross: 'Cena brutto / szt.',
          totalGross: 'Wartość brutto',
          shipping: 'Wysyłka zwrotna i pakowanie',
          sumGross: 'Razem do zapłaty (brutto)',
          previewTitle: 'Dokumentacja fotograficzna (diagnostyka / chrono)',
          note: 'W celu zamówienia części i rozpoczęcia prac prosimy o akceptację kosztorysu w odpowiedzi na wiadomość.',
        }
      : {
          offerTitle: 'КОШТОРИС СЕРВІСУ ТА ТЮНІНГУ ASG',
          date: 'Дата',
          leadTime: 'Орієнтовний термін виконання',
          recipient: 'Клієнт та репліка',
          lp: '№',
          item: 'Запчастина / Послуга',
          qty: 'К-сть',
          unitGross: 'Ціна брутто / шт.',
          totalGross: 'Разом брутто',
          shipping: 'Зворотна доставка та пакування',
          sumGross: 'Разом до сплати (брутто)',
          previewTitle: 'Фотографії з діагностики та замірів хронографа',
          note: 'Для замовлення запчастин та початку робіт, будь ласка, підтвердіть кошторис у відповідь.',
        };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="no-print flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Warsztat
          </button>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => handleLanguageChange('pl')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                lang === 'pl'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              PL
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('ukr')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                lang === 'ukr'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              UKR
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowInternalMargin(!showInternalMargin)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              showInternalMargin
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {showInternalMargin ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {showInternalMargin ? 'Ukryj marżę wewn.' : 'Pokaż marżę wewn.'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length > 0) void handleAddFiles(files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= 6}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-[#e88a00] hover:bg-amber-50/40 disabled:opacity-40"
            title="Możesz też wkleić zdjęcie przez Ctrl+V"
          >
            <ImagePlus className="h-3.5 w-3.5 text-[#e88a00]" />
            Zdjęcia ({attachments.length}/6)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {confirmClear ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmClear(false);
                  onClearQuote();
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Potwierdź wyczyszczenie
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Anuluj
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Wyczyść kosztorys
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg bg-[#e88a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#cf7b00] whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" />
            Drukuj / Zapisz PDF
          </button>
        </div>
      </div>

      {showInternalMargin && (
        <div className="no-print grid grid-cols-2 gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:grid-cols-3 sm:gap-4">
          <div>
            <p className="text-xs text-emerald-800">Koszt zakupu części (wewn.)</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
              {formatPln(totalCostSum)}
            </p>
          </div>
          <div>
            <p className="text-xs text-emerald-800">Łączny zysk warsztatu (netto)</p>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums">
              {formatPln(totalProfitSum)}
            </p>
          </div>
          <div>
            <p className="text-xs text-emerald-800">Wartość kosztorysu (brutto)</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
              {formatPln(totalGrossWithShipping)}
            </p>
          </div>
        </div>
      )}

      <div className="no-print grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Numer kosztorysu
          </label>
          <input
            type="text"
            value={quoteNumber}
            onChange={(e) => setQuoteNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Replika (na PDF)
          </label>
          <input
            type="text"
            value={replicaLabel}
            onChange={(e) => setReplicaLabel(e.target.value)}
            placeholder="np. Specna Arms MK18 (AEG)"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Klient (na PDF)
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Imię / Nick"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Kontakt klienta
          </label>
          <input
            type="text"
            value={clientContact}
            onChange={(e) => setClientContact(e.target.value)}
            placeholder="Telefon / e-mail"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Termin realizacji
          </label>
          <input
            type="text"
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Wysyłka zwrotna (zł)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={shippingGross || ''}
            placeholder="0"
            onChange={(e) =>
              setShippingGross(Math.max(0, parseFloat(e.target.value) || 0))
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-[#e88a00] focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7 rounded-xl border border-slate-200 bg-white p-4 sm:p-8 print:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <p className="text-xs font-semibold tracking-wide text-[#e88a00]">
                {copyLabels.offerTitle}
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                {quoteNumber}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {copyLabels.date}: {new Date().toLocaleDateString('pl-PL')} ·{' '}
                {copyLabels.leadTime}: {leadTime}
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end text-xs text-slate-600 space-y-0.5">
              <p className="font-display text-sm font-bold text-slate-900">
                {settings.companyName || 'AIRSOFT Serwis & Custom'}
              </p>
              {settings.companyNip && <p>NIP: {settings.companyNip}</p>}
              {settings.companyEmail && <p>{settings.companyEmail}</p>}
              {settings.companyPhone && <p>{settings.companyPhone}</p>}
            </div>
          </div>

          {(clientName || clientContact || replicaLabel) && (
            <div className="mt-4 border-b border-slate-100 pb-3 text-xs">
              <p className="font-medium text-slate-500">{copyLabels.recipient}:</p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                {clientName && (
                  <p className="text-sm font-semibold text-slate-900">{clientName}</p>
                )}
                {replicaLabel && (
                  <p className="font-medium text-slate-700">{replicaLabel}</p>
                )}
              </div>
              {clientContact && <p className="text-slate-600">{clientContact}</p>}
            </div>
          )}

          {/* Mobile items view */}
          <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100 sm:hidden print:hidden">
            {items.map((item, idx) => (
              <div key={item.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      <span className="mr-1.5 font-mono text-xs text-slate-400">
                        {idx + 1}.
                      </span>
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500">{item.specLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                    aria-label="Usuń pozycję"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Ilość:</span>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        onUpdateItemQty(
                          item.id,
                          Math.max(1, parseInt(e.target.value, 10) || 1)
                        )
                      }
                      aria-label={`Ilość dla ${item.name}`}
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right font-mono text-xs tabular-nums"
                    />
                    <span className="text-slate-400 tabular-nums">
                      × {formatPln(item.totalGrossPrice / item.quantity)}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {formatPln(item.totalGrossPrice)}
                  </span>
                </div>
              </div>
            ))}
            {shippingGross > 0 && (
              <div className="flex items-center justify-between py-3 text-xs">
                <span className="font-medium text-slate-900">
                  {items.length + 1}. {copyLabels.shipping}
                </span>
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatPln(shippingGross)}
                </span>
              </div>
            )}
          </div>

          {/* Desktop & Print PDF Table */}
          <div className="mt-5 hidden sm:block print:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">{copyLabels.lp}</th>
                  <th className="py-2 pr-3 font-medium">{copyLabels.item}</th>
                  <th className="py-2 px-3 font-medium text-right">{copyLabels.qty}</th>
                  <th className="py-2 px-3 font-medium text-right">
                    {copyLabels.unitGross}
                  </th>
                  <th className="py-2 pl-3 font-medium text-right">
                    {copyLabels.totalGross}
                  </th>
                  <th className="no-print py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-3 font-mono text-xs text-slate-500 tabular-nums">
                      {idx + 1}.
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.specLabel}</p>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          onUpdateItemQty(
                            item.id,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        }
                        className="no-print w-16 rounded-md border border-slate-200 px-2 py-1 text-right font-mono text-xs tabular-nums"
                      />
                      <span className="hidden print:inline font-mono text-xs tabular-nums">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {formatPln(item.totalGrossPrice / item.quantity)}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatPln(item.totalGrossPrice)}
                    </td>
                    <td className="no-print py-3 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Usuń pozycję"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {shippingGross > 0 && (
                  <tr>
                    <td className="py-3 pr-3 font-mono text-xs text-slate-500">
                      {items.length + 1}.
                    </td>
                    <td className="py-3 pr-3 font-medium text-slate-900">
                      {copyLabels.shipping}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums">
                      1
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {formatPln(shippingGross)}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatPln(shippingGross)}
                    </td>
                    <td className="no-print"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <span className="text-sm font-semibold text-slate-900">
              {copyLabels.sumGross}:
            </span>
            <span className="font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {formatPln(totalGrossWithShipping)}
            </span>
          </div>

          {attachments.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-slate-800">
                  {copyLabels.previewTitle}
                </p>
                <span className="no-print">
                  <InfoTooltip text="Możesz wkleić kolejne zdjęcie ze schowka przez Ctrl+V (maks. 6)." />
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="break-inside-avoid rounded-lg border border-slate-200 bg-slate-50/70 p-2"
                  >
                    <div className="relative aspect-video overflow-hidden rounded bg-white">
                      <img
                        src={att.dataUrl}
                        alt={att.caption || 'Zdjęcie diagnostyczne ASG'}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(att.id)}
                        className="no-print absolute top-1.5 right-1.5 rounded bg-slate-900/75 p-1 text-white hover:bg-red-600"
                        title="Usuń zdjęcie z kosztorysu PDF"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={att.caption}
                      onChange={(e) =>
                        onUpdateAttachmentCaption(att.id, e.target.value)
                      }
                      placeholder="Podpis pod zdjęciem (np. uszkodzony tłok)"
                      className="no-print mt-1.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-[#e88a00] focus:outline-none"
                    />
                    {att.caption && (
                      <p className="hidden print:block mt-1.5 text-center text-[11px] text-slate-600">
                        {att.caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
            {copyLabels.note}
          </p>
        </div>

        <div className="no-print xl:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-slate-900">
                Gotowy szablon wiadomości e-mail ({lang.toUpperCase()})
              </h3>
              <InfoTooltip text="Zawiera wyszczególnione części i robociznę z cenami brutto dla klienta." />
            </div>
            <textarea
              rows={13}
              readOnly
              value={emailReplyText}
              className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyEmail}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Skopiowano!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Kopiuj odpowiedź ({lang.toUpperCase()})
                  </>
                )}
              </button>
              <a
                href={mailtoHref}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                Poczta
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
