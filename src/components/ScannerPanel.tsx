import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  AlertTriangle,
  Camera,
  ImagePlus,
  KeyRound,
  Layers,
  Loader2,
  RotateCcw,
  ScanLine,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { BankEmiProfile } from '../data/bankPlansDb';
import { describeProcessingFee } from '../data/bankPlansDb';
import type { AuditOverrides, PlanOption } from '../lib/planTypes';
import type { DemoPreset, ExtractedScreenshotData } from '../services/visionScanner';
import { DEMO_PRESETS } from '../services/visionScanner';
import { formatINR } from '../lib/format';
import { Badge, Button, NumberField, Panel, Toggle } from './ui';

export interface ScannerPanelProps {
  apiKey: string;
  onOpenSettings: () => void;
  scanStatus: 'idle' | 'scanning' | 'done' | 'error';
  scanError: string | null;
  scanProgress: string | null;
  modelUsed: string | null;
  imagePreviewUrl: string | null;
  extracted: ExtractedScreenshotData | null;
  activePresetId: string | null;
  onPickFile: (file: File) => void;
  onScan: () => void;
  onLoadPreset: (preset: DemoPreset) => void;
  onClearScan: () => void;
  plans: PlanOption[];
  selectedPlanKey: string | null;
  onSelectPlan: (key: string) => void;
  compareAll: boolean;
  onToggleCompareAll: (next: boolean) => void;
  overrides: AuditOverrides;
  onOverrideChange: (patch: Partial<AuditOverrides>) => void;
  onResetOverrides: () => void;
  bankProfiles: BankEmiProfile[];
  activePlan: PlanOption | undefined;
}

