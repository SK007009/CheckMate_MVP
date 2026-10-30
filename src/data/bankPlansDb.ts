/**
 * CheckMate — Module 1
 * Extensible Bank & NBFC EMI Database
 *
 * Zero live scraping. This module is the single source of truth for *how* a
 * lender converts a purchase into an EMI: nominal reducing-balance rates per
 * tenure, processing / convenience fees, whether GST applies to fee and to the
 * monthly interest component, foreclosure penalties and the fine-print clauses
 * that lenders never put in the headline banner.
 *
 * Design: a strict interface + a registry. The bundled SEED profiles are
 * read-only; anything registered at runtime (UI modal, JSON import) is stored in
 * localStorage and shadowed over the seeds, so a new bank can be added without
 * touching the math engine or the compliance judge.
 */

export type LenderType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'NBFC_CARD';

/** Annual nominal rate (%) per tenure in months, e.g. { 6: 16.0, 12: 16.0 } */
export interface TenureRateMap {
  [tenureMonths: number]: number;
}

export interface ProcessingFeeRule {
  type: 'FLAT' | 'PERCENTAGE' | 'HIGHER_OF_BOTH';
  flatAmountINR: number;
  /** Used by PERCENTAGE and HIGHER_OF_BOTH, as a % of the financed amount. */
  percentageRate: number;
  minFeeINR?: number;
  maxFeeINR?: number;
  /** Credit-card and NBFC processing fees both attract 18% GST in India. */
  gstApplicableOnFee: boolean;
}

export interface BankEmiProfile {
  id: string;
  displayName: string;
  /** OCR / keyword matching tokens, e.g. ["hdfc", "hdfc bank", "millennia"]. */
  aliases: string[];
  lenderType: LenderType;
  processingFee: ProcessingFeeRule;
  /** Annual reducing-balance rate the lender uses internally to build the EMI. */
  nominalInterestRatesPa: TenureRateMap;
  /** 18 for credit cards. 0 for NBFC schemes (interest is GST-exempt). */
  gstOnMonthlyInterestPercent: number;
  foreclosurePenaltyPercent: number;
  rewardPointsBlockedOnEmi: boolean;
  hiddenClauses: string[];
  isCustomUserAdded?: boolean;
}

/** Statutory GST rate on processing / convenience / mandate fees. */
export const PROCESSING_FEE_GST_PERCENT = 18;

/**
 * Neutral profile used when no alias matches the OCR text. Never silently
 * assumes 0% — it assumes the market-standard credit-card terms so a wrong
 * match errs toward exposing more hidden cost, not less.
 */
export const GENERIC_FALLBACK_PROFILE: BankEmiProfile = {
  id: 'generic-unknown-lender',
  displayName: 'Unverified Lender (market-standard credit card)',
  aliases: [],
  lenderType: 'CREDIT_CARD',
  processingFee: {
    type: 'FLAT',
    flatAmountINR: 249,
    percentageRate: 0,
    gstApplicableOnFee: true,
  },
  nominalInterestRatesPa: { 3: 16.0, 6: 16.0, 9: 16.0, 12: 16.0, 18: 16.0, 24: 16.0 },
  gstOnMonthlyInterestPercent: 18,
  foreclosurePenaltyPercent: 3.0,
  rewardPointsBlockedOnEmi: true,
  hiddenClauses: [
    'Lender could not be identified in the screenshot — market-standard credit-card terms applied',
    '18% GST is billed monthly on the interest component of every instalment',
    '3% pre-closure penalty + 18% GST on the outstanding principal',
  ],
};

/* -------------------------------------------------------------------------- */
/* SEED DATABASE                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Processing fees observed on Amazon India's customer-facing "EMI Options" →
 * "Other EMIs" list ("Processing Fee of ₹X by Bank"). These are the bank-charged
 * fees that are NOT part of the advertised EMI; 18% GST is billed on top.
 *
 * Amazon publishes only the fee, not each bank's annual rate, so the rate here
 * is a market-reference ~16% p.a. credit-card rate. Any rate or fee printed in a
 * screenshot overrides these values at audit time, and the whole fee table can
 * be edited from the app's database screen.
 */
export const AMAZON_LISTED_PROCESSING_FEES_INR: Record<string, number> = {
  'amazon pay icici': 299,
  hdfc: 299,
  sbi: 169,
  axis: 599,
  icici: 299,
  rbl: 150,
  kotak: 249,
  'idfc first': 249,
  indusind: 249,
  bobcard: 199,
  'yes bank': 299,
  'american express': 199,
  onecard: 199,
  federal: 99,
  'au small finance': 199,
  'standard chartered': 770,
  hsbc: 99,
  dbs: 299,
  'jammu and kashmir': 99,
};

