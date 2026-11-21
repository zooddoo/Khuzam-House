import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, LogIn, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Callout, Spinner } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Form';
import { LanguageToggle } from '../LanguageToggle';
import { sendPasswordReset, setNewPassword, signIn, signOut, signUp } from '@/lib/sync/auth';
import { supabase, urlAuthError } from '@/lib/sync/client';

/** Full-screen centred layout used by every sign-in / setup screen. */
export function GateLayout({ children, title, lead, icon }: { children?: ReactNode; title: ReactNode; lead?: ReactNode; icon?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="display text-[20px] text-ink">{t.app.name}</span>
        <LanguageToggle />
      </div>
      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-10">
        {icon && <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>}
        <h1 className="display text-[30px] leading-tight text-ink sm:text-[34px]">{title}</h1>
        {lead && <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{lead}</p>}
        <div className="mt-7">{children}</div>
        <p className="mt-10 flex items-center gap-2 text-[12px] text-ink-3">
          <ShieldCheck size={14} className="shrink-0" /> {t.gate.privateNote}
        </p>
      </main>
    </div>
  );
}

export function Splash({ label, detail }: { label: string; detail?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[13.5px] text-ink-3" role="status">
      <Spinner size={20} />
      <span>{label}</span>
      {detail && <span className="text-[12px] text-ink-4">{detail}</span>}
    </div>
  );
}

type Mode = 'sign-in' | 'sign-up' | 'reset' | 'check-email' | 'reset-sent';

export function SignInScreen({ expired }: { expired?: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(urlAuthError ? t.auth.linkError(urlAuthError) : null);
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [dbMissing, setDbMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase()
      .rpc('app_status')
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) {
          if (/could not find|schema cache/i.test(e.message) || e.code === 'PGRST202') setDbMissing(true);
          return;
        }
        setClaimed(!!(data as { claimed?: boolean })?.claimed);
      });
    return () => {
      alive = false;
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'sign-in') void run(() => signIn(email, password));
    else if (mode === 'sign-up') {
      if (password.length < 8) return setError(t.auth.passwordTooShort);
      void run(async () => {
        const r = await signUp(email, password);
        if (r === 'confirm') setMode('check-email');
      });
    } else if (mode === 'reset') {
      void run(async () => {
        await sendPasswordReset(email);
        setMode('reset-sent');
      });
    }
  };

  if (mode === 'check-email' || mode === 'reset-sent') {
    return (
      <GateLayout icon={<Mail size={22} />} title={t.auth.checkEmailTitle} lead={mode === 'check-email' ? t.auth.checkEmail(email) : t.auth.resetSent(email)}>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => setMode('sign-in')}>
          {t.auth.signIn}
        </Button>
      </GateLayout>
    );
  }

  const title = mode === 'sign-up' ? t.auth.createAccount : mode === 'reset' ? t.auth.resetTitle : expired ? t.auth.notSignedIn : t.auth.signInTitle;
  const lead = mode === 'sign-up' ? t.auth.createAccountLead : mode === 'reset' ? t.auth.resetLead : expired ? t.gate.expired : t.auth.notSignedInLead;

  return (
    <GateLayout icon={mode === 'sign-up' ? <UserPlus size={22} /> : mode === 'reset' ? <KeyRound size={22} /> : <LogIn size={22} />} title={title} lead={lead}>
      {dbMissing && (
        <Callout tone="warn" className="mb-5" title={t.owner.databaseMissingTitle}>
          {t.owner.databaseMissing}
        </Callout>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t.auth.email}>
          <Input
            type="email"
            dir="ltr"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            name="email"
          />
        </Field>
        {mode !== 'reset' && (
          <Field label={t.auth.password} hint={mode === 'sign-up' ? t.auth.passwordTooShort : undefined}>
            <Input
              type="password"
              dir="ltr"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              name="password"
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-sm bg-danger-soft/70 px-3 py-2 text-[13px] leading-relaxed text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email.trim() || (mode !== 'reset' && !password)}>
          {mode === 'sign-up' ? t.auth.createAccount : mode === 'reset' ? t.auth.sendReset : t.auth.signIn}
        </Button>
      </form>
      <div className="mt-5 flex flex-col items-start gap-2 text-[13px]">
        {mode === 'sign-in' ? (
          <>
            <button type="button" className="touch-target text-accent underline-offset-4 hover:underline" onClick={() => setMode('reset')}>
              {t.auth.forgot}
            </button>
            {claimed === false && (
              <button type="button" className="touch-target text-accent underline-offset-4 hover:underline" onClick={() => setMode('sign-up')}>
                {t.auth.needAccount}
              </button>
            )}
          </>
        ) : (
          <button type="button" className="touch-target text-accent underline-offset-4 hover:underline" onClick={() => setMode('sign-in')}>
            {t.auth.haveAccount}
          </button>
        )}
      </div>
    </GateLayout>
  );
}

export function SetPasswordScreen() {
  const t = useT();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t.auth.passwordTooShort);
    if (password !== confirm) return setError(t.auth.passwordsDiffer);
    setBusy(true);
    setError(null);
    try {
      await setNewPassword(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <GateLayout icon={<KeyRound size={22} />} title={t.auth.setPasswordTitle}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t.auth.newPassword}>
          <Input type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t.auth.confirmPassword}>
          <Input type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-sm bg-danger-soft/70 px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {t.auth.setPassword}
        </Button>
      </form>
    </GateLayout>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  const t = useT();
  return (
    <Button variant="ghost" size="lg" className={className} onClick={() => void signOut()}>
      {t.gate.signOut}
    </Button>
  );
}
