/**
 * CheckMate — Module 2
 * Deterministic EMI & True-APR Math Engine
 *
 * 100% pure TypeScript, zero LLM arithmetic. Every rupee and every basis point
 * here is computed from first principles:
 *
 *   1. Reducing-balance amortisation (interest on the opening balance each month)
 *   2. The bank's "no-cost" trick: it discounts the price upfront by the present
 *      value of the interest it will charge, so the consumer still repays
 *      principal + interest — and pays 18% GST on that interest every month.
 *   3. GST on the processing/convenience fee, sneaked add-ons, mandate charges.
 *   4. True effective APR from the consumer's cash-flow perspective, solved with
 *      50 Newton-Raphson iterations on the monthly IRR (bisection fallback).
 */

import type { BankEmiProfile } from '../data/bankPlansDb';
import { computeProcessingFeeBase } from '../data/bankPlansDb';

export interface EmiCalculationInput {
  /** Price the shopper sees on the product/checkout page, INR. */
  listedProductPrice: number;
  /** EMI tenure in months, e.g. 6. */
  tenureMonths: number;
  /** True when the offer is marketed as "No-Cost / 0% Interest EMI". */
  isAdvertisedNoCostEmi: boolean;
  /** Upfront merchant interest discount shown on the screenshot, if any. */
  extractedUpfrontDiscount?: number;
  /** Monthly instalment shown on the screenshot, if any. */
  extractedMonthlyEmi?: number;
  /** Unwanted insurance / packaging / coverage fees injected into the cart. */
  sneakedAddOnsTotal: number;
  bankProfile: BankEmiProfile;
  /** Manual override for the processing / convenience fee (ex-GST). */
  overrideProcessingFeeINR?: number;
  /** Manual override for the annual nominal reducing-balance rate. */
  overrideNominalRatePa?: number;
}

export interface AmortizationRow {
  month: number;
  openingBalance: number;
  interestComponent: number;
  principalComponent: number;
  /** 18% (or profile-specific) GST billed on the interest of this instalment. */
  gstOnInterest: number;
  /** EMI before GST — the number the bank advertises. */
  emiBase: number;
  /** What actually leaves the card/account this month. */
  actualMonthlyOutflow: number;
  closingBalance: number;
}

export interface EmiCalculationResult {
  tenureMonths: number;
  listedProductPrice: number;
  isAdvertisedNoCostEmi: boolean;
  nominalRatePa: number;
  monthlyRate: number;

  /** Principal the lender actually books after the merchant discount. */
  loanPrincipal: number;
  /** Upfront merchant discount that pays for the "0% interest" claim. */
  upfrontMerchantDiscount: number;
  /** Advertised instalment (before GST on interest). */
  emiBase: number;
  /** Instalment + first month's GST on interest = what the statement shows. */
  firstMonthOutflow: number;
  /** Instalment shown on the screenshot, when OCR found one. */
  extractedMonthlyEmi?: number;
  /** Difference between the screenshot instalment and our computed instalment. */
  emiVarianceVsScreenshot?: number;

  schedule: AmortizationRow[];

  processingFeeBase: number;
  gstOnProcessingFee: number;
  sneakedAddOnsTotal: number;
  totalUpfrontFee: number;

  totalEmiBasePaid: number;
  totalBankInterest: number;
  totalGstOnInterest: number;
  /** Every rupee that leaves the consumer: upfront fees + all instalments. */
  totalPaidViaEmi: number;
  /** The headline number: what this "0% offer" costs above the cash price. */
  hiddenExtraCostOverCash: number;
  /** Total GST extracted by the government out of this EMI (fee + interest GST). */
  totalGstBleed: number;

  monthlyIrr: number;
  trueEffectiveAprPercent: number;

  isGenuinelyZeroCost: boolean;
  warnings: string[];
}

const MONTHLY_IRR_ITERATIONS = 50;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Preset-independent annuity helpers.
 */
