/**
 * CheckMate — Module 5
 * Open-source visual pipeline.
 *
 * Engine 1 (default, zero API key): Tesseract.js WebAssembly OCR runs entirely
 * in the browser, then a deterministic Indian FinTech regex parser turns the raw
 * text into {@link ExtractedScreenshotData}. No image ever leaves the device.
 *
 * Engine 2 (optional): Meta Llama-4-Scout-17B (open weights) through Groq's
 * OpenAI-compatible REST endpoint via plain `fetch()`. Used only when the user
 * supplies a Groq key; any failure falls back to local OCR.
 *
 * Either way the model/OCR only *extracts*. EMI, GST and APR arithmetic always
 * comes from the deterministic engine in `src/lib/emiMathEngine.ts`.
 */

import { createWorker } from 'tesseract.js';
import {
  GENERIC_FALLBACK_PROFILE,
  getBankProfileByKeyword,
  getBankProfileById,
} from '../data/bankPlansDb';
import {
  buildBajajCheckoutMock,
  buildFlightCheckoutMock,
  buildMarketplaceEmiMock,
} from './mockScreenshots';

export interface ExtractedEmiOption {
  bankOrLenderName: string;
  tenureMonths: number;
  monthlyEmiShownINR: number;
  isMarkedNoCost: boolean;
  upfrontInterestDiscountShownINR?: number;
  nominalInterestRateShownPa?: number;
  processingFeeShownINR?: number;
}

export interface DetectedUiViolations {
  dripFeesFound: Array<{ label: string; amountINR: number }>;
  preTickedAddonsFound: Array<{ label: string; amountINR: number }>;
  hasFalseUrgencyTimer: boolean;
  urgencyTextFound?: string;
  hasConfirmShaming: boolean;
  confirmShamingTextFound?: string;
  isGstAndAprHiddenInFinePrint: boolean;
  explicitAprShownOnScreen: boolean;
}

/** A lender row from an EMI list, even when no price/instalment accompanies it. */
export interface DetectedLenderFee {
  lenderName: string;
  processingFeeINR?: number;
  /** Rates printed in that lender's expanded tenure table. */
  ratesShownPa: number[];
  tenuresShown: number[];
}

export interface ExtractedScreenshotData {
  productName: string;
  platformName: string;
  listedProductPriceINR: number;
  emiOptionsShown: ExtractedEmiOption[];
  /** Every lender row read from the page's EMI list, with its own bank fee. */
  detectedLenderFees?: DetectedLenderFee[];
  detectedUiViolations: DetectedUiViolations;
  rawFinePrintTextExtracted: string[];
  scannerEngineUsed?: string;
}

export interface DemoPreset {
  id: string;
  title: string;
  subtitle: string;
  /** What this preset is designed to expose. */
  reveals: string[];
  mockScreenshotDataUrl: string;
  extracted: ExtractedScreenshotData;
  /** Lender used when the user clicks this preset. */
  recommendedLenderKeyword: string;
  sneakedAddOnsTotal: number;
}

export const LOCAL_OCR_ENGINE_LABEL = 'Tesseract.js Local WASM OCR (open-source, zero API key)';
export const CLOUD_VISION_MODEL_ID = 'meta-llama/llama-4-scout-17b-16e-instruct';

const API_KEY_STORAGE = 'checkmate.groq-api-key.v1';

/* -------------------------------------------------------------------------- */
/* OPTIONAL CLOUD KEY STORE                                                   */
/* -------------------------------------------------------------------------- */