const AMAZON_FEE_CLAUSE =
  'Processing fee verified on Amazon India\u2019s "EMI Options" list; 18% GST is billed on top of it';
const MARKET_RATE_CLAUSE =
  'Rate is a market-reference ~16% p.a. credit-card rate \u2014 Amazon publishes only the fee; the EMI table\u2019s printed rate overrides this';

function amazonListedLender(config: {
  id: string;
  displayName: string;
  aliases: string[];
  feeINR: number;
  ratePa?: number;
  clauses: string[];
}): BankEmiProfile {
  const rate = config.ratePa ?? 16.0;
  return {
    id: config.id,
    displayName: config.displayName,
    aliases: config.aliases,
    lenderType: 'CREDIT_CARD',
    processingFee: {
      type: 'FLAT',
      flatAmountINR: config.feeINR,
      percentageRate: 0,
      gstApplicableOnFee: true,
    },
    nominalInterestRatesPa: { 3: rate, 6: rate, 9: rate, 12: rate, 18: rate, 24: rate },
    gstOnMonthlyInterestPercent: 18,
    foreclosurePenaltyPercent: 3.0,
    rewardPointsBlockedOnEmi: true,
    hiddenClauses: [...config.clauses, AMAZON_FEE_CLAUSE, MARKET_RATE_CLAUSE],
  };
}

