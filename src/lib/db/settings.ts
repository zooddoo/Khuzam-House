import { db } from './db';
import { withSettingsDefaults } from './factories';
import type { AppSettings } from '../types';

export async function getSettings(): Promise<AppSettings> {
  return withSettingsDefaults(await db.settings.get('app'));
}

let pending: Promise<unknown> = Promise.resolve();

export async function updateSettings(recipe: (s: AppSettings) => AppSettings | void): Promise<AppSettings> {
  const write = db.transaction('rw', db.settings, async () => {
    const current = withSettingsDefaults(await db.settings.get('app'));
    const draft = structuredClone(current);
    const result = recipe(draft) ?? draft;
    await db.settings.put(result);
    return result;
  });
  pending = write.catch(() => undefined);
  return write;
}

/**
 * Resolves after settings writes already started have finished — e.g. a key
 * saved on blur just before a "Test connection" click.
 */
export async function getSettledSettings(): Promise<AppSettings> {
  await new Promise((r) => setTimeout(r, 0));
  await pending;
  return getSettings();
}