export function getStoredApiKey(): string {
  try {
    return window.localStorage.getItem(API_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setStoredApiKey(apiKey: string): void {
  try {
    const trimmed = apiKey.trim();
    if (trimmed) {
      window.localStorage.setItem(API_KEY_STORAGE, trimmed);
    } else {
      window.localStorage.removeItem(API_KEY_STORAGE);
    }
  } catch {
    // Storage blocked (private mode) — scanning still works for the session.
  }
}

/* -------------------------------------------------------------------------- */
/* ENGINE 1: LOCAL TESSERACT.JS WASM OCR                                      */
/* -------------------------------------------------------------------------- */

/**
 * Checkout screenshots are often small; Tesseract drops digits on 10–12px type.
 * Upscaling the bitmap before OCR materially improves price/EMI accuracy.
 */
async function upscaleForOcr(imageFile: File): Promise<File | HTMLCanvasElement> {
  try {
    const bitmap = await createImageBitmap(imageFile);
    const scale = Math.min(3, Math.max(1, 1800 / bitmap.width));
    if (scale <= 1.05) {
      bitmap.close();
      return imageFile;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return imageFile;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  } catch {
    return imageFile;
  }
}

/**
 * Runs OCR fully in the browser (no API key, no upload) and hands the raw text
 * to the deterministic parser below.
 */
export async function scanScreenshotWithLocalOcr(
  imageFile: File,
  onProgress?: (statusText: string) => void,
): Promise<ExtractedScreenshotData> {
  onProgress?.('Initializing local Tesseract WebAssembly OCR…');

  const worker = await createWorker('eng', undefined, {
    logger: (message: { status: string; progress: number }) => {
      if (message.status === 'recognizing text') {
        onProgress?.(`Reading screenshot locally… ${Math.round(message.progress * 100)}%`);
      }
    },
  });

  try {
    onProgress?.('Preparing the screenshot for accurate reading…');
    const prepared = await upscaleForOcr(imageFile);
    onProgress?.('Scanning screenshot text locally in browser…');
    const {
      data: { text },
    } = await worker.recognize(prepared);

    if (!text || text.trim().length === 0) {
      throw new Error(
        'Local OCR could not read any text from this image. Try a sharper, larger screenshot, or use a demo preset.',
      );
    }

    onProgress?.('Parsing prices, EMI plans and dark patterns…');
    return parseRawOcrTextToFinTechData(text);
  } finally {
    await worker.terminate();
  }
}

/* -------------------------------------------------------------------------- */
/* AMAZON "ALL EMI PLANS" MODAL                                               */
/* -------------------------------------------------------------------------- */

/** One lender row of Amazon's EMI Options list, with its expanded tenures. */
export interface ParsedLenderRow {
  lenderName: string;
  profileId: string;
  /** "Processing Fee of ₹299 by Bank" — billed on top of the instalment. */
  processingFeeINR?: number;
  plans: Array<{
    tenureMonths: number;
    monthlyEmiShownINR: number;
    nominalInterestRateShownPa?: number;
    isMarkedNoCost: boolean;
    /** Upfront subvention printed for this tenure (Amex-style table). */
    upfrontDiscountINR?: number;
    /** Interest amount printed beside the rate, before the discount. */
    interestAmountINR?: number;
    /** "Total cost" the page prints for this tenure. */
    totalCostINR?: number;
  }>;
  lineIndex: number;
}

/**
 * One row of an expanded lender table, e.g. American Express prints:
 *      EMI Plan | Interest(pa) | Discount | Total cost
 *      ₹5,330 x 3m | ₹366 (14%) | ₹366 | ₹15,990
 * which is a different shape from the "6 months ₹13,610/month" list.
 */
export interface ParsedPlanRow {
  tenureMonths: number;
  monthlyEmiShownINR: number;
  nominalInterestRateShownPa?: number;
  interestAmountINR?: number;
  discountINR?: number;
  totalCostINR?: number;
  lineIndex: number;
}

/** "₹5,330 x 3m" — instalment, a cross and a bare tenure badge. */
const EMI_CROSS_ROW = /([0-9][0-9,]{2,7})\s*[x×]\s*([0-9]{1,2})\s*m(?:onths?|os?)?\b/i;

function amountsOnLine(line: string): number[] {
  return Array.from(line.matchAll(/([0-9][0-9,]{1,7})/g))
    .map((entry) => Number(entry[1].replace(/,/g, '')))
    .filter((value) => Number.isFinite(value));
}

/**
 * Reads the "₹X x Nm" table rows of an expanded lender, keeping the rate in
 * parentheses (Interest pa), the interest amount, the upfront discount and the
 * printed total for each tenure separately.
 */
export function readPlanTableRows(section: string[]): ParsedPlanRow[] {
  const rowIndexes: Array<{ index: number; emi: number; tenure: number }> = [];
  section.forEach((line, index) => {
    const match = line.match(EMI_CROSS_ROW);
    if (!match) return;
    const tenure = Number.parseInt(match[2], 10);
    if (!Number.isFinite(tenure) || tenure <= 0 || tenure > 36) return;
    rowIndexes.push({ index, emi: Number(match[1].replace(/,/g, '')), tenure });
  });
  if (rowIndexes.length === 0) return [];

  // Every row repeats the same "Total cost" cell (the price the plan adds up
  // to), so the most frequent large amount in the table is that total.
  const frequency = new Map<number, number>();
  rowIndexes.forEach((row, position) => {
    const end = rowIndexes[position + 1]?.index ?? section.length;
    const context = section.slice(row.index, Math.min(end, row.index + 3)).join(' ');
    for (const value of new Set(amountsOnLine(context))) {
      if (value < 500) continue;
      frequency.set(value, (frequency.get(value) ?? 0) + 1);
    }
  });
  let tableTotal: number | undefined;
  let tableTotalCount = 0;
  for (const [value, count] of frequency) {
    if (count < Math.min(2, rowIndexes.length)) continue;
    if (count > tableTotalCount || (count === tableTotalCount && value > (tableTotal ?? 0))) {
      tableTotal = value;
      tableTotalCount = count;
    }
  }

  return rowIndexes.map((row, position) => {
    const end = rowIndexes[position + 1]?.index ?? section.length;
    const context = section.slice(row.index, Math.min(end, row.index + 3)).join(' ');

    const rateMatch = context.match(/\(\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*\)/);
    const nominalInterestRateShownPa = rateMatch ? Number.parseFloat(rateMatch[1]) : undefined;

    // The interest cell is the amount sitting immediately before "(14%)".
    const interestMatch = context.match(/([0-9][0-9,]{1,6})\s*\(\s*[0-9]+(?:\.[0-9]+)?\s*%\s*\)/);
    const interestAmountINR = interestMatch
      ? Number(interestMatch[1].replace(/,/g, ''))
      : undefined;

    // Leftover amounts are the discount cell; the repeated total is not one.
    const leftovers = amountsOnLine(context).filter(
      (value) =>
        value !== row.emi &&
        value !== tableTotal &&
        value !== interestAmountINR &&
        value >= 20,
    );
    const discountINR = leftovers.length > 0 ? Math.min(...leftovers) : interestAmountINR;

    return {
      tenureMonths: row.tenure,
      monthlyEmiShownINR: row.emi,
      nominalInterestRateShownPa:
        nominalInterestRateShownPa !== undefined && nominalInterestRateShownPa <= 60
          ? nominalInterestRateShownPa
          : undefined,
      interestAmountINR,
      discountINR,
      totalCostINR: tableTotal,
      lineIndex: row.index,
    };
  });
}

/**
 * The "Total cost" of a plan table doubles as the product price when the crop
 * does not include the price block (the Amex EMI table alone shows ₹15,990).
 */
export function detectTableTotalCost(lines: string[]): number | undefined {
  const rows = readPlanTableRows(lines);
  if (rows.length < 2) return undefined;
  const totals = rows
    .map((row) => row.totalCostINR)
    .filter((value): value is number => typeof value === 'number');
  if (totals.length === 0) return undefined;
  const value = totals[0];
  // Sanity: the total has to agree with instalment × tenure on at least one row.
  const agrees = rows.some((row) => {
    const sum = row.monthlyEmiShownINR * row.tenureMonths;
    return Math.abs(sum - value) <= Math.max(120, value * 0.06);
  });
  return agrees ? value : undefined;
}

const FEE_ROW = /processing\s*fee|\bfee\s*of\b/i;
const MODAL_CHROME =
  /^(?:view\s*only|other\s*emis|debit\s*card\s*emi|amazon\s*pay\s*later|emi\s*options|all\s*emi\s*plans|processing\s*fee)\b/i;
const TENURE_TOKEN = /\b(3|6|9|12|18|24|36)\s*(?:months?|mos?)\b/i;
const EMI_PER_MONTH = /([0-9][0-9,\s]{2,12})\s*(?:\/|per\s*)\s*mo(?:nth)?s?/i;

/**
 * Repairs an instalment OCR mangled (₹ swallowed as a digit, thousands split)
 * by testing every plausible reading against arithmetic the page must satisfy:
 * instalments × tenure has to land near the price shown.
 */
export function repairInstalment(
  digits: string,
  tenureMonths: number,
  priceINR: number,
  isNoCost: boolean,
): number | undefined {
  if (!Number.isFinite(priceINR) || priceINR <= 0) return undefined;
  const clean = digits.replace(/[^0-9]/g, '');
  if (clean.length < 3) return undefined;

  const variants = new Set<number>([Number(clean)]);
  for (let strip = 1; strip <= 2 && strip < clean.length - 2; strip += 1) {
    variants.add(Number(clean.slice(strip)));
  }
  variants.add(Number(`1${clean}`));

  let best: { value: number; score: number } | undefined;
  for (const value of variants) {
    if (!Number.isFinite(value) || value <= 0 || tenureMonths <= 0) continue;
    const total = value * tenureMonths;
    if (total < priceINR * 0.98 || total > priceINR * 2.2) continue;
    const score = isNoCost ? Math.abs(total - priceINR) : Math.abs(value - priceINR / tenureMonths);
    if (!best || score < best.score) best = { value, score };
  }
  return best ? Math.round(best.value) : undefined;
}

/** A small fee can also arrive with a stray leading digit (₹99 → "299"). */
function repairFee(raw: string): number | undefined {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 2) return undefined;
  const value = Number(digits);
  if (value >= 40 && value <= 2000) return value;
  if (/^[23]/.test(digits)) {
    const stripped = Number(digits.slice(1));
    if (stripped >= 40 && stripped <= 2000) return stripped;
  }
  return undefined;
}

/**
 * OCR occasionally reads "₹99" as "₹399". When the stored bank rule differs only
 * by that leading digit, the stored fee is the trustworthy one; any other
 * difference is a genuine page change and is kept as printed.
 */
function reconcileFeeWithDatabase(fee: number | undefined, profileId: string): number | undefined {
  if (fee === undefined) return undefined;
  const stored = getBankProfileById(profileId)?.processingFee.flatAmountINR;
  if (!stored || stored === fee) return fee;
  if (fee === Number(`3${stored}`) || fee === Number(`2${stored}`)) return stored;
  return fee;
}

/**
 * True when a line is a lender heading in an EMI list ("ICICI Bank Credit
 * Card", "BOBCARD", "DBS Credit Card InstaEMI"), not a sentence naming one.
 */
export function readLenderRow(line: string): { lenderName: string; profileId: string } | null {
  const trimmed = line.replace(/\s{2,}/g, ' ').trim();
  if (trimmed.length < 4 || trimmed.length > 64) return null;
  if (FEE_ROW.test(trimmed) || MODAL_CHROME.test(trimmed)) return null;
  if (/\d{3,}|₹|%|\/\s*mo/i.test(trimmed)) return null;

  const profile = getBankProfileByKeyword(trimmed);
  const known = profile.id !== GENERIC_FALLBACK_PROFILE.id;
  const rowLike = /\b(?:credit\s*card|instaemi|card|finserv|pay\s*later)\b/i.test(trimmed);
  if (!known && !rowLike) return null;
  // "with EMI on your ICICI Bank Credit Card" is a promo sentence, not a row.
  if (/\b(?:with|on\s+your)\b/i.test(trimmed)) return null;
  if (!known && /\b(?:and|the|for)\b/i.test(trimmed)) return null;

  return { lenderName: cleanLenderLabel(trimmed, profile, known), profileId: profile.id };
}

/**
 * The bank logos and chevrons around a lender row come through OCR as noise
 * ("Lt HDFC Bank Credit Card Vv", "4X) HSBC Bank Credit Card Ny"). Strip the
 * icon before the bank name and the chevron after it, without losing the name
 * as printed ("Amazon Pay ICICI" stays distinguishable from plain "ICICI").
 */
function cleanLenderLabel(
  printed: string,
  profile: { aliases: string[]; displayName: string },
  known: boolean,
): string {
  let label = printed;
  if (known) {
    const haystack = printed.toLowerCase();
    const indexes = profile.aliases
      .map((alias) => haystack.indexOf(alias.toLowerCase()))
      .filter((index) => index >= 0);
    if (indexes.length > 0) label = printed.slice(Math.min(...indexes));
  }

  const nameShape = label.match(
    /^(.*?(?:credit\s*card(?:\s*emi)?(?:\s*instaemi)?|instaemi|bobcard|onecard|finserv))\b/i,
  );
  if (nameShape) label = nameShape[1];

  label = label
    .replace(/[^A-Za-z&.\s]+$/g, '')
    .replace(/^[^A-Za-z]+/g, '')
    // OCR sometimes drops the space in a brand ("HDFCBank"); restore it.
    .replace(/([a-z])(Bank|Finance)\b/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (label.length < 4 || !/[A-Za-z]{3,}/.test(label)) {
    return known ? profile.displayName : printed;
  }
  return label;
}

/**
 * Parses Amazon's "All EMI Plans" → "Other EMIs" modal.
 *
 * Collapsed state gives one row per lender with the bank's processing fee:
 *      HDFC Bank Credit Card
 *      Processing Fee of ₹299 by Bank
 * Expanding the chevron under a lender reveals that lender's tenure table:
 *      6 months   ₹13,610/month   Interest Rate: 15.99% p.a.
 * Both states are read, so every lender keeps its own fee, tenure list and
 * printed rate instead of one fee being applied to the whole page.
 */
export function parseEmiModalLenders(lines: string[], priceINR: number): ParsedLenderRow[] {
  const headings: Array<{ row: { lenderName: string; profileId: string }; index: number }> = [];

  lines.forEach((line, index) => {
    const row = readLenderRow(line);
    if (row) headings.push({ row, index });
  });

  const parsed = headings.map((heading, position) => {
    const end = headings[position + 1]?.index ?? lines.length;
    const section = lines.slice(heading.index + 1, end);

    // The bank's own processing fee lives directly under its name.
    let processingFeeINR: number | undefined;
    for (const line of section) {
      if (!FEE_ROW.test(line)) continue;
      const fee = line.match(/fee[^0-9]{0,20}(?:₹|rs\.?|inr)?\s*([0-9][0-9,]{1,5})/i);
      if (!fee) continue;
      processingFeeINR = reconcileFeeWithDatabase(repairFee(fee[1]), heading.row.profileId);
      if (processingFeeINR !== undefined) break;
    }

    // Expanded tenure rows: tenure, instalment and the bank's annual rate.
    const plans: ParsedLenderRow['plans'] = [];
    const tableRows = readPlanTableRows(section);
    if (tableRows.length > 0) {
      // "₹5,330 x 3m | ₹366 (14%) | ₹366 | ₹15,990" — one plan per printed row.
      const sectionText = section.join(' ');
      const sectionClaimsNoCost = /no[\s-]*cost|0\s*%\s*interest|zero\s*cost/i.test(sectionText);
      for (const row of tableRows) {
        plans.push({
          tenureMonths: row.tenureMonths,
          monthlyEmiShownINR: row.monthlyEmiShownINR,
          nominalInterestRateShownPa: row.nominalInterestRateShownPa,
          isMarkedNoCost: sectionClaimsNoCost,
          upfrontDiscountINR: row.discountINR,
          interestAmountINR: row.interestAmountINR,
          totalCostINR: row.totalCostINR,
        });
      }
    }
    for (let index = 0; plans.length === 0 && index < section.length; index += 1) {
      const tenureMatch = section[index].match(TENURE_TOKEN);
      if (!tenureMatch) continue;
      const tenureMonths = Number.parseInt(tenureMatch[1], 10);
      if (plans.some((plan) => plan.tenureMonths === tenureMonths)) continue;

      const window = [section[index], section[index + 1] ?? '', section[index + 2] ?? ''];
      const joined = window.join(' ');
      const isMarkedNoCost = /no[\s-]*cost|0\s*%\s*interest|zero\s*cost/i.test(joined);

      const emiMatch = joined.match(EMI_PER_MONTH);
      const monthlyEmiShownINR = emiMatch
        ? repairInstalment(emiMatch[1], tenureMonths, priceINR, isMarkedNoCost)
        : undefined;

      let nominalInterestRateShownPa: number | undefined;
      for (const candidate of window) {
        if (/gst|tax/i.test(candidate)) continue;
        const rateMatch =
          candidate.match(
            /(?:interest\s*(?:rate)?|@)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i,
          ) ?? candidate.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:p\.?\s*a\.?|per\s*annum|annual)/i);
        if (!rateMatch) continue;
        const value = Number.parseFloat(rateMatch[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 60) {
          nominalInterestRateShownPa = value;
          break;
        }
      }

      if (monthlyEmiShownINR === undefined) continue;
      plans.push({ tenureMonths, monthlyEmiShownINR, nominalInterestRateShownPa, isMarkedNoCost });
    }

    return { ...heading.row, processingFeeINR, plans, lineIndex: heading.index };
  });

  // The modal repeats its lender list on each tab (Pay Later / Debit / Other) and
  // a cropped screenshot can split one lender into two headings, so fold such
  // fragments back together — without ever merging two cards that each print
  // their own, different fee (Amazon Pay ICICI vs ICICI).
  const absorb = (target: ParsedLenderRow, extra: ParsedLenderRow) => {
    target.processingFeeINR = target.processingFeeINR ?? extra.processingFeeINR;
    for (const plan of extra.plans) {
      if (!target.plans.some((entry) => entry.tenureMonths === plan.tenureMonths)) {
        target.plans.push(plan);
      }
    }
  };

  const groups = new Map<string, ParsedLenderRow[]>();
  for (const row of parsed) {
    const list = groups.get(row.profileId) ?? [];
    list.push(row);
    groups.set(row.profileId, list);
  }

  const resolved: ParsedLenderRow[] = [];
  for (const list of groups.values()) {
    // Every row stating its own fee means this bank really is listed more than
    // once (Amazon Pay ICICI + ICICI); only fold fragments that lack a fee.
    const allHaveFee = list.every((row) => row.processingFeeINR !== undefined);
    if (!allHaveFee) {
      const target = list[0];
      list.slice(1).forEach((row) => absorb(target, row));
      resolved.push(target);
      continue;
    }
    const perLabel = new Map<string, ParsedLenderRow>();
    for (const row of list) {
      const key = row.lenderName.toLowerCase();
      const existing = perLabel.get(key);
      if (existing) absorb(existing, row);
      else perLabel.set(key, row);
    }
    resolved.push(...perLabel.values());
  }

  return resolved.sort((a, b) => a.lineIndex - b.lineIndex);
}

/**
 * Deterministic Indian e-commerce / EMI parser. Converts raw OCR text into the
 * structured audit shape — no model calls, fully reproducible.
 */
export function parseRawOcrTextToFinTechData(rawText: string): ExtractedScreenshotData {
  const cleanText = rawText.replace(/\r/g, '\n');
  const lines = cleanText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 2);
  const lower = cleanText.toLowerCase();

  /* 1. Platform ------------------------------------------------------------ */
  let platformName = 'Online Checkout Portal';
  if (
    lower.includes('amazon') ||
    /\bprime\b|ask\s*rufus|search\s*this\s*page|bought\s*in\s*past\s*month|amazon'?s\s*choice/i.test(
      cleanText,
    )
  )
    platformName = 'Amazon India';
  else if (lower.includes('flipkart')) platformName = 'Flipkart';
  else if (lower.includes('croma')) platformName = 'Croma';
  else if (/make\s*my\s*trip|\bmmt\b/.test(lower)) platformName = 'MakeMyTrip';
  else if (lower.includes('myntra')) platformName = 'Myntra';
  else if (lower.includes('reliance')) platformName = 'Reliance Digital';
  else if (lower.includes('tata cli') || lower.includes('tatacliq')) platformName = 'Tata CLiQ';

  /* 2. Prices -------------------------------------------------------------- */
  const priceRegex = /(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]{3,7})/gi;
  const extractedNumbers: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = priceRegex.exec(cleanText)) !== null) {
    const amount = Number.parseFloat(match[1].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount >= 49 && amount <= 500000) {
      extractedNumbers.push(amount);
    }
  }

  // Tables and low-resolution screenshots often lose the currency glyph, so
  // also collect every comma-grouped number and reconcile below.
  const commaNumbers = cleanText.match(/\b[1-9][0-9]{0,2},[0-9]{3}\b/g) ?? [];
  for (const entry of commaNumbers) {
    const value = Number.parseFloat(entry.replace(/,/g, ''));
    if (Number.isFinite(value) && value >= 49 && value <= 500000) {
      extractedNumbers.push(value);
    }
  }

  // The strikethrough MRP / "list price" is never the price the shopper pays.
  const mrpValues = new Set<number>();
  const mrpRegex = /(?:m\.?r\.?p\.?|list\s*price|was)\D{0,10}([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,7})/gi;
  let mrpMatch: RegExpExecArray | null;
  while ((mrpMatch = mrpRegex.exec(cleanText)) !== null) {
    mrpValues.add(Number.parseFloat(mrpMatch[1].replace(/,/g, '')));
  }

  // Pick the headline price by position: a product price sits above the EMI
  // banner, while totals/payables and instalments do not. This also survives the
  // common OCR slip where ₹ becomes a leading "3" (₹4,899 → 34,899).
  const emiAnchorIndex = lines.findIndex((line) =>
    /no[\s-]*cost|emi\s*options|select\s*emi|emi\s*available|interest\s*rate/i.test(line),
  );
  const notAPriceLine =
    /m\.?r\.?p|list\s*price|\bwas\b|total|payable|amount\s*due|you\s*pay\b|save|discount|upfront|\/\s*mo\b|per\s*month|gst|fee|charge|month/i;
  const amountInLine =
    /(?:₹|rs\.?|inr|%|¥)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d{4,7})(?:\.\d{1,2})?/gi;

  const priceCandidates: Array<{ amount: number; score: number; index: number }> = [];
  lines.forEach((line, index) => {
    if (notAPriceLine.test(line)) return;
    let amountMatch: RegExpExecArray | null;
    amountInLine.lastIndex = 0;
    while ((amountMatch = amountInLine.exec(line)) !== null) {
      const amount = Number.parseFloat(amountMatch[1].replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount < 1500 || amount > 500000) continue;
      if (mrpValues.has(amount)) continue;
      const beforeEmi = emiAnchorIndex === -1 || index < emiAnchorIndex;
      // A printed currency symbol is the strongest signal: OCR noise elsewhere
      // on the page (ratings, review counts) has no ₹/¥ in front of it.
      const hasCurrency = /(?:₹|¥|rs\.?|inr)/i.test(amountMatch[0]);
      priceCandidates.push({
        amount,
        score:
          (beforeEmi ? 4 : 0) +
          (hasCurrency ? 3 : 0) +
          (line.trim().length < 40 ? 1 : 0),
        index,
      });
    }
  });

  priceCandidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const highPrices = Array.from(new Set(extractedNumbers)).filter(
    (amount) => amount >= 1500 && !mrpValues.has(amount),
  );
  // A cropped EMI table has no price block: the repeated "Total cost" cell is the
  // price the instalments add up to, so it beats any single row amount.
  const listedProductPriceINR =
    detectTableTotalCost(lines) ??
    priceCandidates[0]?.amount ??
    (highPrices.length > 0 ? Math.max(...highPrices) : Math.max(...extractedNumbers, 60000));

  /* 3. Product name -------------------------------------------------------- */
  // Product titles wrap over several OCR lines, so stitch the title paragraph
  // together instead of taking the first line that happens to be long enough.
  const uiAnchor =
    /visit\s*the|bought\s*in\s*past|search\s*this\s*page|ask\s*rufus|all\s*emi\s*plans|price\s*history|click\s*to\s*see/i;
  // The title sits above the price/EMI banner; anything past the first rupee
  // amount, EMI line or store link belongs to the offer block, not the product.
  const moneyAnchor = /(?:₹|¥|\brs\.?\b|\binr\b|\/month|\bemi\b|\bprice\b)/i;
  const stopIndexes = [
    lines.findIndex((line) => uiAnchor.test(line)),
    lines.findIndex((line) => moneyAnchor.test(line)),
  ].filter((index) => index > 0);
  const titleLimit =
    stopIndexes.length > 0
      ? Math.min(...stopIndexes, 10)
      : Math.min(lines.length, 10);
  const titleCandidates = lines.slice(0, titleLimit);
  const letterRatio = (line: string) => {
    const nonSpace = line.replace(/\s/g, '');
    if (nonSpace.length === 0) return 0;
    const letters = (line.match(/[\p{L}\p{N}]/gu) ?? []).length;
    return letters / nonSpace.length;
  };
  const titleLike = (line: string) =>
    line.length >= 6 &&
    line.length <= 120 &&
    letterRatio(line) >= 0.6 &&
    (line.match(/[\p{L}]{2,}/gu) ?? []).length >= 2 &&
    !/^(?:₹|rs\.?|inr)/i.test(line);

  const cleanTitlePiece = (line: string) =>
    line
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/^\d{1,2}\s*[<|]\s*/, '')
      .replace(/\s*[₹%¥]\s*\d[\d,]*\s*$/u, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

  let productLine = 'Scanned E-Commerce Product';
  const bestTitleIndex = titleCandidates.reduce((best, line, index, arr) => {
    if (!titleLike(line)) return best;
    if (best === -1) return index;
    const score = (entry: string) => (entry.match(/[\p{L}]{3,}/gu) ?? []).length;
    return score(line) > score(arr[best]) ? index : best;
  }, -1);

  if (bestTitleIndex !== -1) {
    const parts: string[] = [];
    // Walk outwards from the strongest line so a mangled first line does not
    // poison an otherwise readable title.
    for (let index = bestTitleIndex; index >= 0 && parts.length < 3; index -= 1) {
      const line = titleCandidates[index];
      if (!titleLike(line)) break;
      parts.unshift(cleanTitlePiece(line));
    }
    for (
      let index = bestTitleIndex + 1;
      index < titleCandidates.length && parts.length < 3;
      index += 1
    ) {
      const line = titleCandidates[index];
      if (!titleLike(line)) break;
      parts.push(cleanTitlePiece(line));
      if (/[.!]$/.test(line.trim())) break;
    }
    productLine =
      parts
        .filter(Boolean)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/[,;:\-]$/, '')
        .trim() || productLine;
  }

  /* 4. Lenders ------------------------------------------------------------- */
  const detectedBanks: string[] = [];
  const pushBank = (name: string) => {
    if (!detectedBanks.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      detectedBanks.push(name);
    }
  };
  // EMI lists name the lender on its own line, so they win over loose keywords.
  for (const line of lines) {
    const lender = readLenderRow(line);
    if (lender) pushBank(lender.lenderName);
  }
  if (/bajaj/i.test(cleanText) && !detectedBanks.some((name) => /bajaj/i.test(name))) {
    pushBank('Bajaj Finserv Insta EMI Card');
  }
  if (detectedBanks.length === 0) {
    // No EMI list: the banner ("…with No Cost EMI on your ICICI Bank Credit
    // Card") is the only lender evidence on the page. Never invent other banks —
    // three fabricated lenders would read as three real choices.
    const emiLineIndex = lines.findIndex((line) => /\/\s*month|per\s*month/i.test(line));
    const nearby =
      emiLineIndex >= 0 ? lines.slice(emiLineIndex, emiLineIndex + 3).join(' ') : cleanText;
    const named = getBankProfileByKeyword(nearby);
    pushBank(
      named.id !== GENERIC_FALLBACK_PROFILE.id
        ? named.displayName
        : GENERIC_FALLBACK_PROFILE.displayName,
    );
  }

  /* 5. Tenures & no-cost claim -------------------------------------------- */
  const tenureMatches = Array.from(
    cleanText.matchAll(/\b(3|6|9|12|18|24)\s*(?:months?|mos?|m\b|emi)/gi),
  ).map((entry) => Number.parseInt(entry[1], 10));
  const uniqueTenures = Array.from(new Set(tenureMatches));
  const tenuresToBuild = uniqueTenures.length > 0 ? uniqueTenures : [6, 9, 12];

  // The modal's "View only 'No Cost EMI' options" toggle is a control, not a
  // claim about the offers listed, so it must not mark every plan as no-cost.
  const claimText = cleanText.replace(/view\s*only[^\n]*no[\s-]*cost[^\n]*/gi, ' ');
  const isMarkedNoCost =
    /no[\s-]*cost|0\s*%\s*interest|zero\s*cost|total\s*interest\s*₹?\s*0|interest\s*[:\-]\s*0\b/i.test(
      claimText,
    );

  /**
   * Tesseract often reads the ₹ glyph as a leading "3" when the amount has no
   * thousands separator (₹899 → "3899"). Undo that specific artifact; genuine
   * four-digit amounts are printed with a comma (₹3,899) and are left alone.
   */
  const normalizeAmount = (token: string): number => {
    const digits = token.replace(/,/g, '');
    if (/^3\d{3}$/.test(digits) && Number(digits.slice(1)) >= 100) {
      return Number(digits.slice(1));
    }
    return Number(digits);
  };
  const amountsInLine = (line: string): number[] => {
    const matches = Array.from(
      line.matchAll(/(?:₹|rs\.?|inr|%|¥)?\s*([0-9][0-9,]{1,6})(?:\.\d{1,2})?/gi),
    );
    return matches.map((entry) => normalizeAmount(entry[1]));
  };

  let processingFeeShownINR: number | undefined;
  for (const line of lines) {
    if (!/processing\s*fee/i.test(line)) continue;
    const amounts = amountsInLine(line).filter((amount) => amount >= 49 && amount <= 2000);
    if (amounts.length > 0) {
      processingFeeShownINR = amounts[amounts.length - 1];
      break;
    }
  }

  // Interest rate actually printed on the page. GST lines are skipped so
  // "18% GST on interest" is never mistaken for the credit rate.
  let nominalInterestRateShownPa: number | undefined;
  for (const line of lines) {
    if (/gst|tax/i.test(line)) continue;
    const annual =
      line.match(
        /(?:interest\s*rate|rate\s*of\s*interest|annual\s*percentage\s*rate|\bapr\b)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i,
      ) ?? line.match(/(\d+(?:\.\d+)?)\s*%\s*(?:p\.?\s*a\.?|per\s*annum|annual(?:ly)?)/i);
    if (annual) {
      const value = Number.parseFloat(annual[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 60) {
        nominalInterestRateShownPa = value;
        break;
      }
    }
    const monthly = line.match(
      /(?:interest[^0-9]{0,24})?(\d+(?:\.\d+)?)\s*%\s*(?:per\s*month|monthly|p\.?\s*m\.?)/i,
    );
    if (monthly) {
      const value = Number.parseFloat(monthly[1]) * 12;
      if (Number.isFinite(value) && value >= 0 && value <= 60) {
        nominalInterestRateShownPa = Math.round(value * 100) / 100;
        break;
      }
    }
  }

  // If no percentage is printed, a monthly interest amount can imply the rate:
  // first-month interest ÷ price × 12. Only lines that explicitly say monthly.
  if (nominalInterestRateShownPa === undefined) {
    for (const line of lines) {
      if (/gst|tax/i.test(line)) continue;
      if (!/interest/i.test(line) || !/(monthly|per\s*month|p\.?\s*m\.?)/i.test(line)) continue;
      const amount = line.match(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]{1,6})/i);
      if (!amount) continue;
      const value = Number.parseFloat(amount[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value >= 10 && value < listedProductPriceINR * 0.1) {
        nominalInterestRateShownPa =
          Math.round(((value / listedProductPriceINR) * 12 * 100) * 100) / 100;
        break;
      }
    }
  }

  // Which lender does the banner's no-cost claim actually cover? Amazon prints
  // "with No Cost EMI on your ICICI Bank Credit Card", so only that lender
  // qualifies — the other banks' rows are ordinary interest-bearing EMIs.
  const bannerIndex = lines.findIndex((line) => /\/\s*month|per\s*month/i.test(line));
  const bannerClaimText =
    bannerIndex >= 0 ? lines.slice(bannerIndex, bannerIndex + 3).join(' ') : '';
  const bannerClaimProfile = /no[\s-]*cost|0\s*%\s*interest|zero\s*cost/i.test(
    bannerClaimText,
  )
    ? getBankProfileByKeyword(bannerClaimText)
    : undefined;
  const bannerClaimProfileId =
    bannerClaimProfile && bannerClaimProfile.id !== GENERIC_FALLBACK_PROFILE.id
      ? bannerClaimProfile.id
      : undefined;

  /** A printed positive rate always beats a no-cost claim. */
  const planIsNoCost = (
    lenderName: string,
    printedRate: number | undefined,
    rowClaimsNoCost: boolean,
  ): boolean => {
    if (rowClaimsNoCost) return true;
    if (typeof printedRate === 'number' && printedRate > 0.05) return false;
    if (!isMarkedNoCost) return false;
    if (!bannerClaimProfileId) return true;
    return getBankProfileByKeyword(lenderName).id === bannerClaimProfileId;
  };

  // Upfront merchant discount that funds a "No-Cost" or "0% interest" claim.
  let upfrontInterestDiscountShownINR: number | undefined;
  for (const line of lines) {
    if (/gst|tax/i.test(line)) continue;
    const discount =
      line.match(
        /(?:upfront|interest)\s*discount[^0-9]{0,24}(?:₹|rs\.?|inr|%|¥)?\s*([0-9][0-9,]{1,6})/i,
      ) ??
      line.match(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]{1,6})[^\n]{0,40}discounted\s*upfront/i) ??
      (/total\s*interest/i.test(line)
        ? line.match(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]{1,6})/i)
        : null);
    if (discount) {
      let value = Number.parseFloat(discount[1].replace(/,/g, ''));
      // ₹ is often read as a leading 3 (₹3,607 → "33607"); strip it only when
      // the result becomes a plausible subvention rather than a real discount.
      const plausible = listedProductPriceINR * 0.35;
      if (Number.isFinite(value) && value > plausible) {
        const digits = String(Math.trunc(value));
        if (digits.startsWith('3')) {
          const stripped = Number.parseInt(digits.slice(1), 10);
          if (Number.isFinite(stripped) && stripped > 0 && stripped <= plausible) {
            value = stripped;
          }
        }
      }
      if (Number.isFinite(value) && value > 0 && value <= plausible) {
        upfrontInterestDiscountShownINR = value;
        break;
      }
    }
  }

  /**
   * Read instalments from the page itself. A real checkout prints something like
   * "₹10,833 /month (12 months)", but OCR often swallows the ₹ glyph as a digit
   * or splits the thousands digit, giving "21 0,833" or "23,770". The digits are
   * therefore repaired against the arithmetic the page must satisfy: total
   * repayments have to land near the listed price.
   */
  const emiByTenure = new Map<number, number>();
  const monthToken = /(?:\/|per\s*)\s*mo(?:nth)?s?\b/i;
  const plausibleEmiScore = (value: number, tenure: number, noCost: boolean): number => {
    if (!Number.isFinite(value) || value <= 0 || tenure <= 0) return Number.POSITIVE_INFINITY;
    const total = value * tenure;
    if (total < listedProductPriceINR * 0.98 || total > listedProductPriceINR * 2.2) {
      return Number.POSITIVE_INFINITY;
    }
    return noCost
      ? Math.abs(total - listedProductPriceINR)
      : Math.abs(value - listedProductPriceINR / tenure);
  };

  lines.forEach((line, index) => {
    if (!monthToken.test(line)) return;

    // Amount immediately before "/month", keeping any digits OCR split apart.
    const amountMatch = line.match(/([0-9][0-9,\s]*?)\s*(?:\/|per\s*)\s*mo(?:nth)?s?\b/i);
    if (!amountMatch) return;
    const digits = amountMatch[1].replace(/[^0-9]/g, '');
    if (digits.length < 3) return;

    // Tenure is usually next to the instalment, sometimes one line below.
    const context = [line, lines[index + 1] ?? '', lines[index + 2] ?? ''].join(' ');
    const tenureMatch = context.match(/\b(3|6|9|12|18|24)\s*months?\b/i);
    const tenure = tenureMatch ? Number.parseInt(tenureMatch[1], 10) : undefined;
    if (!tenure || emiByTenure.has(tenure)) return;

    const noCostHere = /no[\s-]*cost|0\s*%\s*interest|zero\s*cost/i.test(context);
    const variants = new Set<number>([Number(digits)]);
    for (let strip = 1; strip <= 2 && strip < digits.length - 2; strip += 1) {
      variants.add(Number(digits.slice(strip)));
    }
    variants.add(Number(`1${digits}`));

    let best: { value: number; score: number } | undefined;
    for (const value of variants) {
      const score = plausibleEmiScore(value, tenure, noCostHere);
      if (!Number.isFinite(score)) continue;
      if (!best || score < best.score) best = { value, score };
    }
    if (best) emiByTenure.set(tenure, Math.round(best.value));
  });

  // Only instalments the page actually showed become plans; tenures that were
  // merely guessed from a badge would otherwise be presented as printed facts.
  const planTenures =
    emiByTenure.size > 0 ? Array.from(emiByTenure.keys()) : tenuresToBuild.slice(0, 1);

  /* 6. Plan ladder --------------------------------------------------------- */
  const modalLenders = parseEmiModalLenders(lines, listedProductPriceINR);
  const bannerTenure = planTenures[0];
  const bannerEmi = bannerTenure !== undefined ? emiByTenure.get(bannerTenure) : undefined;
  const emiOptionsShown: ExtractedEmiOption[] = [];

  for (const lender of modalLenders) {
    if (lender.plans.length > 0) {
      // The chevron was expanded: this lender's own tenures and rates are printed.
      for (const plan of lender.plans) {
        emiOptionsShown.push({
          bankOrLenderName: lender.lenderName,
          tenureMonths: plan.tenureMonths,
          monthlyEmiShownINR: plan.monthlyEmiShownINR,
          isMarkedNoCost: planIsNoCost(
            lender.lenderName,
            plan.nominalInterestRateShownPa,
            plan.isMarkedNoCost,
          ),
          // A table prints the merchant's subvention per tenure, so that cell wins
          // over the one discount figure that applies to the whole page.
          upfrontInterestDiscountShownINR:
            plan.upfrontDiscountINR ?? upfrontInterestDiscountShownINR,
          nominalInterestRateShownPa: plan.nominalInterestRateShownPa,
          processingFeeShownINR: lender.processingFeeINR ?? processingFeeShownINR,
        });
      }
      continue;
    }

    // Collapsed row: only the bank's fee is printed, so pair it with the plan
    // the page banner advertises. The fee still differs bank to bank.
    if (bannerTenure !== undefined && bannerEmi !== undefined) {
      emiOptionsShown.push({
        bankOrLenderName: lender.lenderName,
        tenureMonths: bannerTenure,
        monthlyEmiShownINR: bannerEmi,
        isMarkedNoCost: planIsNoCost(lender.lenderName, undefined, false),
        upfrontInterestDiscountShownINR,
        nominalInterestRateShownPa,
        processingFeeShownINR: lender.processingFeeINR ?? processingFeeShownINR,
      });
    }
  }

  if (emiOptionsShown.length === 0 && emiByTenure.size > 0) {
    // No EMI list on this page: fall back to the banner instalments per lender.
    for (const bankName of detectedBanks.slice(0, 3)) {
      for (const tenure of planTenures.slice(0, 4)) {
        emiOptionsShown.push({
          bankOrLenderName: bankName,
          tenureMonths: tenure,
          monthlyEmiShownINR:
            emiByTenure.get(tenure) ?? Math.round(listedProductPriceINR / tenure),
          isMarkedNoCost,
          nominalInterestRateShownPa,
          upfrontInterestDiscountShownINR,
          processingFeeShownINR,
        });
      }
    }
  }

  /* 7. CCPA 2023 dark-pattern signals ------------------------------------- */
  const dripFeesFound: Array<{ label: string; amountINR: number }> = [];
  const dripLabel =
    /((?:convenience|packaging|handling|platform|payment\s*gateway|mandate\s*registration|processing|booking)\s*(?:fee|charge))/i;
  for (const line of lines) {
    const label = line.match(dripLabel);
    if (!label) continue;
    if (/^\s*gst\b/i.test(line)) continue; // a tax line, not an additional fee
    const amounts = amountsInLine(line).filter((amount) => amount >= 49 && amount <= 5000);
    if (amounts.length === 0) continue;
    dripFeesFound.push({ label: label[1], amountINR: amounts[amounts.length - 1] });
  }

  const preTickedAddonsFound: Array<{ label: string; amountINR: number }> = [];
  const addonLabel =
    /(extended\s*warranty|damage\s*protection|screen\s*protection|complete\s*mobile\s*protection|travel\s*insurance|applecare|seat\s*selection)/i;
  for (const line of lines) {
    const label = line.match(addonLabel);
    if (!label) continue;
    if (/opt-out|not\s*selected|unchecked/i.test(line)) continue;
    const amounts = amountsInLine(line).filter(
      (amount) => amount >= 99 && amount < listedProductPriceINR * 0.35,
    );
    if (amounts.length === 0) continue;
    preTickedAddonsFound.push({ label: label[1], amountINR: amounts[amounts.length - 1] });
  }

  const urgencyMatch = cleanText.match(
    /(only\s*[0-9]\s*(?:left|seats?)|hurry|deal\s*ends\s*in|offer\s*expires|order\s*within\s*[0-9]+|[0-9]{2}\s*m\s*:\s*[0-9]{2}\s*s)/i,
  );
  const shamingMatch = cleanText.match(
    /(i\s*(?:will|prefer to)\s*risk|no,?\s*i\s*(?:don'?t|do not)\s*want\s*protection|skip\s*at\s*my\s*own\s*risk|continue\s*without\s*securing)/i,
  );
  // A disclosure needs an actual number. "APR not disclosed" is a negation, not
  // a disclosure, so require a percentage right next to the APR label.
  const explicitAprShownOnScreen =
    /\bapr\b[^\n%]{0,24}[0-9]+(?:\.[0-9]+)?\s*%/i.test(cleanText) ||
    /[0-9]+(?:\.[0-9]+)?\s*%\s*(?:p\.?\s*a\.?)?[^\n]{0,12}\bapr\b/i.test(cleanText) ||
    /annual\s*percentage\s*rate[^\n%]{0,24}[0-9]+(?:\.[0-9]+)?\s*%/i.test(cleanText);

  const rawFinePrintTextExtracted = lines.filter((line) =>
    /gst|processing|interest|discount|terms|condition|fee|emi|tax/i.test(line),
  );

  const detectedLenderFees: DetectedLenderFee[] = modalLenders.map((lender) => ({
    lenderName: lender.lenderName,
    processingFeeINR: lender.processingFeeINR,
    ratesShownPa: Array.from(
      new Set(
        lender.plans
          .map((plan) => plan.nominalInterestRateShownPa)
          .filter((rate): rate is number => typeof rate === 'number'),
      ),
    ),
    tenuresShown: lender.plans.map((plan) => plan.tenureMonths),
  }));

  return {
    productName: productLine,
    platformName,
    listedProductPriceINR,
    emiOptionsShown,
    detectedLenderFees,
    detectedUiViolations: {
      dripFeesFound,
      preTickedAddonsFound,
      hasFalseUrgencyTimer: Boolean(urgencyMatch),
      urgencyTextFound: urgencyMatch?.[0],
      hasConfirmShaming: Boolean(shamingMatch),
      confirmShamingTextFound: shamingMatch?.[0],
      isGstAndAprHiddenInFinePrint: !explicitAprShownOnScreen,
      explicitAprShownOnScreen,
    },
    rawFinePrintTextExtracted:
      rawFinePrintTextExtracted.length > 0
        ? rawFinePrintTextExtracted
        : ['OCR completed locally via Tesseract.js WebAssembly.'],
    scannerEngineUsed: LOCAL_OCR_ENGINE_LABEL,
  };
}

/* -------------------------------------------------------------------------- */
/* ENGINE 2 (OPTIONAL): OPEN-WEIGHTS LLAMA-4-SCOUT VIA GROQ                   */
/* -------------------------------------------------------------------------- */

const CLOUD_EXTRACTION_PROMPT = `You are a forensic extraction engine for Indian online shopping screenshots.
Read the image (a product page, an EMI options pop-up, or a final checkout/payment page) and return ONLY JSON with these keys:
productName (string), platformName (string), listedProductPriceINR (number),
emiOptionsShown (array of { bankOrLenderName, tenureMonths, monthlyEmiShownINR, isMarkedNoCost, upfrontInterestDiscountShownINR, nominalInterestRateShownPa, processingFeeShownINR }),
detectedUiViolations ({ dripFeesFound: [{label, amountINR}], preTickedAddonsFound: [{label, amountINR}], hasFalseUrgencyTimer: boolean, urgencyTextFound: string, hasConfirmShaming: boolean, confirmShamingTextFound: string, isGstAndAprHiddenInFinePrint: boolean, explicitAprShownOnScreen: boolean }),
rawFinePrintTextExtracted (array of strings).

Rules: transcribe amounts exactly as printed (strip ₹ and commas). One EMI row per lender+tenure. isMarkedNoCost only for "No-Cost / 0% interest / zero interest" copy. Copy the printed interest rate into nominalInterestRateShownPa (annualise a monthly rate by ×12), the printed upfront interest discount into upfrontInterestDiscountShownINR, and the printed processing/convenience fee into processingFeeShownINR. Never substitute a lender's published rate that is not shown in the image.
Amazon's "All EMI Plans" pop-up lists one row per lender with "Processing Fee of ₹X by Bank", and expanding a lender's chevron reveals that lender's tenure table ("6 months ₹13,610/month — Interest Rate: 15.99% p.a."). Read the per-lender fee from each row and, when a lender is expanded, its own tenure rows and printed rate; when it is collapsed, keep that lender's fee and use the tenure/instalment the product banner advertises. Never apply one lender's fee to another.
dripFeesFound = mandatory charges revealed only at checkout (convenience, packaging, gateway, e-mandate/NACH, processing).
preTickedAddonsFound = paid items already added or pre-ticked (extended warranty, protection plans, credit shield, travel insurance, donations).
isGstAndAprHiddenInFinePrint = true when GST on interest, GST on fees or the all-inclusive APR appears only in fine print / collapsed T&C.
explicitAprShownOnScreen = true only when a numeric all-inclusive APR is visible ("0% interest" is not an APR).
Never compute or infer an EMI, interest total or APR. Use 0 for absent fields.`;

/**
 * Scans with open-weights Llama-4-Scout when a Groq key is provided, otherwise
 * (or on any failure) uses the local Tesseract WASM pipeline.
 */
export async function scanCheckoutScreenshot(
  imageFile: File,
  optionalGroqApiKey?: string,
  onProgress?: (statusText: string) => void,
): Promise<ExtractedScreenshotData> {
  const key = optionalGroqApiKey?.trim() ?? '';
  if (key.startsWith('gsk_')) {
    try {
      onProgress?.('Reading screenshot with open-weights Llama-4-Scout…');
      const dataUrl = await fileToDataUrl(imageFile);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CLOUD_VISION_MODEL_ID,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: CLOUD_EXTRACTION_PROMPT },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq vision returned HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('Groq vision returned an empty response.');

      const data = sanitizeExtractedData(JSON.parse(content));
      return { ...data, scannerEngineUsed: 'Meta Llama-4-Scout-17B Vision (open weights, Groq)' };
    } catch (error) {
      console.warn('Cloud vision unavailable — falling back to local Tesseract WASM OCR.', error);
      onProgress?.('Cloud vision unavailable — switching to local OCR…');
    }
  }

  return scanScreenshotWithLocalOcr(imageFile, onProgress);
}

