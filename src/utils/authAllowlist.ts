export const ALLOWED_ADMIN_EMAILS = [
  'myhagenja@gmail.com',
  'inna.didenko46@gmail.com',
  'inna.m.mukha@gmail.com',
] as const;

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isEmailAllowed(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  return (
    normalized.length > 0 &&
    (ALLOWED_ADMIN_EMAILS as readonly string[]).includes(normalized)
  );
}
