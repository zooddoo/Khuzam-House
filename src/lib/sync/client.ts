import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase connection. The URL and publishable key come from environment
 * variables set at build time (Vercel → Settings → Environment Variables):
 *
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * Only the publishable key is ever used in the app. The secret /
 * service_role key must never be added here.
 */

const env = import.meta.env as Record<string, string | undefined>;

export const cloudConfig = {
  url: (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
  key: (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
};

/**
 * A secret key in the browser would give anyone full access to the database,
 * so the app refuses to use one.
 */
export const cloudConfigError: string | null = /service_role|sb_secret_/i.test(cloudConfig.key)
  ? 'VITE_SUPABASE_PUBLISHABLE_KEY contains a secret key. Use the publishable key (sb_publishable_…) instead.'
  : null;

export const isCloudConfigured = /^https?:\/\//.test(cloudConfig.url) && cloudConfig.key.length > 10 && !cloudConfigError;

/** Error from the sign-in link in the address bar (expired confirmation link…), captured before Supabase clears it. */
export const urlAuthError: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, ''));
  const desc = params.get('error_description');
  return desc ? desc.replace(/\+/g, ' ') : null;
})();

/** True when the page was opened from a password-reset email. */
export const openedFromRecoveryLink: boolean = typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isCloudConfigured) throw new Error('Supabase is not configured');
  if (!client) {
    client = createClient(cloudConfig.url, cloudConfig.key, {
      auth: {
        // Links in confirmation / reset emails can be opened on another device.
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'bait-khuzam-auth',
      },
      global: { headers: { 'x-client-info': 'bait-khuzam-studio' } },
    });
  }
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
