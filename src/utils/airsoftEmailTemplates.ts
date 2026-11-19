import {
  QuoteLineItem,
  RepairCalculationResult,
  RepairTicketInput,
} from '../types/airsoft';
import { formatPln, formatReplicaLabel } from './airsoftCalculations';

export type QuoteLanguage = 'pl' | 'ukr';

export const DEFAULT_LEAD_TIMES: Record<QuoteLanguage, string[]> = {
  pl: [
    '1–2 dni robocze',
    '3–5 dni roboczych (z dostawą części)',
    '5–7 dni roboczych',
    '7–10 dni roboczych (zamówienie specjalne)',
  ],
  ukr: [
    '1–2 робочі дні',
    '3–5 робочих днів (з доставкою запчастин)',
    '5–7 робочих днів',
    '7–10 робочих днів (спецзамовлення)',
  ],
};

interface SingleRepairEmailParams {
  lang: QuoteLanguage;
  ticket: RepairTicketInput;
  result: RepairCalculationResult;
  leadTime: string;
  companyName: string;
}

export function buildSingleRepairEmailReply(
  params: SingleRepairEmailParams
): string {
  const { lang, ticket, result, leadTime, companyName } = params;
  const safeCompany = companyName.trim() || 'AIRSOFT Serwis & Custom';
  const replica = formatReplicaLabel(ticket);
  const vatFactor =
    result.netPrice > 0 ? result.grossPrice / result.netPrice : 1;

  const partLines = ticket.parts.map((p) => {
    const qty = Math.max(1, p.quantity || 1);
    if (p.suppliedByClient) {
      return lang === 'pl'
        ? `  - ${p.name} (${qty} szt.): część powierzona przez klienta (0,00 zł)`
        : `  - ${p.name} (${qty} шт.): запчастина клієнта (0,00 zł)`;
    }
    const partGross = p.clientUnitPrice * qty * vatFactor;
    return lang === 'pl'
      ? `  - ${p.name} (${qty} szt.): ${formatPln(partGross)} brutto`
      : `  - ${p.name} (${qty} шт.): ${formatPln(partGross)} брутто`;
  });

  const laborAndMaterialsGross =
    (result.laborTotal +
      result.consumablesCost +
      result.diagnosticFee +
      result.prioritySurchargeAmount) *
    vatFactor;

  const targetInfo =
    ticket.chrono.targetFps > 0
      ? lang === 'pl'
        ? `• Docelowa moc po serwisie: ok. ${ticket.chrono.targetFps} FPS (kulki ${ticket.chrono.bbWeightGrams} g)`
        : `• Цільова потужність після сервісу: бл. ${ticket.chrono.targetFps} FPS (кулі ${ticket.chrono.bbWeightGrams} г)`
      : null;

  const diagText = ticket.diagnosisSummary.trim();
  const hasPhotos = (ticket.attachments || []).length > 0;

  if (lang === 'ukr') {
    return [
      'Доброго дня!',
      '',
      `Надсилаємо результати діагностики та кошторис робіт для репліки ${replica}.`,
      ...(diagText ? ['', `• Виявлена несправність / діагноз: ${diagText}`] : []),
      ...(partLines.length > 0
        ? ['', '• Запчастини до замовлення / заміни:', ...partLines]
        : []),
      `• Робота сервісу та витратні матеріали: ${formatPln(laborAndMaterialsGross)} брутто`,
      `• Разом до сплати (брутто): ${formatPln(result.grossPrice)}`,
      ...(targetInfo ? [targetInfo] : []),
      `• Орієнтовний термін реалізації: ${leadTime}`,
      ...(hasPhotos
        ? [
            '',
            'У вкладенні надсилаємо фотографії з діагностики / вимірів хронографа.',
          ]
        : []),
      '',
      'Після Вашого підтвердження замовляємо запчастини та беремо репліку в роботу.',
      '',
      'З повагою,',
      safeCompany,
    ].join('\n');
  }

  return [
    'Dzień dobry,',
    '',
    `przesyłamy wyniki diagnostyki oraz kosztorys serwisu dla repliki ${replica}.`,
    ...(diagText ? ['', `• Rozpoznanie / wynik diagnostyki: ${diagText}`] : []),
    ...(partLines.length > 0
      ? ['', '• Części do zamówienia / wymiany:', ...partLines]
      : []),
    `• Robocizna serwisowa i materiały eksploatacyjne: ${formatPln(laborAndMaterialsGross)} brutto`,
    `• Łączny koszt realizacji (brutto): ${formatPln(result.grossPrice)}`,
    ...(targetInfo ? [targetInfo] : []),
    `• Szacowany czas realizacji: ${leadTime}`,
    ...(hasPhotos
      ? [
          '',
          'W załączeniu przesyłamy zdjęcia z diagnostyki oraz pomiarów na chronografie.',
        ]
      : []),
    '',
    'Po akceptacji kosztorysu zamawiamy części i przystępujemy do realizacji.',
    '',
    'Pozdrawiamy,',
    safeCompany,
  ].join('\n');
}

