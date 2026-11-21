import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Checkbox, Input } from './Form';
import { useT } from '@/i18n';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  checkbox?: { label: string; description?: string; defaultChecked?: boolean };
  /** Require typing this word to enable the confirm button. */
  typeToConfirm?: string;
}

export interface ConfirmResult {
  confirmed: boolean;
  checked: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setChecked(!!o.checkbox?.defaultChecked);
    setTyped('');
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (confirmed: boolean) => {
    resolver.current?.({ confirmed, checked });
    resolver.current = null;
    setOpts(null);
  };

  const blocked = !!opts?.typeToConfirm && typed.trim().toUpperCase() !== opts.typeToConfirm.toUpperCase();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={!!opts} onOpenChange={(o) => !o && finish(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-ink/30 backdrop-blur-[2px] animate-fade-in" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-surface p-5 shadow-pop outline-none animate-rise-in">
            <AlertDialog.Title className="display text-[22px] text-ink">{opts?.title}</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="mt-2 text-[13px] leading-relaxed text-ink-2">{opts?.description}</div>
            </AlertDialog.Description>
            {opts?.checkbox && (
              <div className="mt-4 rounded-sm border border-line bg-raised p-3">
                <Checkbox checked={checked} onChange={setChecked} label={opts.checkbox.label} description={opts.checkbox.description} />
              </div>
            )}
            {opts?.typeToConfirm && (
              <div className="mt-4">
                <label className="mb-1.5 block text-[12px] text-ink-2">{t.ui.typeToConfirm(opts.typeToConfirm)}</label>
                <Input autoFocus dir="ltr" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t.ui.confirmationWord} />
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">{opts?.cancelLabel ?? t.common.cancel}</Button>
              </AlertDialog.Cancel>
              <Button variant={opts?.tone === 'danger' ? 'danger' : 'primary'} disabled={blocked} onClick={() => finish(true)} autoFocus={!opts?.typeToConfirm}>
                {opts?.confirmLabel ?? t.common.confirm}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
