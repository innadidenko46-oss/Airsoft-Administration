import 'dotenv/config';
import express from 'express';
import path from 'path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '12mb' }));

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('MISSING_GEMINI_API_KEY');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface CatalogPartInput {
  id: string;
  name: string;
  category: string;
  supplier: string;
}

app.post('/api/parse-email', async (req, res) => {
  try {
    const { emailText, partsCatalog } = req.body as {
      emailText?: string;
      partsCatalog?: CatalogPartInput[];
    };

    if (!emailText || typeof emailText !== 'string' || !emailText.trim()) {
      return res.status(400).json({
        error: 'Wklej treść wiadomości od klienta przed uruchomieniem analizy.',
      });
    }

    const ai = getAiClient();
    const partsList = Array.isArray(partsCatalog)
      ? partsCatalog
          .map((p) => `- id: "${p.id}", nazwa: "${p.name}", kategoria: "${p.category}", sklep: "${p.supplier}"`)
          .join('\n')
      : '';

    const systemInstruction = `Jesteś asystentem serwisu i kastomizacji replik airsoftowych (ASG).
Twoim zadaniem jest wyciągnięcie parametrów zlecenia serwisowego, objawów usterki, modelu repliki oraz danych klienta z wiadomości (e-mail, OLX, Allegro, Messenger, SMS) w języku polskim, ukraińskim lub angielskim.

Dostępny katalog typowych części serwisu (dopasuj ID jeśli klient wyraźnie prosi o konkretną część):
${partsList}

Zasady:
1. serviceScope: "diagnostyka_naprawa" (awaria/naprawa), "przeglad" (przegląd zerowy/okresowy), "kastomizacja" (tuning FPS/ROF/HPA/R-Hop), lub "diagnostyka_tylko".
2. driveType: "AEG", "HPA", "GBB", "CO2", "Spring" lub "Inny".
3. Jeśli klient podał oczekiwane FPS lub Joule, wpisz targetFps (liczba) lub null jeśli brak.
4. Jeśli klient wymienia objawy usterki (np. "nie strzela", "kręci ale nie podaje kulek", "spadek FPS", "zablokowany tłok"), wpisz je jasno do reportedFault.
5. Jeśli klient prosi o pilną naprawę przed strzelanką / zlotem ("pilne", "na weekend", "терміново"), ustaw isExpressPriority = true.
6. Wykryj źródło zamówienia (E-mail, OLX, Allegro, Telefon / SMS, Social Media) i język ("pl" lub "ukr").`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Przeanalizuj poniższą wiadomość od klienta serwisu ASG i wyciągnij dane:\n\n---\n${emailText.trim()}\n---`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: {
              type: Type.STRING,
              description: 'Krótki tytuł zlecenia (np. "Diagnostyka napędu i spadek FPS" lub "Przegląd zerowy + Perun V2").',
            },
            serviceScope: {
              type: Type.STRING,
              description: '"diagnostyka_naprawa", "przeglad", "kastomizacja" lub "diagnostyka_tylko".',
            },
            replicaBrand: {
              type: Type.STRING,
              description: 'Producent repliki np. Specna Arms, Cyma, LCT, Tokyo Marui (pusty string jeśli brak).',
            },
            replicaModel: {
              type: Type.STRING,
              description: 'Model repliki np. SA-E07, AK-74, MK18, VSR-10 (pusty string jeśli brak).',
            },
            driveType: {
              type: Type.STRING,
              description: '"AEG", "HPA", "GBB", "CO2", "Spring" lub "Inny".',
            },
            reportedFault: {
              type: Type.STRING,
              description: 'Opis usterki lub oczekiwań tuningu podany przez klienta.',
            },
            targetFps: {
              type: Type.INTEGER,
              nullable: true,
              description: 'Oczekiwana prędkość wylotowa w FPS jeśli podana, inaczej null.',
            },
            suggestedCatalogPartIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Opcjonalne ID pasujących części z katalogu jeśli klient o nie pyta.',
            },
            isExpressPriority: {
              type: Type.BOOLEAN,
              description: 'Czy klient prosi o pilną naprawę przed grą / weekendem.',
            },
            clientName: {
              type: Type.STRING,
              description: 'Imię, nazwisko lub nick klienta.',
            },
            clientContact: {
              type: Type.STRING,
              description: 'Telefon, e-mail lub nick klienta.',
            },
            clientDeliveryInfo: {
              type: Type.STRING,
              description: 'Paczkomat InPost, adres zwrotny lub dane faktury.',
            },
            orderSource: {
              type: Type.STRING,
              description: 'E-mail, OLX, Allegro, Telefon / SMS lub Social Media.',
            },
            technicalNotes: {
              type: Type.STRING,
              description: 'Dodatkowe informacje np. bateria w zestawie, waga kulek, uwagi.',
            },
            detectedLanguage: {
              type: Type.STRING,
              description: '"ukr" jeśli wiadomość jest po ukraińsku lub rosyjsku, inaczej "pl".',
            },
          },
          required: [
            'projectName',
            'serviceScope',
            'replicaBrand',
            'replicaModel',
            'driveType',
            'reportedFault',
            'isExpressPriority',
            'clientName',
            'clientContact',
            'clientDeliveryInfo',
            'orderSource',
            'technicalNotes',
            'detectedLanguage',
          ],
        },
      },
    });

    const jsonText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(jsonText);
    return res.json({ data: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/parse-email:', message);

    if (message === 'MISSING_GEMINI_API_KEY') {
      return res.status(500).json({
        error:
          'Brak klucza GEMINI_API_KEY po stronie serwera. Sprawdź ustawienia w panelu Settings > Secrets.',
      });
    }
    if (message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
      return res.status(403).json({
        error:
          'Klucz Gemini API jest nieprawidłowy lub nie ma uprawnień. Sprawdź Settings > Secrets.',
      });
    }
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error: 'Przekroczono limit zapytań Gemini API. Spróbuj ponownie za chwilę.',
      });
    }

    return res.status(500).json({
      error: 'Nie udało się przeanalizować treści wiadomości. Spróbuj ponownie.',
    });
  }
});

interface ImportImageInput {
  mimeType: string;
  dataBase64: string;
}

app.post('/api/import-orders', async (req, res) => {
  try {
    const { rawText, images, todayIso } = req.body as {
      rawText?: string;
      images?: ImportImageInput[];
      todayIso?: string;
    };

    const cleanText = typeof rawText === 'string' ? rawText.trim() : '';
    const validImages = Array.isArray(images)
      ? images
          .filter(
            (img) =>
              img &&
              typeof img.mimeType === 'string' &&
              img.mimeType.startsWith('image/') &&
              typeof img.dataBase64 === 'string' &&
              img.dataBase64.length > 0
          )
          .slice(0, 6)
      : [];

    if (!cleanText && validImages.length === 0) {
      return res.status(400).json({
        error:
          'Wklej treść korespondencji, listę zleceń serwisowych lub dodaj co najmniej jeden zrzut ekranu.',
      });
    }

    const ai = getAiClient();
    const referenceDate =
      typeof todayIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayIso)
        ? todayIso
        : new Date().toISOString().slice(0, 10);

    const systemInstruction = `Jesteś asystentem migracji danych w serwisie i warsztacie kastomizacji replik airsoftowych (ASG).
Otrzymujesz historyczną korespondencję (e-maile, czaty Messenger/OLX/Allegro/SMS, notatki, tabele) lub zrzuty ekranu z naprawami i tuningami replik ASG.

Dzisiejsza data odniesienia: ${referenceDate}

Wyciągnij WSZYSTKIE zlecenia serwisowe widoczne w materiale do tablicy "orders":
1. orderDate: YYYY-MM-DD (jeśli brak daty, użyj "${referenceDate}").
2. serviceScope: "diagnostyka_naprawa", "przeglad", "kastomizacja" lub "diagnostyka_tylko".
3. stage: "przyjecie", "diagnostyka", "oczekuje_akceptacji", "zakup_czesci", "w_realizacji", "testy_chrono" lub "gotowe".
4. paymentStatus: "oczekuje", "zaliczka", "oplacone" lub "wyslane".
5. driveType: "AEG", "HPA", "GBB", "CO2", "Spring" lub "Inny".
6. agreedGrossPrice: ustalona kwota w PLN (lub null jeśli brak), partsCostEstimate: koszt zakupionych części w PLN (lub null jeśli brak).
7. reportedFault i diagnosisSummary: co zgłosił klient oraz co wykryto/naprawiono.`;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    for (const img of validImages) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.dataBase64,
        },
      });
    }

    parts.push({
      text: cleanText
        ? `Przeanalizuj załączone materiały i wyciągnij zlecenia serwisowe ASG:\n\n---\n${cleanText}\n---`
        : 'Przeanalizuj dokładnie załączone zrzuty ekranu i wyciągnij z nich wszystkie zlecenia serwisowe ASG.',
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            orders: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  projectName: { type: Type.STRING },
                  orderDate: { type: Type.STRING },
                  serviceScope: { type: Type.STRING },
                  stage: { type: Type.STRING },
                  paymentStatus: { type: Type.STRING },
                  replicaBrand: { type: Type.STRING },
                  replicaModel: { type: Type.STRING },
                  driveType: { type: Type.STRING },
                  reportedFault: { type: Type.STRING },
                  diagnosisSummary: { type: Type.STRING },
                  agreedGrossPrice: { type: Type.NUMBER, nullable: true },
                  agreedPriceIsNet: { type: Type.BOOLEAN },
                  partsCostEstimate: { type: Type.NUMBER, nullable: true },
                  clientName: { type: Type.STRING },
                  clientContact: { type: Type.STRING },
                  clientDeliveryInfo: { type: Type.STRING },
                  orderSource: { type: Type.STRING },
                  documentRef: { type: Type.STRING },
                  technicalNotes: { type: Type.STRING },
                  extractionNote: { type: Type.STRING },
                },
                required: [
                  'projectName',
                  'orderDate',
                  'serviceScope',
                  'stage',
                  'paymentStatus',
                  'replicaBrand',
                  'replicaModel',
                  'driveType',
                  'reportedFault',
                  'diagnosisSummary',
                  'agreedPriceIsNet',
                  'clientName',
                  'clientContact',
                  'clientDeliveryInfo',
                  'orderSource',
                  'documentRef',
                  'technicalNotes',
                  'extractionNote',
                ],
              },
            },
          },
          required: ['orders'],
        },
      },
    });

    const jsonText = (response.text ?? '{"orders":[]}').trim();
    const parsed = JSON.parse(jsonText);
    return res.json({ data: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/import-orders:', message);

    if (message === 'MISSING_GEMINI_API_KEY') {
      return res.status(500).json({
        error:
          'Brak klucza GEMINI_API_KEY po stronie serwera. Sprawdź ustawienia w panelu Settings > Secrets.',
      });
    }
    return res.status(500).json({
      error: 'Nie udało się przeanalizować materiałów do importu. Spróbuj ponownie.',
    });
  }
});

const ALLOWED_PART_CATEGORIES = [
  'Pneumatyka',
  'Gearbox / Napęd',
  'Hop-Up / Lufa',
  'Elektronika / Mosfet',
  'Zewnętrzne / Body',
  'HPA / GBB',
  'Materiały serwisowe',
] as const;

function isPrivateOrBlockedIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '').toLowerCase();
  if (clean === '::1' || clean === '::' || clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }
  const version = net.isIP(clean);
  if (version === 4) {
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let normalized = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_URL');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new Error('BLOCKED_HOST');
  }
  if (net.isIP(host) && isPrivateOrBlockedIp(host)) {
    throw new Error('BLOCKED_HOST');
  }
  try {
    const resolved = await dns.lookup(host, { all: true });
    if (resolved.length === 0 || resolved.some((entry) => isPrivateOrBlockedIp(entry.address))) {
      throw new Error('BLOCKED_HOST');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'BLOCKED_HOST') {
      throw err;
    }
    throw new Error('DNS_LOOKUP_FAILED');
  }
  return parsed;
}

function extractHtmlSignals(html: string): {
  title: string;
  metaTags: string[];
  jsonLdBlocks: string[];
  textSnippet: string;
  looksBlocked: boolean;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  const metaTags: string[] = [];
  const metaRegex = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRegex.exec(html)) !== null && metaTags.length < 40) {
    const tag = m[0];
    if (/(title|description|price|currency|brand|amount|og:|product:)/i.test(tag)) {
      metaTags.push(tag.replace(/\s+/g, ' ').trim());
    }
  }

  const jsonLdBlocks: string[] = [];
  const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRegex.exec(html)) !== null && jsonLdBlocks.length < 6) {
    const block = m[1].trim();
    if (block && /(Product|Offer|price|name)/i.test(block)) {
      jsonLdBlocks.push(block.slice(0, 4000));
    }
  }

  const strippedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = `${title} ${strippedText.slice(0, 1200)}`.toLowerCase();
  const looksBlocked =
    lower.includes('just a moment') ||
    lower.includes('attention required') ||
    lower.includes('verify you are human') ||
    lower.includes('enable javascript and cookies') ||
    strippedText.length < 80;

  return {
    title,
    metaTags,
    jsonLdBlocks,
    textSnippet: strippedText.slice(0, 7500),
    looksBlocked,
  };
}

function inferSupplierFromUrl(hostname: string, suppliers: string[]): string {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const matched = suppliers.find((sup) => {
    const token = sup.toLowerCase().replace(/[^a-z0-9]/g, '');
    return token.length >= 3 && host.replace(/[^a-z0-9]/g, '').includes(token);
  });
  if (matched) return matched;
  if (host.includes('taiwangun')) return 'Taiwangun';
  if (host.includes('gunfire')) return 'Gunfire';
  if (host.includes('specshop')) return 'SpecShop';
  if (host.includes('azteko')) return 'Azteko';
  if (host.includes('powair6')) return 'Powair6';
  const primary = host.split('.')[0] || '';
  if (!primary) return suppliers[0] || 'Inny';
  return primary.charAt(0).toUpperCase() + primary.slice(1);
}

function normalizeCategory(raw: string): (typeof ALLOWED_PART_CATEGORIES)[number] {
  const cleaned = (raw || '').trim().toLowerCase();
  for (const cat of ALLOWED_PART_CATEGORIES) {
    if (cat.toLowerCase() === cleaned) return cat;
  }
  if (/mosfet|etu|perun|gate|silnik|bater|kabel|styk|elektry/i.test(cleaned)) {
    return 'Elektronika / Mosfet';
  }
  if (/hop|lufa|gumka|dystanser|komora/i.test(cleaned)) {
    return 'Hop-Up / Lufa';
  }
  if (/pneum|tlok|tłok|cylinder|dysza|glowic|głowic|spre|sprę|oring/i.test(cleaned)) {
    return 'Pneumatyka';
  }
  if (/zebat|zębat|gearbox|lozys|łożys|spust|szkielet/i.test(cleaned)) {
    return 'Gearbox / Napęd';
  }
  if (/hpa|gbb|zawor|zawór|regulat|butla|gas/i.test(cleaned)) {
    return 'HPA / GBB';
  }
  if (/body|kolba|chwyt|loze|łoże|magazyn|tlumik|tłumik|zewn/i.test(cleaned)) {
    return 'Zewnętrzne / Body';
  }
  if (/smar|podklad|podkład|klej|loctite|mater/i.test(cleaned)) {
    return 'Materiały serwisowe';
  }
  return 'Gearbox / Napęd';
}

app.post('/api/parse-part-url', async (req, res) => {
  try {
    const { url, suppliers } = req.body as {
      url?: string;
      suppliers?: string[];
    };

    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({
        error: 'Wklej adres URL strony produktu przed pobraniem danych.',
      });
    }

    let safeUrl: URL;
    try {
      safeUrl = await assertSafePublicUrl(url);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'BLOCKED_HOST') {
        return res.status(400).json({
          error: 'Podany adres sieci lokalnej lub wewnętrznej jest niedozwolony.',
        });
      }
      if (code === 'DNS_LOOKUP_FAILED') {
        return res.status(400).json({
          error: 'Nie udało się odnaleźć domeny podanego sklepu. Sprawdź poprawność linku.',
        });
      }
      return res.status(400).json({
        error: 'Nieprawidłowy adres URL. Wklej pełny link zaczynający się od https://...',
      });
    }

    const ai = getAiClient();
    const supplierList = Array.isArray(suppliers)
      ? suppliers.filter((s) => typeof s === 'string' && s.trim().length > 0)
      : [];
    const inferredSupplier = inferSupplierFromUrl(safeUrl.hostname, supplierList);

    let extractedHtml: ReturnType<typeof extractHtmlSignals> | null = null;
    try {
      const pageResp = await fetch(safeUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      if (pageResp.ok) {
        const html = await pageResp.text();
        const signals = extractHtmlSignals(html);
        if (!signals.looksBlocked) {
          extractedHtml = signals;
        }
      }
    } catch {
      extractedHtml = null;
    }

    let parsedResult: {
      found?: boolean;
      name?: string;
      category?: string;
      supplier?: string;
      purchaseCostPln?: number | null;
      notes?: string;
    } | null = null;

    if (extractedHtml) {
      const prompt = `Wyciągnij dane części/produktu ASG ze strony internetowej sklepu.

URL: ${safeUrl.toString()}
Sugerowany sklep z domeny: ${inferredSupplier}
Lista znanych sklepów warsztatu: ${supplierList.join(', ') || inferredSupplier}

<title>: ${extractedHtml.title}
Meta tags:
${extractedHtml.metaTags.join('\n')}

JSON-LD:
${extractedHtml.jsonLdBlocks.join('\n---\n')}

Tekst strony:
${extractedHtml.textSnippet}

Zasady:
1. found = true tylko jeśli strona rzeczywiście opisuje produkt/część, w przeciwnym razie false.
2. name = czysta, konkretna nazwa części ASG (usuń doklejone nazwy sklepu np. "- Taiwangun", "| Sklep ASG", "Cena...").
3. category = dokładnie jedna z kategorii: ${ALLOWED_PART_CATEGORIES.join(', ')}.
4. supplier = dopasuj do listy znanych sklepów warsztatu jeśli pasuje, albo użyj nazwy sklepu "${inferredSupplier}".
5. purchaseCostPln = aktualna cena brutto produktu w PLN jako liczba (jeśli cena jest w EUR przelicz w przybliżeniu * 4.30 i dopisz oryginalną cenę w notes; jeśli brak ceny na stronie, wpisz null).
6. notes = krótka wskazówka techniczna np. rozmiar/długość/gwint/twardość jeśli widoczne na stronie (max 120 znaków, albo pusty string).`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN },
              name: { type: Type.STRING },
              category: { type: Type.STRING },
              supplier: { type: Type.STRING },
              purchaseCostPln: { type: Type.NUMBER, nullable: true },
              notes: { type: Type.STRING },
            },
            required: ['found', 'name', 'category', 'supplier', 'notes'],
          },
        },
      });
      parsedResult = JSON.parse((response.text ?? '{}').trim());
    } else {
      const urlContextPrompt = `Odczytaj stronę produktu pod adresem ${safeUrl.toString()} i zwróć WYŁĄCZNIE poprawny obiekt JSON bez żadnego dodatkowego tekstu ani znaczników markdown:
{
  "found": true lub false (false jeśli nie udało się odczytać karty produktu lub strona jest zablokowana),
  "name": "czysta nazwa części ASG bez nazwy sklepu",
  "category": "jedna z: ${ALLOWED_PART_CATEGORIES.join(' | ')}",
  "supplier": "${inferredSupplier}",
  "purchaseCostPln": liczba PLN lub null jeśli brak ceny,
  "notes": "krótka specyfikacja (np. długość/twardość/gwint) lub pusty string"
}
Nie zmyślaj nazwy ani ceny, jeśli nie możesz odczytać zawartości linku — ustaw "found": false.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: urlContextPrompt,
        config: {
          tools: [{ urlContext: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const rawText = (response.text ?? '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      }
    }

    if (!parsedResult || !parsedResult.found || !parsedResult.name?.trim()) {
      return res.status(422).json({
        error:
          'Sklep zablokował automatyczny odczyt strony lub link nie prowadzi do karty produktu. Wpisz nazwę i cenę ręcznie.',
      });
    }

    const cleanCost =
      typeof parsedResult.purchaseCostPln === 'number' &&
      Number.isFinite(parsedResult.purchaseCostPln) &&
      parsedResult.purchaseCostPln > 0
        ? Math.round(parsedResult.purchaseCostPln * 100) / 100
        : null;

    return res.json({
      data: {
        name: parsedResult.name.trim().slice(0, 160),
        category: normalizeCategory(parsedResult.category || ''),
        supplier: (parsedResult.supplier || inferredSupplier).trim() || inferredSupplier,
        productUrl: safeUrl.toString(),
        purchaseCostPln: cleanCost,
        notes: (parsedResult.notes || '').trim().slice(0, 140),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/parse-part-url:', message);

    if (message === 'MISSING_GEMINI_API_KEY') {
      return res.status(500).json({
        error:
          'Brak klucza GEMINI_API_KEY po stronie serwera. Sprawdź ustawienia w panelu Settings > Secrets.',
      });
    }
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error: 'Przekroczono limit zapytań AI. Spróbuj ponownie za chwilę.',
      });
    }

    return res.status(500).json({
      error: 'Nie udało się pobrać danych części z podanego linku.',
    });
  }
});

app.post('/api/transcribe-fault', async (req, res) => {
  try {
    const { audioBase64, mimeType, context } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      context?: 'reportedFault' | 'diagnosisSummary';
    };

    if (!audioBase64 || typeof audioBase64 !== 'string' || !audioBase64.trim()) {
      return res.status(400).json({
        error: 'Brak danych dźwiękowych do transkrypcji.',
      });
    }

    const baseMime =
      typeof mimeType === 'string' && mimeType.trim()
        ? mimeType.split(';')[0].trim().toLowerCase()
        : 'audio/webm';

    if (!baseMime.startsWith('audio/') && baseMime !== 'video/webm') {
      return res.status(400).json({
        error: `Nieobsługiwany format nagrania: ${baseMime}.`,
      });
    }

    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '').trim();
    if (cleanBase64.length > 14_000_000) {
      return res.status(413).json({
        error: 'Nagranie jest zbyt długie. Maksymalna długość to ok. 90 sekund.',
      });
    }

    const ai = getAiClient();
    const fieldLabel =
      context === 'diagnosisSummary'
        ? 'diagnoza techniczna technika serwisu ASG'
        : 'objawy usterki repliki ASG zgłoszone przez klienta';

    const audioPart = {
      inlineData: {
        mimeType: baseMime === 'video/webm' ? 'audio/webm' : baseMime,
        data: cleanBase64,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: `Dokonaj wiernej transkrypcji nagrania głosowego (${fieldLabel}) w języku polskim (lub ukraińskim, jeśli mówiący mówi po ukraińsku).
Zachowaj poprawne nazewnictwo airsoftowe (AEG, HPA, GBB, MOSFET, ETU, Perun, Gate, Hop-Up, gumka, dystanser, dysza, zębatki, shimming, AoE, tłok, FPS, RPS, Joule, LiPo, T-Deans).
Zwróć wyłącznie czysty, poprawnie zinterpunkcjonowany tekst wypowiedzi bez komentarzy, wstępów i dopisywania treści, których nie było w nagraniu.`,
          },
        ],
      },
    });

    const transcript = (response.text ?? '').trim();
    if (!transcript) {
      return res.status(422).json({
        error: 'Nie wykryto wyraźnej mowy w nagraniu. Spróbuj ponownie bliżej mikrofonu.',
      });
    }

    return res.json({ text: transcript });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/transcribe-fault:', message);

    if (message === 'MISSING_GEMINI_API_KEY') {
      return res.status(500).json({
        error:
          'Brak klucza GEMINI_API_KEY po stronie serwera. Sprawdź ustawienia w panelu Settings > Secrets.',
      });
    }
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error: 'Przekroczono limit zapytań transkrypcji AI. Spróbuj ponownie za chwilę.',
      });
    }

    return res.status(500).json({
      error: 'Nie udało się zamienić nagrania głosowego na tekst. Spróbuj ponownie.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      try {
        const fs = await import('fs');
        const htmlPath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(htmlPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AIRSOFT Admin Panel server running on port ${PORT}`);
  });
}

startServer();
