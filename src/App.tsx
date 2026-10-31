import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  Copy,
  FileText,
  KeyRound,
  Loader2,
  Menu,
  ScanLine,
  ShieldCheck,
  Sliders,
  Table2,
  Upload,
  X,
} from 'lucide-react';

import type { BankEmiProfile } from './data/bankPlansDb';
import {
  computeProcessingFeeBase,
  getAllBankProfiles,
  getBankProfileByKeyword,
  resolveNominalRatePa,
} from './data/bankPlansDb';
import {
  calculateEmiTruth,
  deriveNominalRateFromDiscount,
  deriveNominalRateFromEmi,
} from './lib/emiMathEngine';
import { buildPlanOptions } from './lib/planTypes';
import type { PlanOption } from './lib/planTypes';
import { CustomEmiPanel } from './components/CustomEmiPanel';
import { LiveBlueHoverBackground } from './components/LiveBlueHoverBackground';
import { PlanComparison } from './components/PlanComparison';
import { evaluateCompliance, generateNchDossier } from './lib/complianceJudge';
import { formatINR, formatPercent } from './lib/format';
import type { ExtractedScreenshotData } from './services/visionScanner';
import {
  getStoredApiKey,
  scanCheckoutScreenshot,
  setStoredApiKey,
} from './services/visionScanner';

const inputClass =
  'w-full rounded-lg border border-blue-900/70 bg-[#070d18] px-3 py-2 text-sm text-white outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const severityStyles: Record<string, string> = {
  CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  HIGH: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  MEDIUM: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
};

type MenuTab = 'CUSTOM_EMI' | 'BANKS';

type RateSource = 'screenshot rate' | 'monthly EMI' | 'upfront discount' | 'lender database';

/**
 * The screenshot is the source of truth. Use a stated rate first, then the
 * instalment or upfront discount printed on the page, and only fall back to the
 * seeded lender rule when the page is genuinely silent.
 */
function resolveAuditRate(args: {
  statedRate: number | undefined;
  upfrontDiscount: number | undefined;
  monthlyEmi: number;
  isNoCost: boolean;
  price: number;
  tenureMonths: number;
  fallback: number;
}): { rate: number; source: RateSource } {
  const { statedRate, upfrontDiscount, monthlyEmi, isNoCost, price, tenureMonths, fallback } = args;

  if (typeof statedRate === 'number' && Number.isFinite(statedRate) && statedRate > 0.05) {
    return { rate: statedRate, source: 'screenshot rate' };
  }

  if (!isNoCost && monthlyEmi > price / tenureMonths + 1) {
    const derived = deriveNominalRateFromEmi(price, monthlyEmi, tenureMonths);
    if (derived > 0.05) return { rate: derived, source: 'monthly EMI' };
  }

  if (typeof upfrontDiscount === 'number' && upfrontDiscount > 0) {
    const derived = deriveNominalRateFromDiscount(price, upfrontDiscount, tenureMonths);
    if (derived > 0.05) return { rate: derived, source: 'upfront discount' };
  }

  return { rate: fallback, source: 'lender database' };
}

function readFilePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image file.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