interface MultiEstimateEmailParams {
  lang: QuoteLanguage;
  quoteNumber: string;
  replicaLabel: string;
  items: QuoteLineItem[];
  shippingGross: number;
  totalGross: number;
  leadTime: string;
  companyName: string;
  hasPhotos?: boolean;
}

export function buildMultiEstimateEmailReply(
  params: MultiEstimateEmailParams
): string {
  const {
    lang,
    quoteNumber,
    replicaLabel,
    items,
    shippingGross,
    totalGross,
    leadTime,
    companyName,
    hasPhotos = false,
  } = params;
  const safeCompany = companyName.trim() || 'AIRSOFT Serwis & Custom';

  if (lang === 'ukr') {
    const lines = items.map(
      (item, idx) =>
        `${idx + 1}. ${item.name} (${item.specLabel}) — ${item.quantity} шт. — ${formatPln(
          item.totalGrossPrice
        )} брутто`
    );
    if (shippingGross > 0) {
      lines.push(`Зворотна доставка та пакування — ${formatPln(shippingGross)} брутто`);
    }
    return [
      'Доброго дня!',
      '',
      `Надсилаємо детальний кошторис (${quoteNumber}) для ${replicaLabel || 'репліки ASG'}:`,
      '',
      ...lines,
      '',
      `Разом до сплати (брутто): ${formatPln(totalGross)}`,
      `Орієнтовний термін реалізації: ${leadTime}`,
      ...(hasPhotos
        ? ['', 'У вкладенні надсилаємо карту сервісу PDF з фотографіями з діагностики.']
        : []),
      '',
      'Для замовлення запчастин та початку робіт просимо підтвердити кошторис у відповідь.',
      '',
      'З повагою,',
      safeCompany,
    ].join('\n');
  }

  const lines = items.map(
    (item, idx) =>
      `${idx + 1}. ${item.name} (${item.specLabel}) — ${item.quantity} szt. — ${formatPln(
        item.totalGrossPrice
      )} brutto`
  );
  if (shippingGross > 0) {
    lines.push(`Wysyłka zwrotna i pakowanie — ${formatPln(shippingGross)} brutto`);
  }

  return [
    'Dzień dobry,',
    '',
    `przesyłamy szczegółowy kosztorys (${quoteNumber}) dla ${replicaLabel || 'repliki ASG'}:`,
    '',
    ...lines,
    '',
    `Razem do zapłaty (brutto): ${formatPln(totalGross)}`,
    `Szacowany czas realizacji: ${leadTime}`,
    ...(hasPhotos
      ? ['', 'W załączeniu przesyłamy kosztorys PDF wraz ze zdjęciami z diagnostyki.']
      : []),
    '',
    'W celu zamówienia części i rozpoczęcia prac prosimy o akceptację wyceny w odpowiedzi.',
    '',
    'Pozdrawiamy,',
    safeCompany,
  ].join('\n');
}
