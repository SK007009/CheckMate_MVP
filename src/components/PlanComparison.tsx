/**
 * Multi-option comparison page.
 *
 * Shown when one screenshot carries several rates, tenures, instalments or
 * upfront discounts (an expanded "All EMI Plans" table, a bank-by-bank list, or
 * a page offering 3/6/9/12-month plans). Every option is priced with the same
 * deterministic engine, ranked by what actually leaves the wallet, and the
 * cheapest one is called out.
 */

import { ArrowUpRight, BadgeCheck, TrendingDown, TriangleAlert } from 'lucide-react';

import type { EmiCalculationResult } from '../lib/emiMathEngine';
import { formatINR, formatPercent } from '../lib/format';
import type { PlanOption } from '../lib/planTypes';

export interface ComparisonRow {
  index: number;
  plan: PlanOption;
  calc: EmiCalculationResult;
  rateSource: string;
  feeSource: string;
}

interface PlanComparisonProps {
  rows: ComparisonRow[];
  listedPrice: number;
  /** Manual price/fee overrides in the drawer that every row now reflects. */
  overrideNote?: string;
  onSelect: (index: number) => void;
}

export function PlanComparison({ rows, listedPrice, overrideNote, onSelect }: PlanComparisonProps) {
  const ranked = [...rows].sort((a, b) => a.calc.totalPaidViaEmi - b.calc.totalPaidViaEmi);
  if (ranked.length === 0) return null;

  const cheapest = ranked[0];
  const costliest = ranked[ranked.length - 1];
  const spread = costliest.calc.totalPaidViaEmi - cheapest.calc.totalPaidViaEmi;
  const cheapestApr = cheapest.calc.trueEffectiveAprPercent;
  const spreadSentence =
    spread < 1
      ? `The costliest option here (${costliest.plan.lenderName}, ${costliest.calc.tenureMonths}m) costs the same in total, so pick the shorter tenure to be debt-free sooner.`
      : `The costliest option here (${costliest.plan.lenderName}, ${costliest.calc.tenureMonths}m) costs ${formatINR(spread)} more for the same product.`;

  // A longer tenure can win on total cost while losing on instalment size, so
  // the two "best" answers are worth showing apart.
  const lowestInstalment = [...ranked].sort((a, b) => a.calc.emiBase - b.calc.emiBase)[0];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-blue-950/60 bg-[#060b14] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">
              {ranked.length} options found in this screenshot
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Every plan priced end to end
            </h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-slate-400">
              Same listed price of {formatINR(listedPrice)} for all {ranked.length} options, so the
              difference below is purely the lender's rate, tenure, fee and GST. Ranked by total paid.
            </p>
          </div>
          <div className="rounded-xl border border-blue-900/60 bg-blue-950/30 px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-300">
              <TrendingDown size={12} /> Most economical
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {cheapest.plan.lenderName} · {cheapest.calc.tenureMonths}m
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-blue-200">
              {formatINR(cheapest.calc.totalPaidViaEmi)} total ·{' '}
              {formatPercent(cheapestApr)} p.a.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Extra over cash price
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-white">
              {formatINR(Math.max(0, cheapest.calc.hiddenExtraCostOverCash))}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">Cheapest option, all charges in</p>
          </div>
          <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Saving vs costliest
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-white">{formatINR(spread)}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {spread < 1
                ? 'All options cost the same in total'
                : `${costliest.plan.lenderName} · ${costliest.calc.tenureMonths}m is the worst here`}
            </p>
          </div>
          <div className="rounded-xl border border-blue-950/60 bg-[#080f1b] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Smallest instalment
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-white">
              {formatINR(lowestInstalment.calc.emiBase)}/mo
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {lowestInstalment.plan.lenderName} · {lowestInstalment.calc.tenureMonths}m — not always
              the cheapest
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-blue-900/60 bg-[#080f1b] px-3.5 py-3 text-[11.5px] leading-relaxed text-slate-300">
          <span className="font-semibold text-white">Recommendation: </span>
          take {cheapest.plan.lenderName} for {cheapest.calc.tenureMonths} months — {formatINR(
            cheapest.calc.emiBase,
          )} a month, {formatINR(cheapest.calc.totalPaidViaEmi)} in total, which is{' '}
          {formatINR(Math.max(0, cheapest.calc.hiddenExtraCostOverCash))} above the cash price at{' '}
          {formatPercent(cheapestApr)} p.a. effective. {spreadSentence}
        </p>
        {overrideNote ? (
          <p className="mt-2 text-[10.5px] leading-relaxed text-amber-300">{overrideNote}</p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-blue-950/60 bg-[#060b14]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-blue-950/70 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Option</th>
                <th className="px-3 py-2.5 text-right font-semibold">Rate used</th>
                <th className="px-3 py-2.5 text-right font-semibold">Monthly EMI</th>
                <th className="px-3 py-2.5 text-right font-semibold">Fee + GST</th>
                <th className="px-3 py-2.5 text-right font-semibold">GST on interest</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total paid</th>
                <th className="px-3 py-2.5 text-right font-semibold">Extra over cash</th>
                <th className="px-3 py-2.5 text-right font-semibold">True APR</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, position) => {
                const isBest = position === 0;
                return (
                  <tr
                    key={row.plan.key}
                    className={`border-b border-blue-950/40 last:border-0 ${
                      isBest ? 'bg-blue-950/20' : 'hover:bg-[#080f1b]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-4 shrink-0 text-[10px] tabular-nums text-slate-600">
                          {position + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-white">
                            {row.plan.lenderName}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-500">
                            {row.calc.tenureMonths} months
                            {row.plan.isMarkedNoCost ? (
                              <span className="rounded-full bg-blue-950/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-300">
                                Advertised 0%
                              </span>
                            ) : null}
                            {isBest ? (
                              <span className="flex items-center gap-1 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-300">
                                <BadgeCheck size={9} /> Most economical
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="text-[12.5px] tabular-nums text-white">
                        {row.calc.nominalRatePa === 0 ? '0%' : formatPercent(row.calc.nominalRatePa)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{row.rateSource}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-[12.5px] tabular-nums text-white">
                      {formatINR(row.calc.emiBase)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="text-[12.5px] tabular-nums text-white">
                        {formatINR(row.calc.totalUpfrontFee)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {formatINR(row.calc.processingFeeBase)} +{' '}
                        {formatINR(row.calc.gstOnProcessingFee)} · {row.feeSource}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right text-[12.5px] tabular-nums text-white">
                      {formatINR(row.calc.totalGstOnInterest)}
                    </td>
                    <td className="px-3 py-3 text-right text-[12.5px] font-semibold tabular-nums text-white">
                      {formatINR(row.calc.totalPaidViaEmi)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right text-[12.5px] tabular-nums ${
                        row.calc.hiddenExtraCostOverCash <= 1 ? 'text-blue-300' : 'text-amber-300'
                      }`}
                    >
                      {formatINR(Math.max(0, row.calc.hiddenExtraCostOverCash))}
                    </td>
                    <td
                      className={`px-3 py-3 text-right text-[12.5px] font-semibold tabular-nums ${
                        isBest ? 'text-blue-300' : 'text-white'
                      }`}
                    >
                      {formatPercent(row.calc.trueEffectiveAprPercent)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelect(row.index)}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-950/70 px-2.5 py-1 text-[10.5px] font-semibold text-slate-400 transition hover:border-blue-700 hover:text-white"
                      >
                        Breakdown <ArrowUpRight size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex items-start gap-2 border-t border-blue-950/60 px-4 py-3 text-[10.5px] leading-relaxed text-slate-500">
          <TriangleAlert size={12} className="mt-0.5 shrink-0 text-amber-500" />
          Total paid = every instalment + the bank processing fee + 18% GST on that fee + 18% GST on
          each month's interest. A lower monthly EMI usually means a longer tenure and a higher total,
          so compare the last two columns, not the instalment.
        </p>
      </section>
    </div>
  );
}