export default function App() {
  /* ------------------------------ navigation ----------------------------- */
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMenuTab, setActiveMenuTab] = useState<MenuTab>('CUSTOM_EMI');

  /* ------------------------------ scan state ----------------------------- */
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedScreenshotData | null>(null);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  /** false = the multi-option comparison page, true = one plan in detail. */
  const [showDetail, setShowDetail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [groqApiKey, setGroqApiKey] = useState(() => getStoredApiKey());

  /* ------------------------------ bank data ------------------------------ */
  const [bankProfiles] = useState<BankEmiProfile[]>(() => getAllBankProfiles());

  /* ----------------------------- dispute state --------------------------- */
  const [isDisputeOpen, setIsDisputeOpen] = useState(false);
  const [copiedDispute, setCopiedDispute] = useState(false);
  const [complainantName, setComplainantName] = useState('');
  const disputeRef = useRef<HTMLTextAreaElement>(null);

  /* ------------------------------- scanning ------------------------------ */
  async function handleScreenshotFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setScanError('Please choose a PNG, JPEG or WebP screenshot of the product or checkout page.');
      return;
    }

    try {
      setPreviewImageUrl(await readFilePreview(file));
    } catch (error) {
      setScanError((error as Error).message);
      return;
    }

    setIsScanning(true);
    setScanError(null);
    setScanStatus('Initializing the on-device OCR engine…');

    try {
      const result = await scanCheckoutScreenshot(file, groqApiKey, (message) =>
        setScanStatus(message),
      );
      setExtractedData(result);
      setSelectedPlanIndex(0);
      setShowDetail(false);
    } catch (error) {
      setScanError((error as Error).message);
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleScreenshotFile(file);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleScreenshotFile(file);
  }

  function handleResetToHome() {
    setExtractedData(null);
    setPreviewImageUrl(null);
    setSelectedPlanIndex(0);
    setShowDetail(false);
    setScanError(null);
    setScanStatus('');
    setIsScanning(false);
  }

  /* ------------------------------ plan data ------------------------------ */
  const plans = useMemo(
    () =>
      extractedData
        ? buildPlanOptions(extractedData, getBankProfileByKeyword, 'screenshot')
        : [],
    // The registry is mutable, so a bank-list change must rebuild the plans.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extractedData, bankProfiles],
  );

  const sneakedAddOnsTotal = useMemo(() => {
    if (!extractedData) return 0;
    const preTickedTotal = extractedData.detectedUiViolations.preTickedAddonsFound.reduce(
      (sum, item) => sum + item.amountINR,
      0,
    );
    // A processing fee is already priced by the engine; counting it again as a
    // "drip" charge would double-bill the same rupee.
    const extraDripTotal = extractedData.detectedUiViolations.dripFeesFound
      .filter((fee) => !/(processing|booking)\s*(fee|charge)/i.test(fee.label))
      .reduce((sum, fee) => sum + fee.amountINR, 0);
    return preTickedTotal + extraDripTotal;
  }, [extractedData]);

  /** Prices one plan with the deterministic engine, from its own terms. */
  function auditPlan(plan: PlanOption) {
    if (!extractedData) return null;

    const bank = plan.profile;
    const price = Math.max(1, extractedData.listedProductPriceINR);
    const tenure = Math.max(1, Math.round(plan.tenureMonths));

    const rateInfo = resolveAuditRate({
      statedRate: plan.nominalInterestRateShownPa,
      upfrontDiscount: plan.upfrontInterestDiscountShownINR,
      monthlyEmi: plan.monthlyEmiShownINR,
      isNoCost: plan.isMarkedNoCost,
      price,
      tenureMonths: tenure,
      fallback: resolveNominalRatePa(bank, tenure),
    });

    const screenshotFee = plan.processingFeeShownINR;
    const fee = screenshotFee ?? computeProcessingFeeBase(bank, price);
    const feeSource = screenshotFee !== undefined ? 'screenshot' : 'lender database';

    try {
      const calc = calculateEmiTruth({
        listedProductPrice: price,
        tenureMonths: tenure,
        isAdvertisedNoCostEmi: plan.isMarkedNoCost,
        extractedUpfrontDiscount: plan.upfrontInterestDiscountShownINR,
        extractedMonthlyEmi: plan.monthlyEmiShownINR,
        sneakedAddOnsTotal,
        bankProfile: bank,
        overrideProcessingFeeINR: fee,
        overrideNominalRatePa: rateInfo.rate,
      });
      const verdict = evaluateCompliance({ calc, extracted: extractedData });
      return { plan, bank, calc, verdict, rateInfo, feeSource };
    } catch {
      return null;
    }
  }

  const activeAudit = useMemo(() => {
    const plan = plans[selectedPlanIndex] ?? plans[0];
    return plan ? auditPlan(plan) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedData, plans, selectedPlanIndex, bankProfiles, sneakedAddOnsTotal]);

  /** Every option on the page priced the same way, for the comparison table. */
  const comparisonRows = useMemo(
    () =>
      plans
        .map((plan, index) => {
          const audit = auditPlan(plan);
          return audit
            ? {
                index,
                plan,
                calc: audit.calc,
                rateSource: audit.rateInfo.source,
                feeSource: audit.feeSource,
              }
            : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extractedData, plans, bankProfiles, sneakedAddOnsTotal],
  );

  // More than one rate/tenure/instalment on the page means the reader deserves a
  // cost comparison rather than a single-plan verdict.
  const compareMode = comparisonRows.length > 1 && !showDetail;

  const disputeLetterText = useMemo(() => {
    if (!extractedData || !activeAudit) return '';
    return generateNchDossier({
      verdict: activeAudit.verdict,
      calc: activeAudit.calc,
      extracted: extractedData,
      lenderName: activeAudit.bank.displayName,
      complainantName,
      platformOverride: extractedData.platformName,
    });
  }, [activeAudit, extractedData, complainantName]);

  /* -------------------------------- dispute ------------------------------ */
  async function copyDispute() {
    if (!disputeLetterText) return;
    try {
      await navigator.clipboard.writeText(disputeLetterText);
      setCopiedDispute(true);
      window.setTimeout(() => setCopiedDispute(false), 2200);
    } catch {
      const field = disputeRef.current;
      if (field) {
        field.focus();
        field.select();
      }
    }
  }

  function downloadDispute() {
    if (!disputeLetterText) return;
    const blob = new Blob([disputeLetterText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'checkmate-nch-1915-complaint.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /* --------------------------------- view -------------------------------- */
  return (
    <div className="relative flex min-h-screen flex-col font-sans text-white selection:bg-blue-600 selection:text-white">
      <LiveBlueHoverBackground />
      <header className="sticky top-0 z-30 border-b border-blue-950/70 bg-[#03060c]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={handleResetToHome}
            className="flex items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white shadow-sm">
              <ShieldCheck size={18} />
            </span>
            <span className="text-xl font-bold tracking-tight">
              Check<span className="text-blue-400">Mate</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open demos and options"
            className="flex items-center gap-2 rounded-lg border border-blue-950/70 bg-[#070d18] px-3.5 py-2 text-sm font-medium text-slate-300 shadow-sm transition hover:bg-[#0a1322]"
          >
            <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
              Demos &amp; options
            </span>
            <Menu size={18} />
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {!extractedData ? (
          <section className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center py-8">
            <h1 className="text-center text-5xl font-black tracking-tight text-white sm:text-7xl">
              <span className="text-blue-500">#</span>AbHogaAsliHisab
            </h1>

            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a product, EMI or checkout screenshot"
              aria-disabled={isScanning}
              onClick={() => {
                if (!isScanning) fileInputRef.current?.click();
              }}
              onKeyDown={(event) => {
                if (!isScanning && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`mt-10 w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed px-6 py-14 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isDragging
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-blue-900/70 bg-[#050a13]/60 hover:border-blue-600 hover:bg-[#07101d]/80'
              }`}
            >
              {isScanning ? (
                <>
                  <Loader2 size={32} className="mx-auto animate-spin text-blue-400" />
                  <p className="mt-4 text-sm font-semibold text-slate-200">{scanStatus}</p>
                </>
              ) : (
                <>
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white">
                    <Upload size={24} />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-100">Drop a screenshot here</p>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPEG or WebP · click to browse</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {scanError ? (
              <p className="mt-4 flex max-w-xl items-start gap-2 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-left text-xs leading-relaxed text-rose-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {scanError}
              </p>
            ) : null}
          </section>
        ) : (
          <>
            <div className="mx-auto max-w-4xl space-y-6 pb-16">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleResetToHome}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-white"
                >
                  <ArrowLeft size={14} /> Scan another screenshot
                </button>
                <span className="text-[11px] font-medium text-slate-500">
                  Read on-device ·{' '}
                  {extractedData.emiOptionsShown.length} plan
                  {extractedData.emiOptionsShown.length === 1 ? '' : 's'} found
                </span>
              </div>

              {!activeAudit ? (
                <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-6 text-sm text-amber-200">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={16} /> No auditable EMI plan found
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    The screenshot did not contain a lender, tenure and instalment the parser could
                    use. Try a sharper image, or enter the figures yourself under Custom EMI
                    breakdown.
                  </p>

                  {extractedData.detectedLenderFees && extractedData.detectedLenderFees.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-blue-900/60 bg-[#080f1b] p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                        Lenders and bank processing fees read from this page
                      </p>
                      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {extractedData.detectedLenderFees.map((lender) => (
                          <li
                            key={lender.lenderName}
                            className="flex items-center justify-between gap-3 border-b border-blue-950/60 pb-1 text-[11.5px] text-slate-300 last:border-0"
                          >
                            <span className="min-w-0 truncate">{lender.lenderName}</span>
                            <span className="shrink-0 tabular-nums text-white">
                              {lender.processingFeeINR === undefined
                                ? 'fee not shown'
                                : formatINR(lender.processingFeeINR)}
                              {lender.ratesShownPa.length > 0 ? (
                                <span className="ml-2 text-blue-300">
                                  {lender.ratesShownPa.map((rate) => formatPercent(rate)).join(' / ')}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2.5 text-[10.5px] leading-relaxed text-slate-500">
                        These are the banks' own processing fees (18% GST is billed on top). Scan a
                        screenshot that also shows the price and monthly instalment, or expand a
                        lender's chevron, to run the full true-APR audit.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  {compareMode ? (
                    <PlanComparison
                      rows={comparisonRows}
                      listedPrice={Math.max(1, extractedData.listedProductPriceINR)}
                      onSelect={(index) => {
                        setSelectedPlanIndex(index);
                        setShowDetail(true);
                      }}
                    />
                  ) : (
                    <>
                  {/* 1 — the screenshot that was scanned ---------------------- */}
                  <section className="overflow-hidden rounded-3xl border border-blue-950/60 bg-[#060b14]">
                    {previewImageUrl ? (
                      <div className="flex justify-center bg-black/30 px-4 py-4">
                        <img
                          src={previewImageUrl}
                          alt="Scanned checkout screenshot"
                          className="max-h-[420px] max-w-full rounded-lg object-contain"
                        />
                      </div>
                    ) : (
                      <div className="grid h-44 place-items-center bg-black/20 text-slate-600">
                        <ScanLine size={30} />
                      </div>
                    )}
                    <div className="flex flex-wrap items-end justify-between gap-4 border-t border-blue-950/50 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                          {extractedData.platformName}
                        </p>
                        <h1 className="mt-1 text-base font-semibold leading-snug text-white">
                          {extractedData.productName}
                        </h1>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Listed price
                        </p>
                        <p className="text-xl font-semibold tabular-nums text-white">
                          {formatINR(activeAudit.calc.listedProductPrice)}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* 2 — plan summary as text boxes -------------------------- */}
                  <section className="rounded-3xl border border-blue-950/60 bg-[#060b14] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-white">The EMI plan</h2>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {comparisonRows.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setShowDetail(false)}
                            className="flex items-center gap-1.5 rounded-full border border-blue-800/70 bg-blue-950/30 px-3 py-1 text-[11px] font-semibold text-blue-300 transition hover:border-blue-600 hover:text-blue-200"
                          >
                            <Table2 size={12} /> Compare all {comparisonRows.length} options
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuTab('CUSTOM_EMI');
                            setIsMenuOpen(true);
                          }}
                          className="flex items-center gap-1.5 rounded-full border border-blue-950/70 px-3 py-1 text-[11px] font-semibold text-slate-400 transition hover:border-blue-700 hover:text-white"
                        >
                          <Sliders size={12} /> Custom EMI breakdown
                        </button>
                      </div>
                    </div>

                    {plans.length > 1 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {plans.map((plan, index) => (
                          <button
                            key={plan.key}
                            type="button"
                            onClick={() => setSelectedPlanIndex(index)}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                              index === selectedPlanIndex
                                ? 'border-blue-500 bg-blue-600/15 text-blue-200'
                                : 'border-blue-950/70 text-slate-400 hover:text-white'
                            }`}
                          >
                            {plan.lenderName} · {plan.tenureMonths}m
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Lender
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-white">
                          {activeAudit.bank.displayName}
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {activeAudit.bank.gstOnMonthlyInterestPercent}% GST on interest
                        </p>
                      </div>

                      <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Tenure
                        </dt>
                        <dd className="mt-1 text-sm font-semibold tabular-nums text-white">
                          {activeAudit.calc.tenureMonths} months
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          One instalment per month
                        </p>
                      </div>

                      <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Monthly EMI
                        </dt>
                        <dd className="mt-1 text-sm font-semibold tabular-nums text-white">
                          {formatINR(activeAudit.plan.monthlyEmiShownINR)}
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          As printed on the page
                        </p>
                      </div>

                      <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Interest rate
                        </dt>
                        <dd className="mt-1 text-sm font-semibold tabular-nums text-white">
                          {formatPercent(activeAudit.calc.nominalRatePa)} p.a.
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {activeAudit.calc.isAdvertisedNoCostEmi ? 'Claimed 0% · ' : ''}
                          {activeAudit.rateInfo.source}
                        </p>
                      </div>

                      <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Processing fee
                        </dt>
                        <dd className="mt-1 text-sm font-semibold tabular-nums text-white">
                          {formatINR(activeAudit.calc.processingFeeBase)}
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          + {formatINR(activeAudit.calc.gstOnProcessingFee)} GST · {activeAudit.feeSource}
                        </p>
                      </div>

                      <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Upfront interest discount
                        </dt>
                        <dd className="mt-1 text-sm font-semibold tabular-nums text-white">
                          {activeAudit.calc.upfrontMerchantDiscount > 0
                            ? formatINR(activeAudit.calc.upfrontMerchantDiscount)
                            : 'None'}
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {activeAudit.calc.upfrontMerchantDiscount > 0
                            ? 'Funded by the merchant, not the bank'
                            : 'No subvention applied to this plan'}
                        </p>
                      </div>
                    </dl>

                    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                      <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Advertised rate
                        </dt>
                        <dd className="mt-1 text-lg font-semibold text-white">
                          {activeAudit.calc.isAdvertisedNoCostEmi
                            ? '0%'
                            : formatPercent(activeAudit.calc.nominalRatePa)}
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {activeAudit.calc.isAdvertisedNoCostEmi
                            ? '“No-Cost EMI” headline'
                            : 'Standard interest-bearing EMI'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-blue-500/50 bg-blue-600/15 px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">
                          True effective APR
                        </dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
                          {formatPercent(activeAudit.calc.trueEffectiveAprPercent)}
                        </dd>
                        <p className="mt-0.5 text-[10px] text-blue-300/80">
                          Every fee and GST, annualised
                        </p>
                      </div>

                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-3.5 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-rose-300/80">
                          Extra over cash price
                        </dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-rose-300">
                          +{formatINR(activeAudit.calc.hiddenExtraCostOverCash)}
                        </dd>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {formatINR(activeAudit.calc.totalPaidViaEmi)} paid in total
                        </p>
                      </div>
                    </div>

                    {activeAudit.rateInfo.source === 'lender database' ? (
                      <p className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-[10.5px] leading-relaxed text-amber-200/90">
                        {activeAudit.plan.isMarkedNoCost
                          ? 'The page claims No-Cost EMI but prints no rate or upfront discount, so the bank rate cannot be derived from the image. The stored lender rule is used.'
                          : 'The screenshot prints no interest rate, and its instalment does not imply one, so the stored lender rule is used.'}{' '}
                        Price your own plan under Custom EMI breakdown.
                      </p>
                    ) : null}
                  </section>

                  {/* 3 — full calculation + pie ------------------------------ */}
                  <section className="rounded-3xl border border-blue-950/60 bg-[#060b14] p-5">
                    <h2 className="text-sm font-semibold text-white">How the money adds up</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Cash price against everything the instalment scheme actually charges.
                    </p>

                    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
                      <div className="self-start">
                        <div className="flex items-baseline justify-between border-b border-blue-950/60 pb-2 text-[12.5px]">
                          <span className="text-slate-300">Cash price</span>
                          <span className="font-semibold tabular-nums text-white">
                            {formatINR(activeAudit.calc.listedProductPrice)}
                          </span>
                        </div>

                        {activeAudit.calc.upfrontMerchantDiscount > 0 ? (
                          <>
                            <div className="flex items-baseline justify-between border-b border-blue-950/60 py-2 text-[12.5px]">
                              <span className="text-slate-400">Merchant interest discount</span>
                              <span className="tabular-nums text-slate-300">
                                −{formatINR(activeAudit.calc.upfrontMerchantDiscount)}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between border-b border-blue-950/60 py-2 text-[12.5px]">
                              <span className="text-slate-400">Amount financed by the bank</span>
                              <span className="tabular-nums text-white">
                                {formatINR(activeAudit.calc.loanPrincipal)}
                              </span>
                            </div>
                          </>
                        ) : null}

                        <div className="flex items-baseline justify-between border-b border-blue-950/60 py-2 text-[12.5px]">
                          <span className="text-slate-400">Bank interest over {activeAudit.calc.tenureMonths} months</span>
                          <span className="tabular-nums text-white">
                            +{formatINR(activeAudit.calc.totalBankInterest)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between border-b border-blue-950/60 py-2 text-[12.5px]">
                          <span className="text-slate-400">GST on that interest (18%)</span>
                          <span className="tabular-nums text-amber-300">
                            +{formatINR(activeAudit.calc.totalGstOnInterest)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between border-b border-blue-950/60 py-2 text-[12.5px]">
                          <span className="text-slate-400">Processing fee</span>
                          <span className="tabular-nums text-white">
                            +{formatINR(activeAudit.calc.processingFeeBase)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between border-b border-blue-950/60 py-2 text-[12.5px]">
                          <span className="text-slate-400">GST on the processing fee</span>
                          <span className="tabular-nums text-amber-300">
                            +{formatINR(activeAudit.calc.gstOnProcessingFee)}
                          </span>
                        </div>
                        {activeAudit.calc.sneakedAddOnsTotal > 0 ? (
                          <div className="flex items-baseline justify-between border-b border-blue-950/60 py-2 text-[12.5px]">
                            <span className="text-slate-400">Pre-ticked / drip charges</span>
                            <span className="tabular-nums text-white">
                              +{formatINR(activeAudit.calc.sneakedAddOnsTotal)}
                            </span>
                          </div>
                        ) : null}

                        <div className="mt-1 flex items-baseline justify-between rounded-xl bg-blue-600/10 px-3 py-2.5 text-[13px]">
                          <span className="font-semibold text-white">Total paid via EMI</span>
                          <span className="font-semibold tabular-nums text-white">
                            {formatINR(activeAudit.calc.totalPaidViaEmi)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between px-3 text-[12.5px]">
                          <span className="text-slate-400">Extra over paying cash</span>
                          <span className="font-semibold tabular-nums text-rose-300">
                            +{formatINR(activeAudit.calc.hiddenExtraCostOverCash)}
                          </span>
                        </div>

                        <p className="mt-3 text-[10.5px] leading-relaxed text-slate-500">
                          Effective cost of credit: {formatPercent(activeAudit.calc.trueEffectiveAprPercent)} p.a.
                          on {formatINR(activeAudit.calc.loanPrincipal)} financed — the headline says{' '}
                          {activeAudit.calc.isAdvertisedNoCostEmi
                            ? '0%'
                            : `${formatPercent(activeAudit.calc.nominalRatePa)} p.a.`}
                          .
                        </p>
                      </div>

                      {(() => {
                        const interestNotSubvented = Math.max(
                          0,
                          activeAudit.calc.totalBankInterest -
                            activeAudit.calc.upfrontMerchantDiscount,
                        );
                        const segments = [
                          {
                            label: 'Bank interest',
                            value: interestNotSubvented,
                            color: '#2563eb',
                          },
                          {
                            label: 'GST on interest',
                            value: activeAudit.calc.totalGstOnInterest,
                            color: '#f59e0b',
                          },
                          {
                            label: 'Processing fee + GST',
                            value:
                              activeAudit.calc.processingFeeBase +
                              activeAudit.calc.gstOnProcessingFee,
                            color: '#f43f5e',
                          },
                          {
                            label: 'Add-ons',
                            value: activeAudit.calc.sneakedAddOnsTotal,
                            color: '#38bdf8',
                          },
                        ].filter((segment) => segment.value > 0.5);
                        const total =
                          segments.reduce((sum, segment) => sum + segment.value, 0) || 0;

                        if (segments.length === 0) {
                          return (
                            <p className="self-center rounded-xl border border-blue-900/50 bg-blue-950/20 px-4 py-3 text-[11px] leading-relaxed text-blue-200/80">
                              Nothing is charged above the cash price on this plan.
                            </p>
                          );
                        }

                        const radius = 54;
                        const circumference = 2 * Math.PI * radius;
                        let offset = 0;

                        return (
                          <div className="flex flex-col items-center gap-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              Above the cash price
                            </p>
                            <svg
                              viewBox="0 0 140 140"
                              className="h-40 w-40"
                              role="img"
                              aria-label="Split of the amount charged above the cash price"
                            >
                              <circle
                                cx="70"
                                cy="70"
                                r={radius}
                                fill="none"
                                stroke="#0f1b2d"
                                strokeWidth="18"
                              />
                              {segments.map((segment) => {
                                const length = (segment.value / total) * circumference;
                                const dashOffset = -offset;
                                offset += length;
                                return (
                                  <circle
                                    key={segment.label}
                                    cx="70"
                                    cy="70"
                                    r={radius}
                                    fill="none"
                                    stroke={segment.color}
                                    strokeWidth="18"
                                    strokeDasharray={`${length} ${circumference - length}`}
                                    strokeDashoffset={dashOffset}
                                    transform="rotate(-90 70 70)"
                                  />
                                );
                              })}
                              <text
                                x="70"
                                y="68"
                                textAnchor="middle"
                                className="fill-slate-500"
                                style={{ fontSize: '7px', letterSpacing: '0.08em' }}
                              >
                                EXTRA
                              </text>
                              <text
                                x="70"
                                y="82"
                                textAnchor="middle"
                                className="fill-white"
                                style={{ fontSize: '10px', fontWeight: 700 }}
                              >
                                +{formatINR(total)}
                              </text>
                            </svg>

                            <ul className="w-full space-y-1.5">
                              {segments.map((segment) => {
                                const pct = (segment.value / total) * 100;
                                return (
                                  <li
                                    key={segment.label}
                                    className="flex items-center gap-2 text-[11px]"
                                  >
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-sm"
                                      style={{ backgroundColor: segment.color }}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-slate-400">
                                      {segment.label}
                                    </span>
                                    <span className="w-9 text-right tabular-nums text-slate-500">
                                      {pct < 1 ? pct.toFixed(1) : Math.round(pct)}%
                                    </span>
                                    <span className="w-16 text-right font-semibold tabular-nums text-white">
                                      {formatINR(segment.value)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })()}
                    </div>

                    {activeAudit.calc.warnings.length > 0 ? (
                      <div className="mt-4 space-y-1 border-t border-blue-950/60 pt-3">
                        {activeAudit.calc.warnings.slice(0, 3).map((warning) => (
                          <p
                            key={warning}
                            className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-slate-500"
                          >
                            <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-500/80" />
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  {/* 4 — payment scheme ------------------------------------- */}
                  <section className="overflow-hidden rounded-3xl border border-blue-950/60 bg-[#060b14]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-5">
                      <h2 className="text-sm font-semibold text-white">The EMI payment scheme</h2>
                      <p className="text-[10.5px] text-slate-500">
                        The instalment stays level; the GST on interest does not.
                      </p>
                    </div>
                    <div className="max-h-80 overflow-auto">
                      <table className="w-full min-w-[660px] text-left text-[11px]">
                        <thead className="sticky top-0 bg-[#050a13] text-[9.5px] uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Month</th>
                            <th className="px-3 py-2 font-semibold">Opening</th>
                            <th className="px-3 py-2 font-semibold">EMI</th>
                            <th className="px-3 py-2 font-semibold">Principal</th>
                            <th className="px-3 py-2 font-semibold">Interest</th>
                            <th className="px-3 py-2 font-semibold">GST on interest</th>
                            <th className="px-3 py-2 font-semibold">Outflow</th>
                            <th className="px-3 py-2 font-semibold">Closing</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-950/40 tabular-nums text-slate-300">
                          {activeAudit.calc.schedule.map((row) => (
                            <tr key={row.month} className="hover:bg-white/[0.02]">
                              <td className="px-4 py-1.5 font-semibold text-white">
                                {String(row.month).padStart(2, '0')}
                              </td>
                              <td className="px-3 py-1.5">{formatINR(row.openingBalance)}</td>
                              <td className="px-3 py-1.5">{formatINR(row.emiBase)}</td>
                              <td className="px-3 py-1.5">{formatINR(row.principalComponent)}</td>
                              <td className="px-3 py-1.5">{formatINR(row.interestComponent)}</td>
                              <td className="px-3 py-1.5 text-amber-300/90">
                                {formatINR(row.gstOnInterest)}
                              </td>
                              <td className="px-3 py-1.5 font-semibold text-white">
                                {formatINR(row.actualMonthlyOutflow)}
                              </td>
                              <td className="px-3 py-1.5">{formatINR(row.closingBalance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* 5 — trust rating, last -------------------------------- */}
                  <section className="rounded-3xl border border-blue-950/60 bg-[#060b14] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-sm font-semibold text-white">Trust rating</h2>
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                          Scored against the CCPA dark-pattern guidelines and the RBI disclosure
                          mandate. Higher is fairer to the shopper.
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-3xl font-bold tabular-nums ${
                            activeAudit.verdict.legalityScore < 60
                              ? 'text-rose-400'
                              : activeAudit.verdict.legalityScore < 85
                                ? 'text-amber-300'
                                : 'text-blue-400'
                          }`}
                        >
                          {activeAudit.verdict.legalityScore}
                          <span className="text-sm font-medium text-slate-500">/100</span>
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {activeAudit.verdict.verdictLabel}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#0f1b2d]">
                      <div
                        className={`h-full rounded-full ${
                          activeAudit.verdict.legalityScore < 60
                            ? 'bg-rose-500'
                            : activeAudit.verdict.legalityScore < 85
                              ? 'bg-amber-400'
                              : 'bg-blue-500'
                        }`}
                        style={{ width: `${activeAudit.verdict.legalityScore}%` }}
                      />
                    </div>

                    <p className="mt-4 text-[12.5px] leading-relaxed text-slate-300">
                      {activeAudit.verdict.headline}
                    </p>

                    {activeAudit.verdict.violations.length === 0 ? (
                      <p className="mt-4 rounded-xl border border-blue-900/60 bg-blue-950/30 px-3 py-2 text-xs text-blue-200">
                        No forbidden promotion pattern was found in this screenshot.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {activeAudit.verdict.violations.map((finding) => (
                          <article
                            key={finding.rule.ruleId}
                            className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="text-xs font-semibold leading-snug text-white">
                                {finding.rule.title}
                              </h3>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                  severityStyles[finding.rule.severity] ?? severityStyles.MEDIUM
                                }`}
                              >
                                {finding.rule.severity}
                              </span>
                            </div>
                            <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">
                              {finding.rule.statuteName}
                            </p>
                            <ul className="mt-1.5 space-y-1">
                              {finding.evidence.slice(0, 2).map((line) => (
                                <li
                                  key={line}
                                  className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400"
                                >
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                                  {line.replace(/^[\s•\-–]+/, '')}
                                </li>
                              ))}
                            </ul>
                          </article>
                        ))}
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-blue-950/60 pt-4">
                      <p className="max-w-md text-[10.5px] leading-relaxed text-slate-500">
                        A ready-to-file NCH 1915 complaint can be generated with the lender,
                        month-by-month APR proof and the exact statute behind each finding.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsDisputeOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                      >
                        <FileText size={14} /> Generate complaint dossier
                      </button>
                    </div>
                  </section>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* ---------------------------- drawer ---------------------------- */}
      {isMenuOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-blue-950/70 bg-[#070d18] shadow-2xl">
            <div className="flex items-start justify-between border-b border-blue-950/70 bg-[#050a13] px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-white">CheckMate control panel</h2>
                <p className="text-xs text-slate-400">
                  Custom EMI breakdown and the reference lender database
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-white"
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 border-b border-blue-950/70 bg-[#0a1322] p-2 text-xs font-semibold">
              {(
                [
                  { id: 'CUSTOM_EMI', label: 'Custom EMI breakdown', icon: Sliders },
                  { id: 'BANKS', label: 'Banks DB', icon: Building2 },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveMenuTab(tab.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-2 transition ${
                      activeMenuTab === tab.id
                        ? 'bg-[#070d18] text-blue-400 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon size={14} /> {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {activeMenuTab === 'CUSTOM_EMI' ? <CustomEmiPanel /> : null}

              {activeMenuTab === 'BANKS' ? (
                <>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Lender database ({bankProfiles.length})
                    </p>
                    <ul className="mt-2 max-h-60 space-y-1.5 overflow-y-auto pr-1">
                      {bankProfiles.map((bank) => (
                        <li
                          key={bank.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-blue-950/70 px-2.5 py-2 text-[11px]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-100">
                              {bank.displayName}
                            </span>
                            <span className="text-slate-400">
                              6M rate {formatPercent(resolveNominalRatePa(bank, 6), 2)} · GST on
                              interest {bank.gstOnMonthlyInterestPercent}%
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[#0a1322] px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                            {bank.isCustomUserAdded ? 'Custom' : 'Seed'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="mt-4 rounded-xl border border-blue-950/70 bg-[#050a13] p-3 text-[10.5px] leading-relaxed text-slate-400">
                    Lender rates, fees and GST treatment are managed centrally and can only be
                    added through the backend. This panel is read-only.
                  </p>
                </>
              ) : null}
              <div className="border-t border-blue-950/70 pt-4">
                <label
                  htmlFor="groq-key"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300"
                >
                  <KeyRound size={13} /> Optional Groq cloud-vision key
                </label>
                <input
                  id="groq-key"
                  type="password"
                  value={groqApiKey}
                  onChange={(event) => setGroqApiKey(event.target.value)}
                  onBlur={() => setStoredApiKey(groqApiKey)}
                  placeholder="gsk_… (leave blank for on-device OCR)"
                  className={`mt-1.5 ${inputClass}`}
                />
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
                  Scanning always works without a key: Tesseract.js runs locally. A{' '}
                  <span className="font-semibold">gsk_</span> key adds an open-weights
                  Llama-4-Scout pass via Groq, falling back to local OCR on any error.
                </p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {/* --------------------------- dispute modal --------------------------- */}
      <LightModal
        open={isDisputeOpen}
        onClose={() => setIsDisputeOpen(false)}
        title="NCH 1915 dispute dossier"
        subtitle="Auto-generated from the audit above. Review the facts, add your name, then copy or download it."
        footer={
          <>
            <ActionButton variant="outline" onClick={() => setIsDisputeOpen(false)}>
              Close
            </ActionButton>
            <ActionButton variant="outline" onClick={downloadDispute}>
              <FileText size={13} /> Download .txt
            </ActionButton>
            <ActionButton onClick={() => void copyDispute()}>
              {copiedDispute ? <Check size={13} /> : <Copy size={13} />}
              {copiedDispute ? 'Copied' : 'Copy to clipboard'}
            </ActionButton>
          </>
        }
      >
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Complainant name (optional)
          </span>
          <input
            value={complainantName}
            onChange={(event) => setComplainantName(event.target.value)}
            placeholder="Your full name, address, phone and email"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <textarea
          ref={disputeRef}
          readOnly
          value={disputeLetterText}
          className="mt-3 h-[46vh] w-full resize-none rounded-lg border border-blue-950/70 bg-[#050a13] p-3 font-mono text-[10.5px] leading-relaxed text-slate-100 outline-none"
        />
      </LightModal>
    </div>
  );
}

function ActionButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'outline';
  type?: 'button' | 'submit';
  className?: string;
}) {
  const { children, onClick, variant = 'primary', type = 'button', className = '' } = props;
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-500',
    outline: 'border border-blue-900/70 bg-[#070d18] text-slate-300 hover:bg-[#0a1322]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function LightModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const { open, onClose, title, subtitle, footer, children } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-4 w-full max-w-3xl rounded-2xl border border-blue-950/70 bg-[#070d18] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-blue-950/70 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-[#0a1322] hover:text-white"
          >
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-blue-950/70 bg-[#050a13] px-5 py-3">
          {footer}
        </footer>
      </div>
    </div>
  );
}

