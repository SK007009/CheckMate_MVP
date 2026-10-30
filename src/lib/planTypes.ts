/** Shared view-model types for the CheckMate dashboard. */

import type { BankEmiProfile } from '../data/bankPlansDb';
import { computeProcessingFeeBase, getBankProfileById, resolveNominalRatePa } from '../data/bankPlansDb';
import type { ExtractedEmiOption, ExtractedScreenshotData } from '../services/visionScanner';

/** One selectable EMI plan, either from OCR or from a demo preset. */
export interface PlanOption {
  key: string;
  lenderName: string;
  tenureMonths: number;
  monthlyEmiShownINR: number;
  isMarkedNoCost: boolean;
  upfrontInterestDiscountShownINR?: number;
  nominalInterestRateShownPa?: number;
  processingFeeShownINR?: number;
  /** Resolved lender record used for the audit. */
  profile: BankEmiProfile;
  source: 'screenshot' | 'preset';
}

export interface AuditOverrides {
  listedPriceINR: number;
  tenureMonths: number;
  isAdvertisedNoCostEmi: boolean;
  processingFeeINR: number;
  nominalRatePa: number;
  sneakedAddOnsTotal: number;
  profileId: string;
}

export function planKey(option: ExtractedEmiOption, index: number): string {
  return `${option.bankOrLenderName}-${option.tenureMonths}-${index}`;
}

export function buildPlanOptions(
  extracted: ExtractedScreenshotData,
  resolveProfile: (lenderName: string) => BankEmiProfile,
  source: 'screenshot' | 'preset',
): PlanOption[] {
  return extracted.emiOptionsShown.map((option, index) => ({
    key: planKey(option, index),
    lenderName: option.bankOrLenderName,
    tenureMonths: option.tenureMonths,
    monthlyEmiShownINR: option.monthlyEmiShownINR,
    isMarkedNoCost: option.isMarkedNoCost,
    upfrontInterestDiscountShownINR: option.upfrontInterestDiscountShownINR,
    nominalInterestRateShownPa: option.nominalInterestRateShownPa,
    processingFeeShownINR: option.processingFeeShownINR,
    profile: resolveProfile(option.bankOrLenderName),
    source,
  }));
}

/**
 * Seeds the editable audit inputs for a plan.
 *
 * The rate and fee always start from the LENDER DATABASE (the bank's real
 * internal terms), never from the advertised "0%" — the whole point of the
 * audit is to price the offer from the lender's actual rules. What the
 * screenshot printed is kept separately for side-by-side comparison.
 */
export function overridesFromPlan(
  plan: PlanOption | undefined,
  extracted: ExtractedScreenshotData | null,
  fallbackPrice: number,
  fallbackAddOns: number,
): AuditOverrides {
  // Before any screenshot exists the audit runs on the HDFC profile, so the
  // panel shows a coherent, real lender rule instead of invented defaults.
  const profile = plan?.profile ?? getBankProfileById('hdfc-cc');
  const price = extracted?.listedProductPriceINR || fallbackPrice;
  const tenure = plan?.tenureMonths || 6;
  return {
    listedPriceINR: price,
    tenureMonths: tenure,
    isAdvertisedNoCostEmi: plan?.isMarkedNoCost ?? true,
    processingFeeINR: profile ? computeProcessingFeeBase(profile, price) : 299,
    nominalRatePa: profile ? resolveNominalRatePa(profile, tenure) : 16,
    sneakedAddOnsTotal: fallbackAddOns,
    profileId: profile?.id ?? 'hdfc-cc',
  };
}