export function presentValueOfAnnuity(instalment: number, monthlyRate: number, months: number): number {
  if (monthlyRate <= 0) return instalment * months;
  return instalment * ((1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate);
}

export function equatedMonthlyInstalment(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (monthlyRate <= 0) return principal / months;
  const growth = Math.pow(1 + monthlyRate, months);
  return (principal * ((monthlyRate * growth) / (growth - 1)));
}

/**
 * Solves the monthly reducing-balance rate implied by a principal and a level
 * instalment. Returns 0 when the payments do not amortise more than the
 * principal (i.e. the implied rate is zero or negative).
 */
export function solveMonthlyRate(principal: number, payment: number, months: number): number {
  if (!(principal > 0) || !(payment > 0) || !(months > 0)) return 0;
  const presentValue = (rate: number): number =>
    rate <= 0 ? payment * months : payment * ((1 - Math.pow(1 + rate, -months)) / rate);

  // At 0% the consumer would repay payment × months. If that is not more than
  // the principal, there is no positive interest rate to solve for.
  if (presentValue(0) <= principal + 0.01) return 0;

  let low = 0;
  let high = 1; // 100% per month is far beyond any retail EMI scheme
  let guard = 0;
  while (presentValue(high) > principal && high < 10 && guard < 60) {
    high *= 2;
    guard += 1;
  }
  if (presentValue(high) > principal) return 0;

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > principal) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Derives the annual nominal rate from the upfront interest discount printed on
 * a "No-Cost EMI" page. The bank books (price − discount) and charges the
 * advertised price / tenure as the instalment; the rate that equates those two
 * is the lender's real internal rate.
 */
export function deriveNominalRateFromDiscount(
  listedProductPrice: number,
  upfrontDiscount: number,
  months: number,
): number {
  if (!(listedProductPrice > 0) || !(upfrontDiscount > 0) || !(months > 0)) return 0;
  const principal = listedProductPrice - upfrontDiscount;
  if (principal <= 0) return 0;
  const emi = listedProductPrice / months;
  const monthlyRate = solveMonthlyRate(principal, emi, months);
  const annual = monthlyRate * 12 * 100;
  return Number.isFinite(annual) && annual > 0 && annual <= 80 ? round2(annual) : 0;
}

/**
 * Derives the annual nominal rate from the monthly EMI printed on a standard
 * interest-bearing plan. This lets the screenshot's own instalment drive the
 * audit instead of a seeded lender rate.
 */
export function deriveNominalRateFromEmi(
  principal: number,
  monthlyEmi: number,
  months: number,
): number {
  if (!(principal > 0) || !(monthlyEmi > 0) || !(months > 0)) return 0;
  const monthlyRate = solveMonthlyRate(principal, monthlyEmi, months);
  const annual = monthlyRate * 12 * 100;
  return Number.isFinite(annual) && annual > 0 && annual <= 80 ? round2(annual) : 0;
}

/**
 * Monthly internal rate of return for the consumer's cash flows.
 * cashflows[i] is the outflow at the end of month (i + 1); cf0 is the net value
 * received at t = 0 (fair cash price of the goods minus upfront charges paid).
 *
 * f(i) = cf0 - Σ cashflows[t] / (1 + i)^t , solved with 50 Newton-Raphson steps
 * and a bracketed bisection fallback if the iteration leaves the valid domain.
 */
export function solveMonthlyIrr(cf0: number, cashflows: number[], initialGuess = 0.01): number {
  if (cf0 <= 0 || cashflows.length === 0) return 0;
  const totalOutflow = cashflows.reduce((sum, value) => sum + value, 0);
  if (totalOutflow <= cf0) return 0;

  const npv = (rate: number): number => {
    let discounted = 0;
    for (let index = 0; index < cashflows.length; index += 1) {
      discounted += cashflows[index] / Math.pow(1 + rate, index + 1);
    }
    return cf0 - discounted;
  };

  const derivative = (rate: number): number => {
    let value = 0;
    for (let index = 0; index < cashflows.length; index += 1) {
      value += ((index + 1) * cashflows[index]) / Math.pow(1 + rate, index + 2);
    }
    return value;
  };

  let rate = Math.min(Math.max(initialGuess, 0), 1);
  let converged = false;

  for (let iteration = 0; iteration < MONTHLY_IRR_ITERATIONS; iteration += 1) {
    const f = npv(rate);
    if (!Number.isFinite(f)) break;
    if (Math.abs(f) < 1e-7) {
      converged = true;
      break;
    }
    const slope = derivative(rate);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) break;
    const next = rate - f / slope;
    if (!Number.isFinite(next) || next <= -0.9999 || next > 10) break;
    if (Math.abs(next - rate) < 1e-10) {
      rate = next;
      converged = true;
      break;
    }
    rate = next;
  }

  if (!converged) {
    // Bisection: npv is monotonically decreasing in the rate, so a bracket exists.
    let low = -0.9999;
    let high = 10;
    let fLow = npv(low);
    let fHigh = npv(high);
    if (Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0) {
      for (let iteration = 0; iteration < 200; iteration += 1) {
        const mid = (low + high) / 2;
        const fMid = npv(mid);
        if (Math.abs(fMid) < 1e-9) {
          low = mid;
          high = mid;
          break;
        }
        if (fLow * fMid < 0) {
          high = mid;
          fHigh = fMid;
        } else {
          low = mid;
          fLow = fMid;
        }
      }
      rate = (low + high) / 2;
    }
  }

  return rate;
}

