import { PartCategory } from '../types/airsoft';

export interface ParsedPartUrlResult {
  name: string;
  category: PartCategory;
  supplier: string;
  productUrl: string;
  purchaseCostPln: number | null;
  notes: string;
}

export async function parsePartFromUrl(
  rawUrl: string,
  suppliers: string[]
): Promise<ParsedPartUrlResult> {
  const response = await fetch('/api/parse-part-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: rawUrl.trim(),
      suppliers,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: ParsedPartUrlResult;
    error?: string;
  };

  if (!response.ok || !payload.data) {
    throw new Error(
      payload.error || 'Nie udało się pobrać danych części z podanego linku.'
    );
  }

  return payload.data;
}