/** Defensive normalisation so the UI and judge never see undefined fields. */
export function sanitizeExtractedData(raw: unknown): ExtractedScreenshotData {
  const source = (raw ?? {}) as Record<string, unknown>;
  const ui = (source.detectedUiViolations ?? {}) as Record<string, unknown>;

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const cleaned = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(cleaned) ? cleaned : 0;
    }
    return 0;
  };
  const toString = (value: unknown): string =>
    typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(toString).filter((entry) => entry.trim().length > 0) : [];
  const toFeeList = (value: unknown): Array<{ label: string; amountINR: number }> =>
    Array.isArray(value)
      ? value.map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          return {
            label: toString(item.label) || 'Unnamed charge',
            amountINR: toNumber(item.amountINR),
          };
        })
      : [];

  const options = Array.isArray(source.emiOptionsShown) ? source.emiOptionsShown : [];
  const emiOptionsShown: ExtractedEmiOption[] = options.map((entry) => {
    const option = (entry ?? {}) as Record<string, unknown>;
    return {
      bankOrLenderName: toString(option.bankOrLenderName) || 'Unidentified lender',
      tenureMonths: Math.max(0, Math.round(toNumber(option.tenureMonths))),
      monthlyEmiShownINR: toNumber(option.monthlyEmiShownINR),
      isMarkedNoCost: Boolean(option.isMarkedNoCost),
      upfrontInterestDiscountShownINR:
        option.upfrontInterestDiscountShownINR === undefined
          ? undefined
          : toNumber(option.upfrontInterestDiscountShownINR),
      nominalInterestRateShownPa:
        option.nominalInterestRateShownPa === undefined
          ? undefined
          : toNumber(option.nominalInterestRateShownPa),
      processingFeeShownINR:
        option.processingFeeShownINR === undefined
          ? undefined
          : toNumber(option.processingFeeShownINR),
    };
  });

  const lenderFees: DetectedLenderFee[] = Array.isArray(source.detectedLenderFees)
    ? source.detectedLenderFees.map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return {
          lenderName: toString(item.lenderName) || 'Unidentified lender',
          processingFeeINR:
            item.processingFeeINR === undefined ? undefined : toNumber(item.processingFeeINR),
          ratesShownPa: Array.isArray(item.ratesShownPa) ? item.ratesShownPa.map(toNumber) : [],
          tenuresShown: Array.isArray(item.tenuresShown) ? item.tenuresShown.map(toNumber) : [],
        };
      })
    : [];

  return {
    productName: toString(source.productName) || 'Unidentified product',
    platformName: toString(source.platformName) || 'Unidentified platform',
    listedProductPriceINR: toNumber(source.listedProductPriceINR),
    emiOptionsShown: emiOptionsShown.filter((option) => option.tenureMonths > 0),
    detectedLenderFees: lenderFees,
    detectedUiViolations: {
      dripFeesFound: toFeeList(ui.dripFeesFound),
      preTickedAddonsFound: toFeeList(ui.preTickedAddonsFound),
      hasFalseUrgencyTimer: Boolean(ui.hasFalseUrgencyTimer),
      urgencyTextFound: ui.urgencyTextFound ? toString(ui.urgencyTextFound) : undefined,
      hasConfirmShaming: Boolean(ui.hasConfirmShaming),
      confirmShamingTextFound: ui.confirmShamingTextFound
        ? toString(ui.confirmShamingTextFound)
        : undefined,
      isGstAndAprHiddenInFinePrint: Boolean(ui.isGstAndAprHiddenInFinePrint),
      explicitAprShownOnScreen: Boolean(ui.explicitAprOnScreen ?? ui.explicitAprShownOnScreen),
    },
    rawFinePrintTextExtracted: toStringArray(source.rawFinePrintTextExtracted),
    scannerEngineUsed: source.scannerEngineUsed
      ? toString(source.scannerEngineUsed)
      : undefined,
  };
}