/** Converts a monthly IRR into the annualised effective percentage rate. */
export function annualiseMonthlyRate(monthlyRate: number): number {
  return (Math.pow(1 + monthlyRate, 12) - 1) * 100;
}

/**
 * The engine. Throws only on structurally impossible input (no price / no tenure).
 */
export function calculateEmiTruth(input: EmiCalculationInput): EmiCalculationResult {
  const warnings: string[] = [];
  const listedProductPrice = Math.max(0, input.listedProductPrice);
  const tenureMonths = Math.round(input.tenureMonths);

  if (listedProductPrice <= 0) {
    throw new Error('Listed product price must be greater than zero.');
  }
  if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) {
    throw new Error('EMI tenure must be a positive number of months.');
  }

  const profile = input.bankProfile;
  const banner = Array.isArray(input.bankProfile.aliases) ? input.bankProfile : undefined;
  if (!banner) {
    warnings.push('Lender profile looks malformed — results use the seeded fallback assumptions.');
  }
  if (profile.id === 'generic-unknown-lender') {
    warnings.push(
      'No lender in the database matched this screenshot; market-standard credit-card terms are applied.',
    );
  }

  /* 1. Rate resolution ---------------------------------------------------- */
  const nominalRatePa =
    typeof input.overrideNominalRatePa === 'number' && Number.isFinite(input.overrideNominalRatePa)
      ? Math.max(0, input.overrideNominalRatePa)
      : resolveRate(profile, tenureMonths);
  const monthlyRate = nominalRatePa / (12 * 100);

  /* 2. Principal, merchant discount and advertised instalment ------------- */
  let loanPrincipal: number;
  let upfrontMerchantDiscount = 0;
  let emiBase: number;

  if (input.isAdvertisedNoCostEmi && monthlyRate > 0) {
    emiBase = listedProductPrice / tenureMonths;
    loanPrincipal = presentValueOfAnnuity(emiBase, monthlyRate, tenureMonths);
    upfrontMerchantDiscount = listedProductPrice - loanPrincipal;
  } else if (input.isAdvertisedNoCostEmi && monthlyRate === 0) {
    loanPrincipal = listedProductPrice;
    upfrontMerchantDiscount = 0;
    emiBase = listedProductPrice / tenureMonths;
  } else {
    loanPrincipal = listedProductPrice;
    upfrontMerchantDiscount = 0;
    emiBase = equatedMonthlyInstalment(loanPrincipal, monthlyRate, tenureMonths);
  }

  if (typeof input.extractedUpfrontDiscount === 'number' && input.extractedUpfrontDiscount > 0) {
    const drift = Math.abs(input.extractedUpfrontDiscount - upfrontMerchantDiscount);
    if (drift > Math.max(50, upfrontMerchantDiscount * 0.05)) {
      warnings.push(
        `Screenshot shows an upfront interest discount of ₹${round2(input.extractedUpfrontDiscount)} but the reducing-balance model computes ₹${round2(upfrontMerchantDiscount)} for this tenure — verify the tenure and rate.`,
      );
    }
  }

  /* 3. Amortisation ------------------------------------------------------ */
  const gstOnInterestPercent = profile.gstOnMonthlyInterestPercent ?? 0;
  const schedule: AmortizationRow[] = [];
  let openingBalance = loanPrincipal;
  let totalBankInterest = 0;
  let totalGstOnInterest = 0;

  for (let month = 1; month <= tenureMonths; month += 1) {
    const interestComponent = openingBalance * monthlyRate;
    let principalComponent = emiBase - interestComponent;
    // Final instalment absorbs rounding/float drift so the schedule closes at 0.
    if (month === tenureMonths) principalComponent = openingBalance;
    const gstOnInterest = (interestComponent * gstOnInterestPercent) / 100;
    const closingBalance = Math.max(0, openingBalance - principalComponent);

    totalBankInterest += interestComponent;
    totalGstOnInterest += gstOnInterest;

    schedule.push({
      month,
      openingBalance: round2(openingBalance),
      interestComponent: round2(interestComponent),
      principalComponent: round2(principalComponent),
      gstOnInterest: round2(gstOnInterest),
      emiBase: round2(emiBase),
      actualMonthlyOutflow: round2(emiBase + gstOnInterest),
      closingBalance: round2(closingBalance),
    });

    openingBalance = closingBalance;
  }

  /* 4. Upfront outflows -------------------------------------------------- */
  const processingFeeBase =
    typeof input.overrideProcessingFeeINR === 'number' && Number.isFinite(input.overrideProcessingFeeINR)
      ? Math.max(0, input.overrideProcessingFeeINR)
      : computeProcessingFeeBase(profile, loanPrincipal);
  const gstOnProcessingFee = profile.processingFee.gstApplicableOnFee
    ? (processingFeeBase * 18) / 100
    : 0;
  const sneakedAddOnsTotal = Math.max(0, input.sneakedAddOnsTotal);
  const totalUpfrontFee = processingFeeBase + gstOnProcessingFee + sneakedAddOnsTotal;

  /* 5. True effective APR (Newton-Raphson IRR) --------------------------- */
  const cashflows = schedule.map((row) => row.actualMonthlyOutflow);
  const netValueAtT0 = listedProductPrice - totalUpfrontFee;
  const monthlyIrr = solveMonthlyIrr(netValueAtT0, cashflows, monthlyRate > 0 ? monthlyRate : 0.01);
  const trueEffectiveAprPercent = annualiseMonthlyRate(monthlyIrr);

  const totalEmiBasePaid = emiBase * tenureMonths;
  const totalPaidViaEmi = totalUpfrontFee + totalEmiBasePaid + totalGstOnInterest;
  const hiddenExtraCostOverCash = totalPaidViaEmi - listedProductPrice;
  const totalGstBleed = gstOnProcessingFee + totalGstOnInterest;
  const isGenuinelyZeroCost = Math.abs(hiddenExtraCostOverCash) < 1 && trueEffectiveAprPercent < 0.05;

  if (input.isAdvertisedNoCostEmi && trueEffectiveAprPercent > 1) {
    warnings.push(
      `Marketed as No-Cost EMI, but the all-inclusive effective APR is ${trueEffectiveAprPercent.toFixed(2)}% p.a.`,
    );
  }
  if (gstOnInterestPercent === 0 && profile.lenderType !== 'NBFC_CARD') {
    warnings.push('GST on the interest component is set to 0 for a card profile — verify with the issuer.');
  }

  return {
    tenureMonths,
    listedProductPrice: round2(listedProductPrice),
    isAdvertisedNoCostEmi: input.isAdvertisedNoCostEmi,
    nominalRatePa,
    monthlyRate,
    loanPrincipal: round2(loanPrincipal),
    upfrontMerchantDiscount: round2(upfrontMerchantDiscount),
    emiBase: round2(emiBase),
    firstMonthOutflow: round2(emiBase + (schedule[0]?.gstOnInterest ?? 0)),
    extractedMonthlyEmi: input.extractedMonthlyEmi,
    emiVarianceVsScreenshot:
      typeof input.extractedMonthlyEmi === 'number'
        ? round2(emiBase - input.extractedMonthlyEmi)
        : undefined,
    processingFeeBase: round2(processingFeeBase),
    gstOnProcessingFee: round2(gstOnProcessingFee),
    sneakedAddOnsTotal: round2(sneakedAddOnsTotal),
    totalUpfrontFee: round2(totalUpfrontFee),
    totalEmiBasePaid: round2(totalEmiBasePaid),
    totalBankInterest: round2(totalBankInterest),
    totalGstOnInterest: round2(totalGstOnInterest),
    totalPaidViaEmi: round2(totalPaidViaEmi),
    hiddenExtraCostOverCash: round2(hiddenExtraCostOverCash),
    totalGstBleed: round2(totalGstBleed),
    schedule,
    monthlyIrr,
    trueEffectiveAprPercent,
    isGenuinelyZeroCost,
    warnings,
  };
}

function resolveRate(profile: BankEmiProfile, tenureMonths: number): number {
  const exact = profile.nominalInterestRatesPa[tenureMonths];
  if (typeof exact === 'number' && Number.isFinite(exact)) return exact;
  const tenures = Object.keys(profile.nominalInterestRatesPa)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (tenures.length === 0) return 16.0;
  const nearest = tenures.reduce((closest, candidate) =>
    Math.abs(candidate - tenureMonths) < Math.abs(closest - tenureMonths) ? candidate : closest,
  );
  return profile.nominalInterestRatesPa[nearest] ?? 16.0;
}

/** Convenience comparison across lenders for the same product. */
export function compareLendersAcrossProfiles(
  profiles: BankEmiProfile[],
  base: Omit<EmiCalculationInput, 'bankProfile'>,
): Array<{ profile: BankEmiProfile; result: EmiCalculationResult }> {
  return profiles.map((profile) => ({
    profile,
    result: calculateEmiTruth({ ...base, bankProfile: profile }),
  }));
}
