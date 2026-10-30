import type { ReactNode } from 'react';
import { AlertTriangle, BarChart3, Calculator, GitCompareArrows, Sigma } from 'lucide-react';
import type { BankEmiProfile } from '../data/bankPlansDb';
import type { EmiCalculationResult } from '../lib/emiMathEngine';
import type { PlanOption } from '../lib/planTypes';
import type { ExtractedScreenshotData } from '../services/visionScanner';
import { formatINR, formatINRPrecise, formatPercent } from '../lib/format';
import { Badge, Panel, StatTile } from './ui';

export interface TruthPanelProps {
  calc: EmiCalculationResult;
  extracted: ExtractedScreenshotData | null;
  activePlan: PlanOption | undefined;
  planAudits: Array<{ plan: PlanOption; result: EmiCalculationResult }>;
  comparison: Array<{ profile: BankEmiProfile; result: EmiCalculationResult }>;
  compareAll: boolean;
}

interface Segment {
  label: string;
  value: number;
  color: string;
  note: string;
}

export function TruthPanel({
  calc,
  extracted,
  activePlan,
  planAudits,
  comparison,
  compareAll,
}: TruthPanelProps) {
  const feeTotal = calc.processingFeeBase + calc.gstOnProcessingFee;
  const segments: Segment[] = [
    {
      label: 'Loan principal',
      value: calc.loanPrincipal,
      color: '#2ee6a8',
      note: 'Actually financed by the lender',
    },
    {
      label: 'Merchant discount covering interest',
      value: calc.upfrontMerchantDiscount,
      color: '#38bdf8',
      note: 'The "discount" that funds the 0% headline',
    },
    {
      label: '18% GST on monthly interest',
      value: calc.totalGstOnInterest,
      color: '#ff5c68',
      note: 'Never advertised, billed every month',
    },
    {
      label: 'Processing / convenience fee + GST',
      value: feeTotal,
      color: '#ffb020',
      note: 'Charged on top of the listed price',
    },
    {
      label: 'Sneaked add-ons',
      value: calc.sneakedAddOnsTotal,
      color: '#a78bfa',
      note: 'Pre-ticked insurance / warranty',
    },
  ].filter((segment) => segment.value > 0.5);

  const barTotal = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="AsliHisab — Financial Truth Engine"
        step="04"
        icon={<Calculator size={15} />}
        subtitle="Deterministic reducing-balance amortisation with 18% GST and a Newton-Raphson IRR solver. No language model touches these numbers."
        actions={<Badge tone="info">{calc.tenureMonths}-month audit</Badge>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-term-line bg-black/30 p-4">
            <div className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
              What the platform advertises
            </div>
            <div className="num mt-2 text-3xl font-bold text-term-text">
              {calc.isAdvertisedNoCostEmi ? '0% interest' : formatPercent(calc.nominalRatePa)}
            </div>
            <div className="mt-1 text-[11px] text-term-muted">
              {calc.isAdvertisedNoCostEmi ? '“No-Cost EMI”, zero down payment' : 'Interest-bearing EMI'}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="text-term-muted">
                Advertised EMI{' '}
                <span className="num font-semibold text-term-text">{formatINR(calc.emiBase)}</span>
              </span>
              <span className="text-term-muted">
                × {calc.tenureMonths} ={' '}
                <span className="num font-semibold text-term-text">{formatINR(calc.totalEmiBasePaid)}</span>
              </span>
            </div>
            {extracted?.detectedUiViolations.explicitAprShownOnScreen ? (
              <Badge tone="good" className="mt-3">
                APR disclosed on screen
              </Badge>
            ) : (
              <Badge tone="danger" className="mt-3">
                No APR disclosed
              </Badge>
            )}
          </div>

          <div className="rounded-xl border border-rose-500/35 bg-rose-500/5 p-4">
            <div className="text-[10px] font-semibold tracking-widest text-rose-200/80 uppercase">
              What the consumer actually pays
            </div>
            <div className="num mt-2 text-3xl font-bold text-rose-300">
              {formatPercent(calc.trueEffectiveAprPercent)}
            </div>
            <div className="mt-1 text-[11px] text-rose-200/80">
              True effective APR p.a. (all fees + GST, annualised)
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="text-rose-200/80">
                First outflow{' '}
                <span className="num font-semibold text-rose-200">
                  {formatINR(calc.firstMonthOutflow)}
                </span>
              </span>
              <span className="text-rose-200/80">
                Monthly IRR{' '}
                <span className="num font-semibold text-rose-200">
                  {formatPercent(calc.monthlyIrr * 100, 3)}
                </span>
              </span>
            </div>
            <Badge tone="danger" className="mt-3">
              Extra cash bleed {formatINR(calc.hiddenExtraCostOverCash)}
            </Badge>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatTile
            label="Total paid via EMI"
            value={formatINR(calc.totalPaidViaEmi)}
            hint={`vs cash price ${formatINR(calc.listedProductPrice)}`}
          />
          <StatTile
            label="GST bleed"
            value={formatINR(calc.totalGstBleed)}
            tone="danger"
            hint="18% on fee + 18% monthly on interest"
          />
          <StatTile
            label="Bank interest (discounted)"
            value={formatINR(calc.totalBankInterest)}
            hint={`Hidden by the ${formatINR(calc.upfrontMerchantDiscount)} upfront discount`}
          />
          <StatTile
            label="Upfront outflow"
            value={formatINR(calc.totalUpfrontFee)}
            tone="warn"
            hint={`Fee ${formatINR(calc.processingFeeBase)} + GST ${formatINR(calc.gstOnProcessingFee)}`}
          />
        </div>

        {activePlan && typeof activePlan.monthlyEmiShownINR === 'number' && activePlan.monthlyEmiShownINR > 0 ? (
          <p className="mt-3 rounded-lg border border-term-line bg-black/25 px-3 py-2 text-[10.5px] leading-relaxed text-term-muted">
            Screenshot instalment <span className="num text-term-text">{formatINR(activePlan.monthlyEmiShownINR)}</span>{' '}
            vs computed instalment <span className="num text-term-text">{formatINR(calc.emiBase)}</span> · variance{' '}
            <span className="num text-term-text">
              {calc.emiVarianceVsScreenshot !== undefined ? formatINRPrecise(calc.emiVarianceVsScreenshot) : '—'}
            </span>{' '}
            {activePlan.upfrontInterestDiscountShownINR
              ? `· website shows an upfront interest discount of ${formatINR(activePlan.upfrontInterestDiscountShownINR)}`
              : ''}
          </p>
        ) : null}

        {calc.warnings.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {calc.warnings.map((warning) => (
              <li
                key={warning}
                className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[10.5px] leading-relaxed text-amber-200"
              >
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel
        title="Where the Hidden Money Goes"
        icon={<BarChart3 size={15} />}
        subtitle={`Every rupee of the ${formatINR(barTotal)} that leaves your account for a ${formatINR(calc.listedProductPrice)} purchase.`}
      >
        <div className="flex h-7 w-full overflow-hidden rounded-lg border border-term-line">
          {segments.map((segment) => (
            <div
              key={segment.label}
              title={`${segment.label}: ${formatINR(segment.value)}`}
              style={{
                width: `${(segment.value / barTotal) * 100}%`,
                backgroundColor: segment.color,
              }}
              className="h-full min-w-[3px]"
            />
          ))}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-start gap-2 text-[11px]">
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <span>
                <span className="num font-semibold text-term-text">{formatINR(segment.value)}</span>{' '}
                <span className="text-term-muted">{segment.label}</span>
                <span className="block text-[10px] text-term-muted/80">{segment.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {compareAll && planAudits.length > 1 ? (
        <Panel
          title="Plan-vs-Plan Audit"
          icon={<GitCompareArrows size={15} />}
          subtitle="The exact same purchase priced under every plan found in the screenshot."
        >
          <ComparisonTable
            rows={planAudits.map(({ plan, result }) => ({
              key: plan.key,
              label: `${plan.lenderName} · ${plan.tenureMonths}M`,
              sublabel: `Advertised ${formatINR(plan.monthlyEmiShownINR)}/mo${plan.isMarkedNoCost ? ' · 0%' : ''}`,
              result,
              highlight: plan.key === activePlan?.key,
            }))}
          />
        </Panel>
      ) : null}

      <Panel
        title="Month-by-Month Amortization Schedule"
        icon={<Sigma size={15} />}
        subtitle="Opening balance, principal, the bank's interest, the 18% GST billed on that interest, and the actual statement outflow."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="text-[10px] tracking-widest text-term-muted uppercase">
                <Th>M</Th>
                <Th align="right">Opening</Th>
                <Th align="right">EMI</Th>
                <Th align="right">Principal</Th>
                <Th align="right">Bank interest</Th>
                <Th align="right">GST 18% on interest</Th>
                <Th align="right">Actual outflow</Th>
                <Th align="right">Closing</Th>
              </tr>
            </thead>
            <tbody className="num">
              {calc.schedule.map((row) => (
                <tr key={row.month} className="border-t border-term-line/70">
                  <Td className="text-term-muted">{String(row.month).padStart(2, '0')}</Td>
                  <Td align="right">{formatINR(row.openingBalance)}</Td>
                  <Td align="right">{formatINR(row.emiBase)}</Td>
                  <Td align="right" className="text-emerald-300">
                    {formatINR(row.principalComponent)}
                  </Td>
                  <Td align="right">{formatINR(row.interestComponent)}</Td>
                  <Td align="right" className="text-rose-300">
                    {formatINR(row.gstOnInterest)}
                  </Td>
                  <Td align="right" className="font-semibold text-amber-300">
                    {formatINR(row.actualMonthlyOutflow)}
                  </Td>
                  <Td align="right" className="text-term-muted">
                    {formatINR(row.closingBalance)}
                  </Td>
                </tr>
              ))}
              <tr className="border-t-2 border-term-line bg-black/30 font-semibold">
                <Td>Σ</Td>
                <Td align="right">—</Td>
                <Td align="right">{formatINR(calc.totalEmiBasePaid)}</Td>
                <Td align="right" className="text-emerald-300">{formatINR(calc.loanPrincipal)}</Td>
                <Td align="right">{formatINR(calc.totalBankInterest)}</Td>
                <Td align="right" className="text-rose-300">{formatINR(calc.totalGstOnInterest)}</Td>
                <Td align="right" className="text-amber-300">
                  {formatINR(calc.totalEmiBasePaid + calc.totalGstOnInterest)}
                </Td>
                <Td align="right">₹0</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed text-term-muted">
          The “Bank interest” column is the amount the merchant's upfront discount of{' '}
          <span className="num text-term-text">{formatINR(calc.upfrontMerchantDiscount)}</span> is meant to absorb — it
          is why the offer can be called “no cost”. The GST on that interest is{' '}
          <span className="num text-term-text">{formatINR(calc.totalGstOnInterest)}</span> and is charged to you on top,
          every single month.
        </p>
      </Panel>

      <Panel
        title="Multi-Bank Comparison Matrix"
        icon={<GitCompareArrows size={15} />}
        subtitle={`The same ${formatINR(calc.listedProductPrice)} purchase across every lender in the database, audited with that lender's own published terms.`}
      >
        <ComparisonTable
          rows={comparison.map(({ profile, result }) => ({
            key: profile.id,
            label: profile.displayName,
            sublabel: `${result.tenureMonths}M · ${formatPercent(result.nominalRatePa)} p.a.${
              profile.isCustomUserAdded ? ' · custom' : ''
            }`,
            result,
            highlight: profile.id === activePlan?.profile.id,
          }))}
        />
      </Panel>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return <th className={`pb-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td className={`py-1.5 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>{children}</td>
  );
}

function ComparisonTable({
  rows,
}: {
  rows: Array<{ key: string; label: string; sublabel: string; result: EmiCalculationResult; highlight: boolean }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="text-[10px] tracking-widest text-term-muted uppercase">
            <Th>Lender / plan</Th>
            <Th align="right">EMI/mo</Th>
            <Th align="right">Fee + GST</Th>
            <Th align="right">GST on interest</Th>
            <Th align="right">Total outflow</Th>
            <Th align="right">Extra over cash</Th>
            <Th align="right">True APR</Th>
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((row) => (
            <tr
              key={row.key}
              className={`border-t border-term-line/70 ${row.highlight ? 'bg-emerald-400/5' : ''}`}
            >
              <Td>
                <span className="block font-semibold text-term-text">{row.label}</span>
                <span className="block text-[10px] text-term-muted">{row.sublabel}</span>
              </Td>
              <Td align="right">{formatINR(row.result.emiBase)}</Td>
              <Td align="right">
                {formatINR(row.result.processingFeeBase + row.result.gstOnProcessingFee)}
              </Td>
              <Td align="right" className="text-rose-300">
                {formatINR(row.result.totalGstOnInterest)}
              </Td>
              <Td align="right">{formatINR(row.result.totalPaidViaEmi)}</Td>
              <Td align="right" className="font-semibold text-amber-300">
                {formatINR(row.result.hiddenExtraCostOverCash)}
              </Td>
              <Td align="right" className="font-semibold text-rose-300">
                {formatPercent(row.result.trueEffectiveAprPercent)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