export function ScannerPanel(props: ScannerPanelProps) {
  const {
    apiKey,
    onOpenSettings,
    scanStatus,
    scanError,
    scanProgress,
    modelUsed,
    imagePreviewUrl,
    extracted,
    activePresetId,
    onPickFile,
    onScan,
    onLoadPreset,
    onClearScan,
    plans,
    selectedPlanKey,
    onSelectPlan,
    compareAll,
    onToggleCompareAll,
    overrides,
    onOverrideChange,
    onResetOverrides,
    bankProfiles,
    activePlan,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onPickFile(file);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onPickFile(file);
  }

  const activeProfile = bankProfiles.find((profile) => profile.id === overrides.profileId) ?? bankProfiles[0];

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Screenshot Scanner"
        step="01"
        icon={<Camera size={15} />}
        subtitle="Drop a product page, EMI pop-up or checkout screenshot. Tesseract.js reads it on-device and the parser extracts only the numbers and UI facts — never the math."
        actions={
          <Button variant="outline" onClick={onOpenSettings} className="!px-2.5 !py-1.5">
            <KeyRound size={13} />
            {apiKey ? 'Cloud boost' : 'Add key'}
          </Button>
        }
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative flex min-h-[168px] flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition ${
            dragging ? 'border-blue-400 bg-blue-400/5' : 'border-term-line bg-black/25'
          }`}
        >
          {imagePreviewUrl ? (
            <div className="w-full">
              <img
                src={imagePreviewUrl}
                alt="Uploaded screenshot preview"
                className="mx-auto max-h-64 rounded-lg border border-term-line object-contain"
              />
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Button onClick={onScan} disabled={scanStatus === 'scanning'}>
                  {scanStatus === 'scanning' ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Scanning…
                    </>
                  ) : (
                    <>
                      <ScanLine size={13} /> Scan screenshot (on-device)
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus size={13} /> Replace
                </Button>
                <Button variant="ghost" onClick={onClearScan}>
                  <Trash2 size={13} /> Clear
                </Button>
              </div>
              {scanStatus === 'scanning' && scanProgress ? (
                <p className="mt-2 text-center text-[10.5px] text-blue-200/80">{scanProgress}</p>
              ) : null}
            </div>
          ) : (
            <>
              <ScanLine size={26} className="text-blue-300/70" />
              <p className="mt-3 text-sm font-semibold text-term-text">Drag & drop an EMI screenshot</p>
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-term-muted">
                PNG or JPEG of a product page, EMI options pop-up or the final payment screen. It never
                leaves your device.
              </p>
              <Button variant="outline" className="mt-3" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={13} /> Choose image
              </Button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {scanStatus === 'error' && scanError ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {scanError}
          </p>
        ) : null}

        {modelUsed ? (
          <p className="mt-3 text-[10.5px] text-term-muted">
            Extracted with <span className="num text-blue-300">{modelUsed}</span>
          </p>
        ) : null}
      </Panel>

      <Panel
        title="Instant Demo Presets"
        icon={<Sparkles size={15} />}
        subtitle="Pre-loaded screenshots with frozen JSON extraction — works offline, no API key needed."
      >
        <div className="flex flex-col gap-2">
          {DEMO_PRESETS.map((preset, index) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onLoadPreset(preset)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  isActive
                    ? 'border-blue-400/60 bg-blue-400/10'
                    : 'border-term-line bg-black/25 hover:border-blue-400/35'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="num mt-0.5 text-[10px] font-bold text-blue-300/80">
                    P{index + 1}
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-term-text">{preset.title}</span>
                    <span className="mt-0.5 block text-[10.5px] text-term-muted">{preset.subtitle}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {preset.reveals.slice(0, 3).map((line) => (
                        <Badge key={line} tone="neutral">
                          {line.split(' ').slice(0, 5).join(' ')}…
                        </Badge>
                      ))}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Detected EMI Plans"
        step="02"
        icon={<Layers size={15} />}
        subtitle={
          extracted
            ? `${extracted.platformName} · ${extracted.productName} · listed at ${formatINR(extracted.listedProductPriceINR)}`
            : 'Load a screenshot or a demo preset to unlock the plan switcher.'
        }
        actions={
          plans.length > 1 ? (
            <Button
              variant={compareAll ? 'primary' : 'outline'}
              onClick={() => onToggleCompareAll(!compareAll)}
              className="!px-2.5 !py-1.5"
            >
              Compare all
            </Button>
          ) : null
        }
      >
        {plans.length === 0 ? (
          <p className="rounded-lg border border-term-line bg-black/25 px-3 py-3 text-[11px] text-term-muted">
            No EMI plans yet. Every plan found in the screenshot becomes a clickable pill here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {plans.map((plan) => {
              const isActive = plan.key === selectedPlanKey;
              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => onSelectPlan(plan.key)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    isActive
                      ? 'border-blue-400/60 bg-blue-400/10'
                      : 'border-term-line bg-black/25 hover:border-blue-400/35'
                  }`}
                >
                  <span className="block text-[11.5px] font-semibold text-term-text">
                    {plan.lenderName}
                  </span>
                  <span className="num block text-[10.5px] text-term-muted">
                    {plan.tenureMonths}M · {formatINR(plan.monthlyEmiShownINR)}
                    {plan.isMarkedNoCost ? ' · 0%' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activePlan ? (
          <div className="mt-4 rounded-xl border border-term-line bg-black/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
                  Lender database match
                </div>
                <div className="text-xs font-semibold text-term-text">{activePlan.profile.displayName}</div>
              </div>
              {activePlan.profile.isCustomUserAdded ? <Badge tone="info">Custom rule</Badge> : null}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-term-muted">Database rate</dt>
                <dd className="num text-term-text">
                  {activePlan.profile.nominalInterestRatesPa[activePlan.tenureMonths] ?? '—'}% p.a.
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-term-muted">GST on interest</dt>
                <dd className="num text-term-text">
                  {activePlan.profile.gstOnMonthlyInterestPercent}%
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-term-muted">Fee rule</dt>
                <dd className="num text-term-text">{describeProcessingFee(activePlan.profile)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-term-muted">Foreclosure</dt>
                <dd className="num text-term-text">
                  {activePlan.profile.foreclosurePenaltyPercent}% + GST
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Editable Audit Overrides"
        step="03"
        icon={<Wand2 size={15} />}
        subtitle="Everything is recomputed instantly. Nothing is sent anywhere — the math is local and deterministic."
        actions={
          <Button variant="ghost" onClick={onResetOverrides} className="!px-2 !py-1.5">
            <RotateCcw size={12} /> Reset
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Listed price"
            prefix="₹"
            value={overrides.listedPriceINR}
            onChange={(value) => onOverrideChange({ listedPriceINR: value })}
          />
          <NumberField
            label="Tenure"
            suffix="mo"
            min={1}
            value={overrides.tenureMonths}
            onChange={(value) => onOverrideChange({ tenureMonths: Math.round(value) })}
          />
          <label className="col-span-2 block">
            <span className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
              Lender profile
            </span>
            <select
              className="num mt-1 w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs font-semibold text-term-text outline-none focus:border-blue-400/50"
              value={overrides.profileId}
              onChange={(event) => {
                const nextProfile = bankProfiles.find((profile) => profile.id === event.target.value);
                if (!nextProfile) return;
                const rate = nextProfile.nominalInterestRatesPa[overrides.tenureMonths];
                onOverrideChange({
                  profileId: nextProfile.id,
                  nominalRatePa:
                    typeof rate === 'number' ? rate : nextProfile.nominalInterestRatesPa[6] ?? 16,
                  processingFeeINR: nextProfile.processingFee.flatAmountINR,
                });
              }}
            >
              {bankProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName}
                  {profile.isCustomUserAdded ? ' (custom)' : ''}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Processing fee (ex-GST)"
            prefix="₹"
            value={overrides.processingFeeINR}
            onChange={(value) => onOverrideChange({ processingFeeINR: value })}
            hint={activeProfile ? `DB rule: ${describeProcessingFee(activeProfile)}` : undefined}
          />
          <NumberField
            label="Nominal rate (ex-GST)"
            suffix="% p.a."
            step={0.01}
            value={overrides.nominalRatePa}
            onChange={(value) => onOverrideChange({ nominalRatePa: value })}
            hint="The bank's internal reducing-balance rate"
          />
          <NumberField
            label="Sneaked add-ons"
            prefix="₹"
            value={overrides.sneakedAddOnsTotal}
            onChange={(value) => onOverrideChange({ sneakedAddOnsTotal: value })}
          />
          <div className="col-span-2">
            <Toggle
              checked={overrides.isAdvertisedNoCostEmi}
              onChange={(next) => onOverrideChange({ isAdvertisedNoCostEmi: next })}
              label='Marketed as "No-Cost / 0% Interest"'
              hint="Off = a standard interest-bearing EMI, where the merchant discount is absent."
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}