const AMAZON_LISTED_LENDERS: BankEmiProfile[] = [
  amazonListedLender({
    id: 'rbl-cc',
    displayName: 'RBL Bank Credit Card EMI',
    aliases: ['rbl', 'rbl bank', 'rbl credit card'],
    feeINR: 150,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'kotak-cc',
    displayName: 'Kotak Mahindra Bank Credit Card EMI',
    aliases: ['kotak', 'kotak mahindra', 'kotak credit card'],
    feeINR: 249,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'idfc-first-cc',
    displayName: 'IDFC FIRST Bank Credit Card EMI',
    aliases: ['idfc', 'idfc first', 'idfc first bank'],
    feeINR: 249,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'indusind-cc',
    displayName: 'IndusInd Bank Credit Card EMI',
    aliases: ['indusind', 'indusind bank'],
    feeINR: 249,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'bobcard-cc',
    displayName: 'BOBCARD Credit Card EMI',
    aliases: ['bobcard', 'bob card', 'bank of baroda'],
    feeINR: 199,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'yes-bank-cc',
    displayName: 'Yes Bank Credit Card EMI',
    aliases: ['yes bank', 'yes bank credit card'],
    feeINR: 299,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'amex-cc',
    displayName: 'American Express Credit Card EMI',
    aliases: ['american express', 'amex'],
    feeINR: 199,
    clauses: ['Membership Rewards are not earned on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'onecard-cc',
    displayName: 'OneCard Credit Card EMI',
    aliases: ['onecard', 'one card'],
    feeINR: 199,
    clauses: ['Rewards are not earned on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'federal-cc',
    displayName: 'Federal Bank Credit Card EMI',
    aliases: ['federal bank', 'federal'],
    feeINR: 99,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'au-sfb-cc',
    displayName: 'AU Small Finance Bank Credit Card EMI',
    aliases: ['au small finance', 'au bank', 'au sfb'],
    feeINR: 199,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'scb-cc',
    displayName: 'Standard Chartered Bank Credit Card EMI',
    aliases: ['standard chartered', 'scb', 'stanchart'],
    feeINR: 770,
    clauses: [
      'Highest listed fee on the Amazon EMI list \u2014 a ₹770 charge on a small basket can dominate the instalment',
      'Reward points are not accrued on EMI conversions',
      '3% pre-closure + 18% GST',
    ],
  }),
  amazonListedLender({
    id: 'hsbc-cc',
    displayName: 'HSBC Bank Credit Card EMI',
    aliases: ['hsbc', 'hsbc bank'],
    feeINR: 99,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'dbs-cc',
    displayName: 'DBS Credit Card InstaEMI',
    aliases: ['dbs', 'dbs bank', 'dbs instaemi'],
    feeINR: 299,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
  amazonListedLender({
    id: 'jk-bank-cc',
    displayName: 'Jammu and Kashmir Bank Credit Card EMI',
    aliases: ['jammu and kashmir', 'j&k bank', 'jk bank'],
    feeINR: 99,
    clauses: ['Reward points are not accrued on EMI conversions', '3% pre-closure + 18% GST'],
  }),
];

export const SEED_BANK_PROFILES: BankEmiProfile[] = [
  {
    id: 'hdfc-cc',
    displayName: 'HDFC Bank Credit Card EMI',
    aliases: ['hdfc', 'hdfc bank', 'hdfc credit card', 'millennia', 'regalia', 'infinia'],
    lenderType: 'CREDIT_CARD',
    processingFee: {
      type: 'FLAT',
      flatAmountINR: 299,
      percentageRate: 0,
      gstApplicableOnFee: true,
    },
    nominalInterestRatesPa: { 3: 16.0, 6: 16.0, 9: 16.0, 12: 16.0, 18: 16.0, 24: 16.0 },
    gstOnMonthlyInterestPercent: 18,
    foreclosurePenaltyPercent: 3.0,
    rewardPointsBlockedOnEmi: true,
    hiddenClauses: [
      'No reward points earned on EMI conversions',
      '18% IGST/CGST+SGST billed monthly on the interest component in statement',
      '3% pre-closure penalty + 18% GST on outstanding principal',
    ],
  },
  {
    id: 'icici-cc',
    displayName: 'ICICI Bank Credit Card EMI',
    aliases: ['icici', 'icici bank', 'icici credit card', 'amazon pay icici', 'coral', 'rubyx'],
    lenderType: 'CREDIT_CARD',
    processingFee: {
      type: 'FLAT',
      flatAmountINR: 299,
      percentageRate: 0,
      gstApplicableOnFee: true,
    },
    nominalInterestRatesPa: { 3: 15.99, 6: 15.99, 9: 15.99, 12: 15.99, 18: 15.99, 24: 15.99 },
    gstOnMonthlyInterestPercent: 18,
    foreclosurePenaltyPercent: 3.0,
    rewardPointsBlockedOnEmi: true,
    hiddenClauses: [
      'Amazon Pay ICICI 5%/3% cashback is forfeited on EMI transactions',
      'First EMI interest is calculated from transaction booking date to statement generation date',
      '18% GST is charged monthly on the interest component of each instalment',
    ],
  },
  {
    id: 'bajaj-finserv',
    displayName: 'Bajaj Finserv Insta EMI Card',
    aliases: [
      'bajaj',
      'bajaj finserv',
      'bajaj finance',
      'insta emi',
      'insta emi card',
      'bajaj card',
    ],
    lenderType: 'NBFC_CARD',
    processingFee: {
      type: 'FLAT',
      flatAmountINR: 199,
      percentageRate: 0,
      minFeeINR: 117,
      maxFeeINR: 299,
      gstApplicableOnFee: true,
    },
    // Manufacturer-subvented 0% schemes: the cost is recovered through upfront
    // convenience fees, mandate registration and annual fees instead of interest.
    nominalInterestRatesPa: { 3: 0, 6: 0, 9: 14.0, 12: 15.0 },
    // NBFC interest is GST-exempt; only upfront fees and bounce charges attract GST.
    gstOnMonthlyInterestPercent: 0,
    foreclosurePenaltyPercent: 0,
    rewardPointsBlockedOnEmi: true,
    hiddenClauses: [
      'Upfront convenience fee + e-mandate registration charges apply even on INR 0 down-payment schemes',
      'Severe penal/bounce charges (INR 450 to INR 500) on NACH mandate failure',
      'Optional credit-shield or extended warranty insurance is frequently bundled unless explicitly opted out',
      'Annual membership fee (~INR 117 + GST) is levied even when no EMI is running',
    ],
  },
  {
    id: 'sbi-cc',
    displayName: 'SBI Card EMI',
    aliases: ['sbi', 'sbi card', 'state bank of india', 'simplyclick', 'sbi elite', 'sbi prime'],
    lenderType: 'CREDIT_CARD',
    processingFee: {
      type: 'FLAT',
      flatAmountINR: 169,
      percentageRate: 0,
      gstApplicableOnFee: true,
    },
    nominalInterestRatesPa: {
      3: 15.5,
      6: 15.5,
      9: 15.5,
      12: 15.5,
      18: 15.5,
      24: 15.5,
    },
    gstOnMonthlyInterestPercent: 18,
    foreclosurePenaltyPercent: 3.0,
    rewardPointsBlockedOnEmi: true,
    hiddenClauses: [
      'Reward points are not accrued on EMI conversions and existing points may be reversed',
      'Processing fee of INR 169 + 18% GST (Amazon-listed) is billed in the first statement',
      'GST at 18% is levied every month on the interest component of the EMI',
      'Pre-closure attracts 3% of the outstanding principal + 18% GST',
    ],
  },
  {
    id: 'axis-cc',
    displayName: 'Axis Bank Credit Card EMI',
    aliases: ['axis', 'axis bank', 'axis credit card', 'flipkart axis', 'magnus', 'ace'],
    lenderType: 'CREDIT_CARD',
    processingFee: {
      type: 'FLAT',
      flatAmountINR: 599,
      percentageRate: 0,
      gstApplicableOnFee: true,
    },
    nominalInterestRatesPa: { 3: 16.0, 6: 16.0, 9: 16.0, 12: 16.0, 18: 16.0, 24: 16.0 },
    gstOnMonthlyInterestPercent: 18,
    foreclosurePenaltyPercent: 3.0,
    rewardPointsBlockedOnEmi: true,
    hiddenClauses: [
      'EDGE reward points are not earned on EMI transactions',
      'Flipkart Axis cashback is not applicable on EMI conversions',
      '18% GST applies monthly on the interest component, regardless of the 0% headline rate',
      'Pre-closure fee of 3% of outstanding principal + 18% GST',
    ],
  },
  ...AMAZON_LISTED_LENDERS,
];

/* -------------------------------------------------------------------------- */
/* REGISTRY + PERSISTENCE                                                     */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = 'checkmate.custom-bank-profiles.v1';

let customProfiles: BankEmiProfile[] = [];
let hydrated = false;

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toPositiveNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Validates a profile object that came from a user, localStorage or JSON import.
 * Returns a list of human-readable errors; an empty array means valid.
 */
export function validateBankProfile(candidate: unknown): string[] {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return ['Profile must be a JSON object.'];
  }
  const profile = candidate as Partial<BankEmiProfile>;

  if (!profile.id || typeof profile.id !== 'string') {
    errors.push('id is required (e.g. "kotak-cc").');
  } else if (!/^[a-z0-9-]+$/.test(profile.id)) {
    errors.push('id may only contain lowercase letters, digits and hyphens.');
  }
  if (!profile.displayName || typeof profile.displayName !== 'string') {
    errors.push('displayName is required.');
  }
  if (
    profile.lenderType !== 'CREDIT_CARD' &&
    profile.lenderType !== 'DEBIT_CARD' &&
    profile.lenderType !== 'NBFC_CARD'
  ) {
    errors.push('lenderType must be CREDIT_CARD, DEBIT_CARD or NBFC_CARD.');
  }
  if (!Array.isArray(profile.aliases) || profile.aliases.length === 0) {
    errors.push('At least one OCR alias is required for screenshot matching.');
  }
  if (!profile.processingFee || typeof profile.processingFee !== 'object') {
    errors.push('processingFee rule is required.');
  } else {
    const fee = profile.processingFee;
    if (fee.type !== 'FLAT' && fee.type !== 'PERCENTAGE' && fee.type !== 'HIGHER_OF_BOTH') {
      errors.push('processingFee.type must be FLAT, PERCENTAGE or HIGHER_OF_BOTH.');
    }
    if (!Number.isFinite(Number(fee.flatAmountINR))) {
      errors.push('processingFee.flatAmountINR must be a number.');
    }
    if (Number(fee.percentageRate ?? 0) > 100) {
      errors.push('processingFee.percentageRate must be 0-100.');
    }
  }
  const rates = profile.nominalInterestRatesPa;
  if (!rates || typeof rates !== 'object' || Object.keys(rates).length === 0) {
    errors.push('nominalInterestRatesPa needs at least one tenure, e.g. { "6": 16.0 }.');
  } else {
    for (const [tenure, rate] of Object.entries(rates)) {
      if (!Number.isFinite(Number(tenure)) || Number(tenure) <= 0) {
        errors.push(`Tenure "${tenure}" must be a positive number of months.`);
      }
      if (!Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 60) {
        errors.push(`Rate for tenure ${tenure} must be between 0 and 60 % p.a.`);
      }
    }
  }
  const gst = Number(profile.gstOnMonthlyInterestPercent ?? 0);
  if (!Number.isFinite(gst) || gst < 0 || gst > 28) {
    errors.push('gstOnMonthlyInterestPercent must be between 0 and 28.');
  }
  const foreclosure = Number(profile.foreclosurePenaltyPercent ?? 0);
  if (!Number.isFinite(foreclosure) || foreclosure < 0 || foreclosure > 100) {
    errors.push('foreclosurePenaltyPercent must be between 0 and 100.');
  }
  if (!Array.isArray(profile.hiddenClauses)) {
    errors.push('hiddenClauses must be an array of strings.');
  }
  return errors;
}

function sanitizeProfile(input: BankEmiProfile): BankEmiProfile {
  const rates: TenureRateMap = {};
  for (const [tenure, rate] of Object.entries(input.nominalInterestRatesPa ?? {})) {
    const months = Math.round(toPositiveNumber(tenure));
    if (months > 0) {
      rates[months] = toPositiveNumber(rate);
    }
  }
  return {
    id: input.id.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    aliases: input.aliases.map((alias) => alias.trim()).filter(Boolean),
    lenderType: input.lenderType,
    processingFee: {
      type: input.processingFee.type,
      flatAmountINR: toPositiveNumber(input.processingFee.flatAmountINR),
      percentageRate: toPositiveNumber(input.processingFee.percentageRate),
      minFeeINR:
        input.processingFee.minFeeINR === undefined
          ? undefined
          : toPositiveNumber(input.processingFee.minFeeINR),
      maxFeeINR:
        input.processingFee.maxFeeINR === undefined
          ? undefined
          : toPositiveNumber(input.processingFee.maxFeeINR),
      gstApplicableOnFee: Boolean(input.processingFee.gstApplicableOnFee),
    },
    nominalInterestRatesPa: rates,
    gstOnMonthlyInterestPercent: toPositiveNumber(input.gstOnMonthlyInterestPercent),
    foreclosurePenaltyPercent: toPositiveNumber(input.foreclosurePenaltyPercent),
    rewardPointsBlockedOnEmi: Boolean(input.rewardPointsBlockedOnEmi),
    hiddenClauses: (input.hiddenClauses ?? []).map((clause) => clause.trim()).filter(Boolean),
    isCustomUserAdded: true,
  };
}

function persistCustomProfiles(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customProfiles));
  } catch {
    // Storage full or blocked (private mode) — the in-memory registry still works.
  }
}

