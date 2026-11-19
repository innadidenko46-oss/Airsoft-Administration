import 'dotenv/config';
import express from 'express';
import path from 'path';
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
