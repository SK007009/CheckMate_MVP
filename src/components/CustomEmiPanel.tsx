import { useMemo, useState } from 'react';
import { CreditCard, Landmark } from 'lucide-react';

import type { BankEmiProfile } from '../data/bankPlansDb';
import { calculateEmiTruth } from '../lib/emiMathEngine';
import { formatINR, formatINRPrecise, formatPercent } from '../lib/format';

type CardKind = 'CREDIT' | 'DEBIT';

/**
 * Card-type assumptions for a hand-entered EMI. The rates themselves are always
 * the user's own input — only the fee and GST regime come from the card type,
 * because that is what actually differs between the two rails in India.
 */
const CARD_TERMS: Record<
  CardKind,
  { label: string; short: string; processingFeeINR: number; note: string }
> = {
  CREDIT: {
    label: 'Credit card EMI',
    short: 'Credit',
    processingFeeINR: 199,
    note: 'Credit-card EMI conversion: flat ₹199 processing fee, 18% GST on the fee and on every month’s interest, no reward points on the converted amount.',
  },
  DEBIT: {
    label: 'Debit card EMI',
    short: 'Debit',
    processingFeeINR: 99,
    note: 'Debit-card EMI: flat ₹99 processing fee, 18% GST on the fee and on monthly interest, and the amount stays blocked in your account for the full tenure.',
  },
};

function buildProfile(kind: CardKind, ratePa: number): BankEmiProfile {
  const terms = CARD_TERMS[kind];
  return {
    id: `custom-emi-${kind.toLowerCase()}`,
    displayName: terms.label,
    aliases: [],
    lenderType: 'CREDIT_CARD',
    processingFee: {
      type: 'FLAT',
      flatAmountINR: terms.processingFeeINR,
      percentageRate: 0,
      gstApplicableOnFee: true,
    },
    nominalInterestRatesPa: { 3: ratePa, 6: ratePa, 9: ratePa, 12: ratePa, 18: ratePa, 24: ratePa },
    gstOnMonthlyInterestPercent: 18,
    foreclosurePenaltyPercent: 3,
    rewardPointsBlockedOnEmi: true,
    hiddenClauses: [],
  };
}

const TENURE_CHIPS = [3, 6, 9, 12, 18, 24];

/**
 * "Custom EMI breakdown" — price any card EMI from four inputs instead of a
 * screenshot: principal, annual rate, tenure and card type. The engine is the
 * same one the scanner uses, so the numbers are directly comparable.
 */