function hydrateCustomProfiles(): void {
  if (hydrated) return;
  hydrated = true;
  if (!hasLocalStorage()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    customProfiles = parsed
      .filter((entry) => validateBankProfile(entry).length === 0)
      .map((entry) => sanitizeProfile(entry as BankEmiProfile));
  } catch {
    customProfiles = [];
  }
}

/* -------------------------------------------------------------------------- */
/* PUBLIC API                                                                 */
/* -------------------------------------------------------------------------- */

/** Every selectable profile: the seeds, then user-registered banks. */
export function getAllBankProfiles(): BankEmiProfile[] {
  hydrateCustomProfiles();
  return [...SEED_BANK_PROFILES, ...customProfiles];
}

export function getBankProfileById(id: string | undefined): BankEmiProfile | undefined {
  if (!id) return undefined;
  return getAllBankProfiles().find((profile) => profile.id === id);
}

/**
 * Matches free OCR text (bank names printed on a screenshot) to a profile.
 * Longest matching alias wins, so "amazon pay icici" beats a bare "icici".
 * Falls back to {@link GENERIC_FALLBACK_PROFILE} when nothing matches.
 */
export function getBankProfileByKeyword(text: string): BankEmiProfile {
  const haystack = normalizeToken(text ?? '');
  if (!haystack) return GENERIC_FALLBACK_PROFILE;

  let best: { profile: BankEmiProfile; score: number } | null = null;
  for (const profile of getAllBankProfiles()) {
    for (const alias of profile.aliases) {
      const needle = normalizeToken(alias);
      if (!needle) continue;
      const index = haystack.indexOf(needle);
      if (index === -1) continue;
      // Longer aliases are more specific; an early match is a stronger signal.
      const score = needle.length * 10 + (index === 0 ? 5 : 0) - Math.min(index, 4);
      if (!best || score > best.score) {
        best = { profile, score };
      }
    }
  }
  return best ? best.profile : GENERIC_FALLBACK_PROFILE;
}

