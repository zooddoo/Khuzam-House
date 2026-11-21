import { useSyncExternalStore } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { isCloudConfigured, openedFromRecoveryLink, supabase } from './client';
import { tr } from '../../i18n/messages';

/**
 * Sign-in state for the single studio owner (Supabase Auth, email + password).
 */

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; reason?: 'expired' | 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string; recovery: boolean };

let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();
let started = false;

function set(next: AuthState) {
  state = next;
  for (const fn of listeners) fn();
}

function fromSession(session: Session | null, recovery = false): AuthState {
  if (!session?.user) return { status: 'signed-out' };
  return { status: 'signed-in', userId: session.user.id, email: session.user.email ?? '', recovery };
}

export function startAuth() {
  if (started || !isCloudConfigured) return;
  started = true;
  const sb = supabase();
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      set(fromSession(session, true));
      return;
    }
    if (event === 'SIGNED_OUT') {
      set({ status: 'signed-out', reason: state.status === 'signed-in' && !manualSignOut ? 'expired' : 'signed-out' });
      manualSignOut = false;
      return;
    }
    const recovery = state.status === 'signed-in' ? state.recovery : openedFromRecoveryLink;
    const next = fromSession(session, recovery);
    // Avoid re-rendering the whole app on hourly token refreshes.
    if (next.status === 'signed-in' && state.status === 'signed-in' && state.userId === next.userId && state.recovery === next.recovery && state.email === next.email) return;
    set(next);
  });
  void sb.auth.getSession().then(({ data }) => {
    if (state.status === 'loading') set(fromSession(data.session, openedFromRecoveryLink && !!data.session));
  });
}

export function getAuthState(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

/* Actions ------------------------------------------------------------- */

let manualSignOut = false;

export function authErrorMessage(e: unknown): string {
  const t = tr().auth;
  const err = e as Partial<AuthError> & { message?: string; name?: string };
  const code = (err?.code ?? '') as string;
  const msg = err?.message ?? String(e);
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return t.invalidCredentials;
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return t.emailNotConfirmed;
  if (code === 'signup_disabled' || /signups? not allowed/i.test(msg)) return t.signupsDisabled;
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return t.userExists;
  if (code === 'weak_password' || /password should be/i.test(msg)) return t.passwordTooShort;
  if (/rate limit|too many/i.test(code + msg)) return t.rateLimited;
  if (/failed to fetch|network|load failed/i.test(msg) || err?.name === 'AuthRetryableFetchError') return t.network;
  return t.genericError(msg);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authErrorMessage(error));
}

/** Returns 'confirm' when Supabase sent a confirmation email, 'signed-in' when the account is active right away. */
export async function signUp(email: string, password: string): Promise<'confirm' | 'signed-in'> {
  const { data, error } = await supabase().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw new Error(authErrorMessage(error));
  // An existing email returns a user without identities (Supabase hides whether it exists).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error(tr().auth.userExists);
  return data.session ? 'signed-in' : 'confirm';
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
  if (error) throw new Error(authErrorMessage(error));
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(authErrorMessage(error));
  if (state.status === 'signed-in') set({ ...state, recovery: false });
}

export async function signOut(): Promise<void> {
  manualSignOut = true;
  await supabase()
    .auth.signOut({ scope: 'local' })
    .catch(() => undefined);
  set({ status: 'signed-out', reason: 'signed-out' });
}

/* Ownership ----------------------------------------------------------- */

export type OwnerStatus = 'owner' | 'unclaimed' | 'not-owner' | 'missing-database' | 'offline';

const OWNER_KEY = 'bk.ownerUserId';

function rememberOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* ignore */
  }
}

function rememberedOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|schema cache/i.test(error.message ?? '');
}

export async function checkOwner(userId: string): Promise<OwnerStatus> {
  try {
    const { data, error } = await supabase().rpc('app_status');
    if (isMissingFunction(error)) return 'missing-database';
    if (error) throw error;
    const s = data as { claimed: boolean; is_owner: boolean };
    if (s.is_owner) {
      rememberOwner(userId);
      return 'owner';
    }
    if (rememberedOwner() === userId) rememberOwner(null);
    return s.claimed ? 'not-owner' : 'unclaimed';
  } catch {
    // Offline: let the owner keep working on this device; changes upload later.
    return rememberedOwner() === userId ? 'owner' : 'offline';
  }
}

export async function claimOwnership(userId: string): Promise<OwnerStatus> {
  const { data, error } = await supabase().rpc('claim_app_owner');
  if (isMissingFunction(error)) return 'missing-database';
  if (error) throw new Error(error.message);
  const s = data as { claimed: boolean; is_owner: boolean };
  if (s.is_owner) rememberOwner(userId);
  return s.is_owner ? 'owner' : 'not-owner';
}