export function sumAddOns(data: ExtractedScreenshotData | null): number {
  if (!data) return 0;
  return data.detectedUiViolations.preTickedAddonsFound.reduce(
    (sum, item) => sum + item.amountINR,
    0,
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

/* -------------------------------------------------------------------------- */
/* INSTANT DEMO PRESETS (offline / no API key)                                */
/* -------------------------------------------------------------------------- */

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'preset-smartphone-no-cost-trap',
    title: 'FlagshipPro X5 5G — ₹79,999 "No-Cost EMI" trap',
    subtitle: 'Amazon India · HDFC, ICICI and SBI Card 6/9/12-month plans',
    reveals: [
      'Headline "0% interest / No-Cost EMI" with no all-inclusive APR anywhere on the page',
      '₹299 processing fee + 18% GST charged separately from the instalment',
      '18% GST billed every month on the interest component the "0%" claim hides',
      'GST, pre-closure penalty and reward-point forfeiture buried in 9px grey fine print',
    ],
    mockScreenshotDataUrl: buildMarketplaceEmiMock(),
    recommendedLenderKeyword: 'hdfc',
    sneakedAddOnsTotal: 0,
    extracted: {
      productName: 'FlagshipPro X5 5G (Midnight Titanium, 256 GB)',
      platformName: 'Amazon India',
      listedProductPriceINR: 79999,
      emiOptionsShown: [
        {
          bankOrLenderName: 'HDFC Bank',
          tenureMonths: 6,
          monthlyEmiShownINR: 13334,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 3607,
          nominalInterestRateShownPa: 0,
          processingFeeShownINR: 299,
        },
        {
          bankOrLenderName: 'HDFC Bank',
          tenureMonths: 12,
          monthlyEmiShownINR: 6667,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 6527,
          nominalInterestRateShownPa: 0,
          processingFeeShownINR: 299,
        },
        {
          bankOrLenderName: 'ICICI Bank',
          tenureMonths: 9,
          monthlyEmiShownINR: 8889,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 4821,
          nominalInterestRateShownPa: 0,
          processingFeeShownINR: 199,
        },
        {
          bankOrLenderName: 'SBI Card',
          tenureMonths: 12,
          monthlyEmiShownINR: 6667,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 6522,
          nominalInterestRateShownPa: 0,
          processingFeeShownINR: 299,
        },
      ],
      detectedUiViolations: {
        dripFeesFound: [
          { label: 'EMI booking / processing fee (shown as "taxes extra")', amountINR: 299 },
          { label: '18% GST on processing fee (debited in statement)', amountINR: 53.82 },
        ],
        preTickedAddonsFound: [],
        hasFalseUrgencyTimer: false,
        hasConfirmShaming: false,
        isGstAndAprHiddenInFinePrint: true,
        explicitAprShownOnScreen: false,
      },
      rawFinePrintTextExtracted: [
        '* T&C apply. Interest, if any, will be charged by the bank.',
        '* GST on interest as applicable will be debited monthly in the statement as per prevailing tax laws.',
        '* Pre-closure charges 3% + GST. Reward points not applicable.',
        'Effective APR not disclosed on this page.',
      ],
      scannerEngineUsed: 'Instant Forensic Preset',
    },
  },
  {
    id: 'preset-bajaj-basket-sneaking',
    title: 'Bajaj Finserv Insta EMI checkout with pre-ticked warranty',
    subtitle: 'Croma · ₹42,990 TV, 0% subvented scheme, 6-month plan',
    reveals: [
      'Two pre-ticked paid add-ons (₹1,499 extended warranty + ₹899 protection) = basket sneaking',
      'Convenience fee ₹199 and e-mandate charge ₹118 charged even on a 0% down-payment scheme',
      '₹0 interest is only possible because the brand subvents it; the consumer still pays the fees',
      'NACH bounce penalty of ₹450–₹500 and annual membership fee hidden in fine print',
    ],
    mockScreenshotDataUrl: buildBajajCheckoutMock(),
    recommendedLenderKeyword: 'bajaj finserv',
    sneakedAddOnsTotal: 2398,
    extracted: {
      productName: 'UltraView 55" 4K Smart TV',
      platformName: 'Croma',
      listedProductPriceINR: 42990,
      emiOptionsShown: [
        {
          bankOrLenderName: 'Bajaj Finserv Insta EMI Card',
          tenureMonths: 6,
          monthlyEmiShownINR: 7165,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 0,
          nominalInterestRateShownPa: 0,
          processingFeeShownINR: 199,
        },
        {
          bankOrLenderName: 'Bajaj Finserv Insta EMI Card',
          tenureMonths: 12,
          monthlyEmiShownINR: 3583,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 0,
          nominalInterestRateShownPa: 15,
          processingFeeShownINR: 199,
        },
      ],
      detectedUiViolations: {
        dripFeesFound: [
          { label: 'Convenience / processing fee', amountINR: 199 },
          { label: 'e-Mandate registration fee', amountINR: 118 },
          { label: 'GST on fees (18%)', amountINR: 57 },
        ],
        preTickedAddonsFound: [
          { label: 'Extended Warranty (2 years) — pre-ticked', amountINR: 1499 },
          { label: 'Screen protection plan (auto-added)', amountINR: 899 },
        ],
        hasFalseUrgencyTimer: false,
        hasConfirmShaming: false,
        isGstAndAprHiddenInFinePrint: true,
        explicitAprShownOnScreen: false,
      },
      rawFinePrintTextExtracted: [
        '* Bounce/penal charges ₹450–₹500 on NACH mandate failure.',
        '* Annual membership fee ₹117 + GST applicable.',
        '* Bundled plans can be removed before payment only.',
        '* Effective APR of the plan is not displayed.',
      ],
      scannerEngineUsed: 'Instant Forensic Preset',
    },
  },
  {
    id: 'preset-flight-drip-pricing',
    title: 'Domestic flight booking tag-teamed with a No-Cost EMI checkout',
    subtitle: 'MakeMyTrip · ₹5,478 fare, HDFC 6-month EMI on a 1-seat booking',
    reveals: [
      '₹420 convenience fee appears for the first time on the payment step (drip pricing)',
      '₹159 seat selection auto-attached to the "no-cost" itinerary',
      '"Deal ends in 04:12 · Only 2 seats left" false urgency next to the EMI banner',
      'Confirm shaming copy: "No, I prefer to risk my trip without the protection cover"',
    ],
    mockScreenshotDataUrl: buildFlightCheckoutMock(),
    recommendedLenderKeyword: 'hdfc',
    // Only the pre-ticked seat selection is a basket-sneaking charge. The ₹420
    // convenience fee is evidenced separately by the drip-pricing rule.
    sneakedAddOnsTotal: 159,
    extracted: {
      productName: 'DEL → BOM flight, IndiGo 6E-2134, 12 Nov, 1 adult',
      platformName: 'MakeMyTrip',
      listedProductPriceINR: 5478,
      emiOptionsShown: [
        {
          bankOrLenderName: 'HDFC Bank',
          tenureMonths: 6,
          monthlyEmiShownINR: 913,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 263,
          nominalInterestRateShownPa: 0,
          processingFeeShownINR: 199,
        },
        {
          bankOrLenderName: 'ICICI Bank',
          tenureMonths: 3,
          monthlyEmiShownINR: 1826,
          isMarkedNoCost: true,
          upfrontInterestDiscountShownINR: 132,
          nominalInterestRateShownPa: 0,
          processingFeeShownINR: 199,
        },
      ],
      detectedUiViolations: {
        dripFeesFound: [
          { label: 'Convenience fee (revealed at payment step)', amountINR: 420 },
          { label: 'EMI processing fee + GST on a ₹5,478 fare', amountINR: 234.82 },
        ],
        preTickedAddonsFound: [{ label: 'Seat selection (auto-added)', amountINR: 159 }],
        hasFalseUrgencyTimer: true,
        urgencyTextFound: 'Deal ends in 04:12 · Only 2 seats left',
        hasConfirmShaming: true,
        confirmShamingTextFound:
          'No, I prefer to risk my trip without the protection cover. Continue',
        isGstAndAprHiddenInFinePrint: true,
        explicitAprShownOnScreen: false,
      },
      rawFinePrintTextExtracted: [
        '* GST @18% is levied on the monthly interest component by the bank and is not part of the advertised EMI.',
        '* Convenience fee is non-refundable on cancellation.',
        '* APR of the EMI plan is not displayed on this page.',
      ],
      scannerEngineUsed: 'Instant Forensic Preset',
    },
  },
];

export function getPresetById(id: string): DemoPreset | undefined {
  return DEMO_PRESETS.find((preset) => preset.id === id);
}
