const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Collision-resistant id. Uses crypto.getRandomValues, which (unlike
 * crypto.randomUUID) also works on non-secure origins such as a LAN IP.
 */
export function newId(prefix = ''): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** "Name (copy)" in the script of the name itself. */
export function copyName(name: string): string {
  return /[\u0600-\u06FF]/.test(name) ? `${name} (نسخة)` : `${name} (copy)`;
}
