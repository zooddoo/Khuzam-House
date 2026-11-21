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

function SecretInput({ value, onCommit, placeholder, label }: { value: string; onCommit: (v: string) => void; placeholder?: string; label: string }) {
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
      />
      <Button
        size="md"
        variant="secondary"
        icon={show ? EyeOff : Eye}
        aria-label={show ? 'Hide key' : 'Show key'}
        onClick={() => setShow((s) => !s)}
        className="!px-2.5"
      />
      {value && (
        <Button
          size="md"
          variant="ghost"
          icon={X}
          aria-label="Remove key"
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
  const [proxy, setProxy] = useState<boolean | null>(null);
  useEffect(() => {
    proxyAvailable().then(setProxy);
  }, []);
  return (
    <Field
      label="Connection"
      hint={
        disabled
          ? 'Custom endpoints are always called directly from the browser.'
          : proxy === null
            ? 'Checking for the local proxy…'
            : proxy
              ? 'Local proxy detected (running via npm). “Automatic” sends requests through it, avoiding browser cross-origin limits.'
              : 'No local proxy detected — requests go directly from the browser. Run the studio with “npm run dev” or “npm start” to enable the proxy.'
      }
    >
      <Segmented
        value={disabled ? 'direct' : value}
        onChange={(v) => !disabled && onChange(v)}
        options={[
          { value: 'auto', label: 'Automatic' },
          { value: 'proxy', label: 'Local proxy' },
          { value: 'direct', label: 'Direct' },
        ]}
      />
    </Field>
  );
}

export function ImageProviderSettings({ settings }: { settings: AppSettings }) {
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
            label: 'Not set up',
            description: 'The studio works fully; prompts can be copied or saved, but no images are generated.',
          },
          ...IMAGE_PROVIDERS,
        ].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => set((x) => void (x.provider = p.id))}
            aria-pressed={s.provider === p.id}
            className={cn(
              'rounded-md border p-3.5 text-left transition-colors',
              s.provider === p.id ? 'border-ink bg-raised ring-1 ring-ink' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <div className="flex items-center justify-between gap-2 text-[13.5px] text-ink">
              {p.label}
              {s.provider === p.id && <Check size={14} />}
            </div>
            <div className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{p.description}</div>
          </button>
        ))}
      </div>

      {provider && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            {provider.needsBaseUrl && (
              <Field label="Base URL" hint="Including the version path, e.g. https://api.example.com/v1">
                <CommitInput value={s.baseUrl} onCommit={(v) => set((x) => void (x.baseUrl = v.trim()))} placeholder="https://…/v1" />
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
                    Get a key <ExternalLink size={11} />
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
            <Field label="Model" hint={provider.defaultModel ? `Leave empty to use ${provider.defaultModel}.` : 'The model name your endpoint expects.'}>
              <Input
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
                      className="text-left text-[11.5px] text-ink-3 hover:text-ink"
                    >
                      <span className={cn('font-mono', (model || provider.defaultModel) === m.id && 'text-ink')}>{m.id}</span> — {m.note}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <RouteField value={s.route} onChange={(r) => set((x) => void (x.route = r))} disabled={!provider.supportsProxy} />
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={Plug} onClick={runTest} loading={testing}>
                Test connection
              </Button>
              {active?.ready ? (
                <span className="text-[12px] text-ok">Ready to generate</span>
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
              <div className="eyebrow mb-3">Options</div>
              <div className="flex flex-col gap-4">
                {s.provider === 'openai' && (
                  <>
                    <Toggle
                      checked={s.options.inputFidelityHigh}
                      onChange={(v) => set((x) => void (x.options.inputFidelityHigh = v))}
                      label="High input fidelity"
                      description="Keeps the room photo’s details closer (gpt-image models that support it). Retries without it if the model rejects the option."
                    />
                    <Field label="Output format">
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
                      label={`Structure strength · ${s.options.controlStrength.toFixed(2)}`}
                      hint="Higher keeps more of the photo’s structure (control-structure)."
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
                    <Field label={`Image-to-image strength · ${s.options.imageStrength.toFixed(2)}`} hint="Lower keeps more of the photo (sd3 models).">
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
                    <Field label="Output format">
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
                  <Field label="Output resolution" hint="Only sent to models that support it (e.g. Gemini 3 Pro Image).">
                    <Segmented
                      value={s.options.geminiImageSize}
                      onChange={(v) => set((x) => void (x.options.geminiImageSize = v))}
                      options={[
                        { value: '', label: 'Default' },
                        { value: '1K', label: '1K' },
                        { value: '2K', label: '2K' },
                        { value: '4K', label: '4K' },
                      ]}
                    />
                  </Field>
                )}
                <Field
                  label="Largest side of images sent"
                  hint="Copies are resized and stripped of metadata such as GPS before upload. Your originals are never changed."
                >
                  <Select value={String(s.options.maxUploadEdge)} onChange={(e) => set((x) => void (x.options.maxUploadEdge = Number(e.target.value)))}>
                    {[1024, 1536, 2048, 3072].map((v) => (
                      <option key={v} value={v}>
                        {v} px
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Accepts image inputs" hint="Override only if the model’s real capability differs.">
                    <Select
                      value={s.overrides.acceptsImages === null ? 'auto' : s.overrides.acceptsImages ? 'yes' : 'no'}
                      onChange={(e) => set((x) => void (x.overrides.acceptsImages = e.target.value === 'auto' ? null : e.target.value === 'yes'))}
                    >
                      <option value="auto">Automatic</option>
                      <option value="yes">Yes</option>
                      <option value="no">No (text only)</option>
                    </Select>
                  </Field>
                  <Field label="Max images per request">
                    <Input
                      inputMode="numeric"
                      placeholder="Automatic"
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
              <div className="eyebrow mb-3">What this model can do</div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[12.5px]">
                <dt className="text-ink-3">Generate from text</dt>
                <dd>{caps.textToImage ? 'Yes' : 'No'}</dd>
                <dt className="text-ink-3">Use your photos</dt>
                <dd>{caps.imageInput ? `Yes, up to ${caps.maxImages}` : 'No'}</dd>
                <dt className="text-ink-3">Needs a room photo</dt>
                <dd>{caps.requiresBaseImage ? 'Yes' : 'No'}</dd>
                <dt className="text-ink-3">Prompt length</dt>
                <dd className="tabular">{caps.maxPromptChars.toLocaleString()} chars</dd>
                <dt className="text-ink-3">Variations per click</dt>
                <dd>{caps.variationsMax}</dd>
                <dt className="text-ink-3">Keeps architecture</dt>
                <dd className="capitalize">{caps.preservation === 'none' ? 'Cannot see photos' : caps.preservation}</dd>
              </dl>
              <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-4 text-[11.5px] leading-relaxed text-ink-3">
                {caps.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}

      <Callout tone="neutral" title="How keys are handled">
        API keys are stored only in this browser’s local database on this device and are never hard-coded. They are sent only to the provider you choose —
        directly, or through the local proxy that runs on your own machine with “npm run dev” / “npm start”. Backups leave keys out unless you choose to include
        them. This studio is independent of ChatGPT: it never uses a ChatGPT account, conversation or project.
      </Callout>
    </div>
  );
}

export function TextProviderSettings({ settings }: { settings: AppSettings }) {
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
      <p className="max-w-[720px] text-[12.5px] leading-relaxed text-ink-3">
        Optional. Used only for “Structure with AI” when pasting many requirements at once. The offline splitter works without it.
      </p>
      <Field label="Provider">
        <Select value={s.provider} onChange={(e) => set((x) => void (x.provider = e.target.value as TextProviderId))} className="max-w-[320px]">
          <option value="none">Not set up</option>
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
            <Field label="Base URL" hint="OpenAI-compatible chat completions endpoint, e.g. http://localhost:11434/v1">
              <CommitInput value={s.baseUrl} onCommit={(v) => set((x) => void (x.baseUrl = v.trim()))} placeholder="https://…/v1" />
            </Field>
          )}
          <Field
            label="API key"
            aside={
              provider.keyUrl ? (
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                >
                  Get a key <ExternalLink size={11} />
                </a>
              ) : undefined
            }
          >
            <SecretInput
              label="API key"
              value={s.keys[s.provider] ?? ''}
              placeholder={provider.keyPlaceholder}
              onCommit={(v) => set((x) => void (x.keys[s.provider] = v))}
            />
          </Field>
          <Field label="Model" hint={provider.defaultModel ? `Leave empty to use ${provider.defaultModel}.` : undefined}>
            <Input
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
              Test
            </Button>
            <span className={cn('text-[12px]', status.ready ? 'text-ok' : 'text-ink-3')}>{status.ready ? 'Ready' : status.problem}</span>
          </div>
          {result && (
            <Callout tone={result.ok ? 'info' : 'danger'} title={result.message}>
              {result.hint}
            </Callout>
          )}
          {s.provider === 'anthropic' && (
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              Uses the official Anthropic SDK with structured JSON output. For current Claude models, server-side refusal fallback is enabled so a declined
              request is retried on Anthropic’s recommended model.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