/**
 * Registers (or replaces) a user-added lender profile and persists it to
 * localStorage. Throws when the profile is invalid so the UI can surface the
 * validation errors verbatim.
 */
export function registerNewBankProfile(profile: BankEmiProfile): void {
  const errors = validateBankProfile(profile);
  if (errors.length > 0) {
    throw new Error(`Invalid bank profile: ${errors.join(' ')}`);
  }
  hydrateCustomProfiles();
  const sanitized = sanitizeProfile(profile);
  const existingIndex = customProfiles.findIndex((entry) => entry.id === sanitized.id);
  if (existingIndex >= 0) {
    customProfiles = customProfiles.map((entry, index) =>
      index === existingIndex ? sanitized : entry,
    );
  } else {
    customProfiles = [...customProfiles, sanitized];
  }
  persistCustomProfiles();
}

/** Removes a user-added profile. Seed profiles can never be removed. */
export function removeCustomBankProfile(id: string): void {
  hydrateCustomProfiles();
  customProfiles = customProfiles.filter((entry) => entry.id !== id);
  persistCustomProfiles();
}

export function resetCustomBankProfiles(): void {
  customProfiles = [];
  persistCustomProfiles();
}

/** Imports profiles from a pasted JSON array (or `{ profiles: [...] }`). */
export function importBankProfilesFromJson(raw: string): {
  added: number;
  errors: string[];
} {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { added: 0, errors: [`Not valid JSON: ${(error as Error).message}`] };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { profiles?: unknown[] }).profiles)
      ? (parsed as { profiles: unknown[] }).profiles
      : null;

  if (!list) {
    return { added: 0, errors: ['Expected a JSON array of bank profiles.'] };
  }

  let added = 0;
  list.forEach((entry, index) => {
    const entryErrors = validateBankProfile(entry);
    if (entryErrors.length > 0) {
      errors.push(`Profile #${index + 1}: ${entryErrors.join(' ')}`);
      return;
    }
    try {
      registerNewBankProfile(entry as BankEmiProfile);
      added += 1;
    } catch (error) {
      errors.push(`Profile #${index + 1}: ${(error as Error).message}`);
    }
  });

  return { added, errors };
}

