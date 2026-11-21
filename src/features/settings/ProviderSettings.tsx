import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Eye, EyeOff, Plug, X } from 'lucide-react';
import type { AppSettings, ConnectionRoute, ImageProviderId, TextProviderId } from '@/lib/types';
import { getSettledSettings, updateSettings } from '@/lib/db/settings';
import { IMAGE_PROVIDERS, activeImageProvider, getImageProvider } from '@/lib/ai/providers/registry';
import { TEXT_PROVIDERS, getTextProvider, testTextProvider, textProviderReady } from '@/lib/ai/text/structure';
import { describeError, proxyAvailable } from '@/lib/ai/http';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Display';
import { CommitInput, Field, Input, Segmented, Select, Toggle } from '@/components/ui/Form';
import { cn } from '@/components/ui/cn';
import { useT } from '@/i18n';
import { num } from '@/i18n/format';

function SecretInput({ value, onCommit, placeholder, label }: { value: string; onCommit: (v: string) => void; placeholder?: string; label: string }) {
  const T = useT().providers;
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex gap-1.5">
      <Input
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={draft}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="font-mono text-[12.5px]"
        dir="ltr"
      />
      <Button
        size="md"
        variant="secondary"
        icon={show ? EyeOff : Eye}
        aria-label={show ? T.hideKey : T.showKey}
        onClick={() => setShow((s) => !s)}
        className="!px-2.5"
      />
      {value && (
        <Button
          size="md"
          variant="ghost"
          icon={X}
          aria-label={T.removeKey}
          onClick={() => {
            setDraft('');
            onCommit('');
          }}
          className="!px-2.5"
        />
      )}
    </div>
  );
}

function RouteField({ value, onChange, disabled }: { value: ConnectionRoute; onChange: (r: ConnectionRoute) => void; disabled?: boolean }) {
  const T = useT().providers;
  const [proxy, setProxy] = useState<boolean | null>(null);
  useEffect(() => {
    proxyAvailable().then(setProxy);
  }, []);
  return (
    <Field
      label={T.connection}
      hint={disabled ? T.connDirectOnly : proxy === null ? T.connChecking : proxy ? T.connProxy : T.connNoProxy}
    >
      <Segmented
        value={disabled ? 'direct' : value}
        onChange={(v) => !disabled && onChange(v)}
        options={[
          { value: 'auto', label: T.routeAuto },
          { value: 'proxy', label: T.routeProxy },
          { value: 'direct', label: T.routeDirect },
        ]}
      />
    </Field>
  );
}