export function CustomEmiPanel() {
  const [principal, setPrincipal] = useState('50000');
  const [ratePa, setRatePa] = useState('15');
  const [tenure, setTenure] = useState('6');
  const [kind, setKind] = useState<CardKind>('CREDIT');

  const inputs = useMemo(() => {
    const principalValue = Number.parseFloat(principal);
    const rateValue = Number.parseFloat(ratePa);
    const tenureValue = Number.parseInt(tenure, 10);
    return {
      principalValue,
      rateValue,
      tenureValue,
      valid:
        Number.isFinite(principalValue) &&
        principalValue > 0 &&
        Number.isFinite(rateValue) &&
        rateValue >= 0 &&
        rateValue <= 60 &&
        Number.isFinite(tenureValue) &&
        tenureValue > 0 &&
        tenureValue <= 60,
    };
  }, [principal, ratePa, tenure]);

  const result = useMemo(() => {
    if (!inputs.valid) return null;
    try {
      return calculateEmiTruth({
        listedProductPrice: inputs.principalValue,
        tenureMonths: inputs.tenureValue,
        isAdvertisedNoCostEmi: false,
        sneakedAddOnsTotal: 0,
        bankProfile: buildProfile(kind, inputs.rateValue),
        overrideNominalRatePa: inputs.rateValue,
      });
    } catch {
      return null;
    }
  }, [inputs, kind]);

  const feeTotal = result ? result.processingFeeBase + result.gstOnProcessingFee : 0;

  return (
    <div className="space-y-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Custom EMI breakdown
      </p>

      <div>
        <p className="text-[11px] font-semibold text-slate-300">Card type</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(Object.keys(CARD_TERMS) as CardKind[]).map((option) => {
            const Icon = option === 'CREDIT' ? CreditCard : Landmark;
            const active = kind === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                  active
                    ? 'border-blue-500 bg-blue-600/15 text-blue-200'
                    : 'border-blue-950/70 bg-[#070d18] text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={13} /> {CARD_TERMS[option].short}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-300">Principal amount</span>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-blue-900/70 bg-[#070d18] px-3 py-2 focus-within:border-blue-600">
          <span className="text-xs text-slate-400">₹</span>
          <input
            type="number"
            min={1}
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
            className="w-full bg-transparent text-sm tabular-nums text-white outline-none"
          />
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Interest rate (p.a.)</span>
          <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-blue-900/70 bg-[#070d18] px-3 py-2 focus-within:border-blue-600">
            <input
              type="number"
              min={0}
              max={60}
              step={0.01}
              value={ratePa}
              onChange={(event) => setRatePa(event.target.value)}
              className="w-full bg-transparent text-sm tabular-nums text-white outline-none"
            />
            <span className="shrink-0 text-xs text-slate-400">%</span>
          </div>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Tenure</span>
          <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-blue-900/70 bg-[#070d18] px-3 py-2 focus-within:border-blue-600">
            <input
              type="number"
              min={1}
              max={60}
              value={tenure}
              onChange={(event) => setTenure(event.target.value)}
              className="w-full bg-transparent text-sm tabular-nums text-white outline-none"
            />
            <span className="shrink-0 text-xs text-slate-400">mo</span>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TENURE_CHIPS.map((months) => (
          <button
            key={months}
            type="button"
            onClick={() => setTenure(String(months))}
            className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold transition ${
              Number.parseInt(tenure, 10) === months
                ? 'border-blue-500 bg-blue-600/15 text-blue-200'
                : 'border-blue-950/70 text-slate-400 hover:text-white'
            }`}
          >
            {months}m
          </button>
        ))}
      </div>

      {!result ? (
        <p className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          Enter a principal above zero, a rate between 0% and 60%, and a tenure of 1–60 months.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-900/60 bg-[#050a13] p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              What you repay in total
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white">
              {formatINR(result.totalPaidViaEmi)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {formatINR(result.hiddenExtraCostOverCash)} above the {formatINR(result.listedProductPrice)}{' '}
              cash price · true effective{' '}
              <span className="font-semibold text-blue-300">
                {formatPercent(result.trueEffectiveAprPercent)} APR
              </span>
            </p>
          </div>

          <dl className="divide-y divide-blue-950/60 overflow-hidden rounded-xl border border-blue-950/70">
            <Row label="Monthly EMI" value={formatINRPrecise(result.emiBase)} />
            <Row
              label="First month's actual debit"
              value={formatINRPrecise(result.firstMonthOutflow)}
              hint="EMI + GST on that month's interest"
            />
            <Row label="Total interest charged" value={formatINR(result.totalBankInterest)} />
            <Row
              label={`GST on interest (18%)`}
              value={formatINR(result.totalGstOnInterest)}
              hint="Never discounted, never part of the quoted EMI"
            />
            <Row
              label="Processing fee + GST"
              value={formatINR(feeTotal)}
              hint={`${formatINR(CARD_TERMS[kind].processingFeeINR)} fee + 18% GST`}
            />
            <Row label="Total cost of credit" value={formatINR(result.hiddenExtraCostOverCash)} emphasis />
          </dl>

          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Rate used" value={`${formatPercent(result.nominalRatePa)} p.a.`} />
            <MiniStat label="GST content" value={formatINR(result.totalGstBleed)} />
          </div>

          <p className="text-[10px] leading-relaxed text-slate-500">{CARD_TERMS[kind].note}</p>
        </div>
      )}
    </div>
  );
}

function Row(props: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  const { label, value, hint, emphasis } = props;
  return (
    <div className="flex items-start justify-between gap-3 bg-[#070d18] px-3 py-2">
      <span className="min-w-0">
        <span
          className={`block text-[11px] ${emphasis ? 'font-semibold text-white' : 'text-slate-300'}`}
        >
          {label}
        </span>
        {hint ? <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{hint}</span> : null}
      </span>
      <span
        className={`shrink-0 text-[11.5px] tabular-nums ${
          emphasis ? 'font-bold text-blue-300' : 'font-semibold text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div className="rounded-lg border border-blue-950/70 bg-[#050a13] px-2.5 py-2">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