export function exportBankProfilesJson(): string {
  return JSON.stringify(
    getAllBankProfiles().map((profile) => ({ ...profile, isCustomUserAdded: undefined })),
    null,
    2,
  );
}

/* -------------------------------------------------------------------------- */
/* LOOKUPS USED BY THE MATH ENGINE                                            */
/* -------------------------------------------------------------------------- */

/**
 * Annual nominal rate for a tenure. Falls back to the closest available tenure
 * rather than 0%, so a missing bucket never flatters the lender.
 */
export function resolveNominalRatePa(profile: BankEmiProfile, tenureMonths: number): number {
  const rates = profile.nominalInterestRatesPa ?? {};
  const exact = rates[tenureMonths];
  if (typeof exact === 'number' && Number.isFinite(exact)) return exact;

  const tenures = Object.keys(rates)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (tenures.length === 0) return 16.0;

  const nearest = tenures.reduce((closest, candidate) =>
    Math.abs(candidate - tenureMonths) < Math.abs(closest - tenureMonths) ? candidate : closest,
  );
  return rates[nearest] ?? 16.0;
}

/** Nominal processing / convenience fee (excluding GST) for a financed amount. */
export function computeProcessingFeeBase(
  profile: BankEmiProfile,
  principalINR: number,
): number {
  const fee = profile.processingFee;
  let base: number;
  switch (fee.type) {
    case 'PERCENTAGE':
      base = (principalINR * fee.percentageRate) / 100;
      break;
    case 'HIGHER_OF_BOTH':
      base = Math.max(fee.flatAmountINR, (principalINR * fee.percentageRate) / 100);
      break;
    case 'FLAT':
    default:
      base = fee.flatAmountINR;
      break;
  }
  if (typeof fee.minFeeINR === 'number') base = Math.max(base, fee.minFeeINR);
  if (typeof fee.maxFeeINR === 'number') base = Math.min(base, fee.maxFeeINR);
  return Math.max(0, Math.round(base * 100) / 100);
}

export function listSupportedTenures(profile: BankEmiProfile): number[] {
  return Object.keys(profile.nominalInterestRatesPa ?? {})
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

export function describeProcessingFee(profile: BankEmiProfile): string {
  const fee = profile.processingFee;
  const gst = fee.gstApplicableOnFee ? ' + 18% GST' : '';
  switch (fee.type) {
    case 'PERCENTAGE':
      return `${fee.percentageRate}% of amount${gst}`;
    case 'HIGHER_OF_BOTH':
      return `Higher of ₹${fee.flatAmountINR} or ${fee.percentageRate}%${gst}`;
    case 'FLAT':
    default:
      return `₹${fee.flatAmountINR} flat${gst}`;
  }
}