export function ImageProviderSettings({ settings }: { settings: AppSettings }) {
  const t = useT();
  const T = t.providers;
  const s = settings.imageProvider;
  const provider = getImageProvider(s.provider);
  const active = activeImageProvider(s);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string; hint?: string | null; models?: string[] } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const set = (recipe: (x: AppSettings['imageProvider']) => void) => updateSettings((all) => void recipe(all.imageProvider));

  useEffect(() => setTest(null), [s.provider]);

  const runTest = async () => {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    abort.current = new AbortController();
    try {
      const fresh = (await getSettledSettings()).imageProvider;
      const r = await provider.test(fresh, abort.current.signal);
      setTest({ ok: true, message: r.message, models: r.models });
    } catch (e) {
      const d = describeError(e);
      setTest({ ok: false, message: d.message, hint: d.hint });
    } finally {
      setTesting(false);
    }
  };

  const model = provider ? (s.models[s.provider] ?? '') : '';
  const caps = active?.capabilities;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            id: 'none' as ImageProviderId,
            label: T.notSetUp,
            description: T.noneDescription,
          },
          ...IMAGE_PROVIDERS,
        ].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => set((x) => void (x.provider = p.id))}
            aria-pressed={s.provider === p.id}
            className={cn(
              'rounded-md border p-3.5 text-start transition-colors',
              s.provider === p.id ? 'border-ink bg-raised ring-1 ring-ink' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <div className="flex items-center justify-between gap-2 text-[13.5px] text-ink">
              {p.label}
              {s.provider === p.id && <Check size={14} />}
            </div>
            <div className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{T.imageDesc[p.id] ?? p.description}</div>
          </button>
        ))}
      </div>

      {provider && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            {provider.needsBaseUrl && (
              <Field label={T.baseUrl} hint={T.baseUrlHint}>
                <CommitInput dir="ltr" value={s.baseUrl} onCommit={(v) => set((x) => void (x.baseUrl = v.trim()))} placeholder="https://…/v1" />
              </Field>
            )}
            <Field
              label={provider.keyLabel}
              aside={
                provider.keyUrl ? (
                  <a
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                  >
                    {T.getKey} <ExternalLink size={11} />
                  </a>
                ) : undefined
              }
            >
              <SecretInput
                label={provider.keyLabel}
                value={s.keys[s.provider] ?? ''}
                placeholder={provider.keyPlaceholder}
                onCommit={(v) => set((x) => void (x.keys[s.provider] = v))}
              />
            </Field>
            <Field label={T.model} hint={provider.defaultModel ? T.modelDefault(provider.defaultModel) : T.modelEndpoint}>
              <Input
                dir="ltr"
                list="image-models"
                defaultValue={model}
                key={`${s.provider}-${model}`}
                onBlur={(e) => e.target.value.trim() !== model && set((x) => void (x.models[s.provider] = e.target.value.trim()))}
                placeholder={provider.defaultModel || 'model-name'}
              />
              <datalist id="image-models">
                {[...provider.suggestedModels.map((m) => m.id), ...(test?.models ?? [])].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {provider.suggestedModels.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {provider.suggestedModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => set((x) => void (x.models[s.provider] = m.id))}
                      className="min-h-8 text-start text-[11.5px] text-ink-3 hover:text-ink"
                    >
                      <bdi className={cn('font-mono', (model || provider.defaultModel) === m.id && 'text-ink')}>{m.id}</bdi> — {T.modelNote[m.id] ?? m.note}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <RouteField value={s.route} onChange={(r) => set((x) => void (x.route = r))} disabled={!provider.supportsProxy} />
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={Plug} onClick={runTest} loading={testing}>
                {T.test}
              </Button>
              {active?.ready ? (
                <span className="text-[12px] text-ok">{T.readyToGenerate}</span>
              ) : (
                <span className="text-[12px] text-ink-3">{active?.problem}</span>
              )}
            </div>
            {test && (
              <Callout tone={test.ok ? 'info' : 'danger'} title={test.message}>
                {test.hint}
                {test.models && test.models.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {test.models.slice(0, 30).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set((x) => void (x.models[s.provider] = m))}
                        className="rounded-sm border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] hover:border-ink-3"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </Callout>
            )}

            <div className="mt-2 border-t border-line pt-4">
              <div className="eyebrow mb-3">{T.options}</div>
              <div className="flex flex-col gap-4">
                {s.provider === 'openai' && (
                  <>
                    <Toggle
                      checked={s.options.inputFidelityHigh}
                      onChange={(v) => set((x) => void (x.options.inputFidelityHigh = v))}
                      label={T.fidelity}
                      description={T.fidelityHint}
                    />
                    <Field label={T.outputFormat}>
                      <Segmented
                        value={s.options.outputFormat}
                        onChange={(v) => set((x) => void (x.options.outputFormat = v))}
                        options={[
                          { value: 'png', label: 'PNG' },
                          { value: 'jpeg', label: 'JPEG' },
                          { value: 'webp', label: 'WebP' },
                        ]}
                      />
                    </Field>
                  </>
                )}
                {s.provider === 'stability' && (
                  <>
                    <Field
                      label={T.structureStrength(num(s.options.controlStrength, { min: 2, max: 2 }))}
                      hint={T.structureStrengthHint}
                    >
                      <input
                        type="range"
                        min={0.3}
                        max={1}
                        step={0.05}
                        value={s.options.controlStrength}
                        onChange={(e) => set((x) => void (x.options.controlStrength = Number(e.target.value)))}
                        className="w-full accent-[#26221d]"
                      />
                    </Field>
                    <Field label={T.imageStrength(num(s.options.imageStrength, { min: 2, max: 2 }))} hint={T.imageStrengthHint}>
                      <input
                        type="range"
                        min={0.2}
                        max={0.95}
                        step={0.05}
                        value={s.options.imageStrength}
                        onChange={(e) => set((x) => void (x.options.imageStrength = Number(e.target.value)))}
                        className="w-full accent-[#26221d]"
                      />
                    </Field>
                    <Field label={T.outputFormat}>
                      <Segmented
                        value={s.options.outputFormat}
                        onChange={(v) => set((x) => void (x.options.outputFormat = v))}
                        options={[
                          { value: 'png', label: 'PNG' },
                          { value: 'jpeg', label: 'JPEG' },
                          { value: 'webp', label: 'WebP' },
                        ]}
                      />
                    </Field>
                  </>
                )}
                {s.provider === 'gemini' && (
                  <Field label={T.resolution} hint={T.resolutionHint}>
                    <Segmented
                      value={s.options.geminiImageSize}
                      onChange={(v) => set((x) => void (x.options.geminiImageSize = v))}
                      options={[
                        { value: '', label: T.default },
                        { value: '1K', label: '1K' },
                        { value: '2K', label: '2K' },
                        { value: '4K', label: '4K' },
                      ]}
                    />
                  </Field>
                )}
                <Field
                  label={T.maxEdge}
                  hint={T.maxEdgeHint}
                >
                  <Select value={String(s.options.maxUploadEdge)} onChange={(e) => set((x) => void (x.options.maxUploadEdge = Number(e.target.value)))}>
                    {[1024, 1536, 2048, 3072].map((v) => (
                      <option key={v} value={v}>
                        {num(v)} px
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={T.acceptsImages} hint={T.acceptsImagesHint}>
                    <Select
                      value={s.overrides.acceptsImages === null ? 'auto' : s.overrides.acceptsImages ? 'yes' : 'no'}
                      onChange={(e) => set((x) => void (x.overrides.acceptsImages = e.target.value === 'auto' ? null : e.target.value === 'yes'))}
                    >
                      <option value="auto">{T.routeAuto}</option>
                      <option value="yes">{t.common.yes}</option>
                      <option value="no">{T.noTextOnly}</option>
                    </Select>
                  </Field>
                  <Field label={T.maxImages}>
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      placeholder={T.routeAuto}
                      defaultValue={s.overrides.maxImages ?? ''}
                      key={`max-${s.overrides.maxImages}`}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value, 10);
                        set((x) => void (x.overrides.maxImages = Number.isFinite(n) && n > 0 ? Math.min(32, n) : null));
                      }}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          {caps && (
            <aside className="rounded-md border border-line bg-surface p-4 xl:self-start">
              <div className="eyebrow mb-3">{T.capsTitle}</div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[12.5px]">
                <dt className="text-ink-3">{T.capText}</dt>
                <dd>{caps.textToImage ? t.common.yes : t.common.no}</dd>
                <dt className="text-ink-3">{T.capPhotos}</dt>
                <dd>{caps.imageInput ? T.capUpTo(caps.maxImages) : t.common.no}</dd>
                <dt className="text-ink-3">{T.capNeedsPhoto}</dt>
                <dd>{caps.requiresBaseImage ? t.common.yes : t.common.no}</dd>
                <dt className="text-ink-3">{T.capPromptLength}</dt>
                <dd className="tabular">{T.chars(caps.maxPromptChars)}</dd>
                <dt className="text-ink-3">{T.capVariations}</dt>
                <dd>{num(caps.variationsMax)}</dd>
                <dt className="text-ink-3">{T.capKeeps}</dt>
                <dd>{t.studio.preserve[caps.preservation]}</dd>
              </dl>
              <ul className="mt-4 flex list-disc flex-col gap-1.5 ps-4 text-[11.5px] leading-relaxed text-ink-3" lang="en" dir="ltr">
                {caps.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}

      <Callout tone="neutral" title={T.keysTitle}>
        {T.keysBody}
      </Callout>
    </div>
  );
}

export function TextProviderSettings({ settings }: { settings: AppSettings }) {
  const t = useT();
  const T = t.providers;
  const s = settings.textProvider;
  const provider = getTextProvider(s.provider);
  const status = textProviderReady(s);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; hint?: string | null } | null>(null);
  const set = (recipe: (x: AppSettings['textProvider']) => void) => updateSettings((all) => void recipe(all.textProvider));
  useEffect(() => setResult(null), [s.provider]);
  const model = provider ? (s.models[s.provider] ?? '') : '';
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[720px] text-[12.5px] leading-relaxed text-ink-3">{T.textLead}</p>
      <Field label={T.provider}>
        <Select value={s.provider} onChange={(e) => set((x) => void (x.provider = e.target.value as TextProviderId))} className="max-w-[320px]">
          <option value="none">{T.notSetUp}</option>
          {TEXT_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      {provider && (
        <div className="grid max-w-[760px] gap-4">
          {provider.needsBaseUrl && (
            <Field label={T.baseUrl} hint={T.textBaseUrlHint}>
              <CommitInput dir="ltr" value={s.baseUrl} onCommit={(v) => set((x) => void (x.baseUrl = v.trim()))} placeholder="https://…/v1" />
            </Field>
          )}
          <Field
            label={T.apiKey}
            aside={
              provider.keyUrl ? (
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                >
                  {T.getKey} <ExternalLink size={11} />
                </a>
              ) : undefined
            }
          >
            <SecretInput
              label={T.apiKey}
              value={s.keys[s.provider] ?? ''}
              placeholder={provider.keyPlaceholder}
              onCommit={(v) => set((x) => void (x.keys[s.provider] = v))}
            />
          </Field>
          <Field label={T.model} hint={provider.defaultModel ? T.modelDefault(provider.defaultModel) : undefined}>
            <Input
              dir="ltr"
              list="text-models"
              defaultValue={model}
              key={`${s.provider}-${model}`}
              placeholder={provider.defaultModel}
              onBlur={(e) => e.target.value.trim() !== model && set((x) => void (x.models[s.provider] = e.target.value.trim()))}
            />
            <datalist id="text-models">
              {provider.suggestedModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <RouteField value={s.route} onChange={(r) => set((x) => void (x.route = r))} disabled={provider.needsBaseUrl} />
          <div className="flex items-center gap-2">
            <Button
              icon={Plug}
              loading={testing}
              disabled={!status.ready}
              onClick={async () => {
                setTesting(true);
                setResult(null);
                try {
                  const fresh = (await getSettledSettings()).textProvider;
                  setResult({ ok: true, message: await testTextProvider(fresh, new AbortController().signal) });
                } catch (e) {
                  const d = describeError(e);
                  setResult({ ok: false, message: d.message, hint: d.hint });
                } finally {
                  setTesting(false);
                }
              }}
            >
              {T.testShort}
            </Button>
            <span className={cn('text-[12px]', status.ready ? 'text-ok' : 'text-ink-3')}>{status.ready ? T.ready : status.problem}</span>
          </div>
          {result && (
            <Callout tone={result.ok ? 'info' : 'danger'} title={result.message}>
              {result.hint}
            </Callout>
          )}
          {s.provider === 'anthropic' && (
            <p className="text-[11.5px] leading-relaxed text-ink-3">{T.anthropicNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
