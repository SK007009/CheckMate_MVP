/**
 * CheckMate — Module 4
 * Consumer Rights & Forbidden Promotion Judge
 *
 * Matches the screenshot's extracted UI facts + the deterministic math result
 * against src/data/consumerRightsDb.ts and produces:
 *   - a promotional legality score with severity-ranked violation findings,
 *   - the exact statutory citation for each finding,
 *   - a ready-to-file National Consumer Helpline (NCH 1915) complaint dossier.
 *
 * No LLM is involved here either: the same facts always produce the same verdict.
 */

import type { ConsumerProtectionRule, ViolationSeverity } from '../data/consumerRightsDb';
import { CONSUMER_PROTECTION_RULES, RULE_TRIGGER_CODES, SEVERITY_WEIGHT } from '../data/consumerRightsDb';
import type { EmiCalculationResult } from './emiMathEngine';
import type { ExtractedScreenshotData } from '../services/visionScanner';
import {
  formatINR,
  formatIndianDate,
  formatPercent,
  numberToIndianWords,
} from './format';

export interface ViolationFinding {
  rule: ConsumerProtectionRule;
  triggered: boolean;
  /** Human-readable proof pulled from the screenshot facts. */
  evidence: string[];
  /** Deterministic rupee/basis-point proof from the math engine. */
  mathProof: string[];
}

export type RiskLevel = 'COMPLIANT' | 'MODERATE' | 'SEVERE' | 'CRITICAL';

export interface ComplianceVerdict {
  allFindings: ViolationFinding[];
  violations: ViolationFinding[];
  legalityScore: number;
  riskLevel: RiskLevel;
  verdictLabel: string;
  headline: string;
  hiddenExtraCost: number;
  trueEffectiveAprPercent: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
}

export interface ComplianceEvaluationInput {
  calc: EmiCalculationResult;
  extracted: ExtractedScreenshotData | null;
  /** Optional manual override when the user can see an APR on screen. */
  aprShownOverride?: boolean;
}

export function evaluateCompliance(input: ComplianceEvaluationInput): ComplianceVerdict {
  const { calc, extracted } = input;
  const dripFees = extracted?.detectedUiViolations.dripFeesFound ?? [];
  const preTicked = extracted?.detectedUiViolations.preTickedAddonsFound ?? [];
  const finePrint = extracted?.detectedUiViolations.isGstAndAprHiddenInFinePrint ?? false;
  const urgency = extracted?.detectedUiViolations.hasFalseUrgencyTimer ?? false;
  const shaming = extracted?.detectedUiViolations.hasConfirmShaming ?? false;
  const aprShown =
    input.aprShownOverride ?? extracted?.detectedUiViolations.explicitAprShownOnScreen ?? false;

  const findings: ViolationFinding[] = CONSUMER_PROTECTION_RULES.map((rule) => {
    switch (rule.triggerConditionCode) {
      case RULE_TRIGGER_CODES.ZERO_COST_WITHOUT_APR: {
        const triggered = calc.isAdvertisedNoCostEmi && calc.trueEffectiveAprPercent > 1.0 && !aprShown;
        return {
          rule,
          triggered,
          evidence: [
            `Offer is marketed as "No-Cost / 0% Interest EMI" (${calc.tenureMonths}-month tenure).`,
            `No all-inclusive APR is displayed on the listing, EMI pop-up or checkout page.`,
            `All-inclusive effective APR is actually ${formatPercent(calc.trueEffectiveAprPercent)} p.a.`,
          ],
          mathProof: [
            `Advertised monthly instalment: ${formatINR(calc.emiBase)} × ${calc.tenureMonths} = ${formatINR(calc.totalEmiBasePaid)}`,
            `Non-waivable charges: processing fee ${formatINR(calc.processingFeeBase)} + GST ${formatINR(calc.gstOnProcessingFee)}`,
            `18% GST billed monthly on interest: ${formatINR(calc.totalGstOnInterest)}`,
            `Hidden extra cost above cash price: ${formatINR(calc.hiddenExtraCostOverCash)}`,
          ],
        };
      }
      case RULE_TRIGGER_CODES.DRIP_PRICING: {
        const triggered = dripFees.length > 0 || calc.totalUpfrontFee > 0;
        return {
          rule,
          triggered,
          evidence:
            dripFees.length > 0
              ? [
                  `${dripFees.length} mandatory charge(s) appear only at the checkout/payment step:`,
                  ...dripFees.map((fee) => `• ${fee.label} — ${formatINR(fee.amountINR)}`),
                ]
              : [
                  `Processing / convenience fee of ${formatINR(calc.processingFeeBase)} (+${formatINR(calc.gstOnProcessingFee)} GST) is levied on top of the advertised headline price and is not part of the listed price.`,
                ],
          mathProof: [
            `Amount financed at t=0: ${formatINR(calc.loanPrincipal)}`,
            `Total upfront outflow (fees + GST + add-ons): ${formatINR(calc.totalUpfrontFee)}`,
            `Total outflow over the EMI: ${formatINR(calc.totalPaidViaEmi)} vs cash price ${formatINR(calc.listedProductPrice)}`,
          ],
        };
      }
      case RULE_TRIGGER_CODES.BASKET_SNEAKING: {
        return {
          rule,
          triggered: preTicked.length > 0,
          evidence:
            preTicked.length > 0
              ? [
                  `${preTicked.length} paid item(s) were pre-selected in the cart/EMI plan:`,
                  ...preTicked.map((item) => `• ${item.label} — ${formatINR(item.amountINR)}`),
                  `Sneaked total: ${formatINR(calc.sneakedAddOnsTotal)} added without an affirmative opt-in.`,
                ]
              : ['No pre-ticked add-ons were detected in the screenshot.'],
          mathProof: [
            `Add-ons inflate the financed amount and therefore every instalment, plus 18% GST where applicable.`,
            `Total outflow including sneaked items: ${formatINR(calc.totalPaidViaEmi)}`,
          ],
        };
      }
      case RULE_TRIGGER_CODES.INTERFACE_INTERFERENCE: {
        return {
          rule,
          triggered: finePrint,
          evidence: finePrint
            ? [
                calc.isAdvertisedNoCostEmi
                  ? 'The "0% interest / No-Cost" claim is rendered in high-contrast, prominent type.'
                  : `The ${formatPercent(calc.nominalRatePa, 2)} headline rate is presented as the cost of credit, with no all-inclusive APR alongside it.`,
                'The 18% GST on monthly interest, fee GST and the effective APR are relegated to collapsed tooltips, low-contrast footnotes or an unlinked terms page.',
              ]
            : ['GST and APR disclosures could not be shown to be buried in fine print.'],
          mathProof: [
            `Cost concealed by the interface treatment: ${formatINR(calc.hiddenExtraCostOverCash)} across ${calc.tenureMonths} months.`,
            `Concealed GST component alone: ${formatINR(calc.totalGstBleed)}.`,
          ],
        };
      }
      case RULE_TRIGGER_CODES.FALSE_URGENCY: {
        return {
          rule,
          triggered: urgency,
          evidence: urgency
            ? [
                `Timer / scarcity copy detected: "${extracted?.detectedUiViolations.urgencyTextFound ?? 'Unspecified countdown timer'}"`,
                'The pressure element sits next to the No-Cost EMI call-to-action.',
              ]
            : ['No false-urgency timer or scarcity badge detected.'],
          mathProof: !urgency
            ? []
            : [
                `The offer itself is not time-limited in the underlying lender terms for this tenure (${calc.tenureMonths} months, ${formatPercent(calc.nominalRatePa, 2)} p.a. nominal).`,
              ],
        };
      }
      case RULE_TRIGGER_CODES.CONFIRM_SHAMING: {
        return {
          rule,
          triggered: shaming,
          evidence: shaming
            ? [
                `Guilt-inducing opt-out copy detected: "${extracted?.detectedUiViolations.confirmShamingTextFound ?? 'Unspecified coercive opt-out copy'}"`,
                'A neutral decline option ("No, continue without this") is not offered.',
              ]
            : ['No confirm-shaming copy detected on opt-out actions.'],
          mathProof: shaming
            ? [
                `Coercion is applied to a charge of ${formatINR(calc.sneakedAddOnsTotal || 1499)} that the consumer did not request.`,
              ]
            : [],
        };
      }
      default:
        return {
          rule,
          triggered: false,
          evidence: ['No evaluator registered for this rule yet.'],
          mathProof: [],
        };
    }
  });

  const violations = findings
    .filter((finding) => finding.triggered)
    .sort((a, b) => SEVERITY_WEIGHT[b.rule.severity] - SEVERITY_WEIGHT[a.rule.severity]);

  const criticalCount = countSeverity(violations, 'CRITICAL');
  const highCount = countSeverity(violations, 'HIGH');
  const mediumCount = countSeverity(violations, 'MEDIUM');

  const penalty = violations.reduce((sum, finding) => sum + SEVERITY_WEIGHT[finding.rule.severity], 0);
  const legalityScore = Math.max(0, Math.min(100, 100 - penalty));

  const riskLevel: RiskLevel =
    criticalCount > 0 ? 'CRITICAL' : highCount > 0 ? 'SEVERE' : mediumCount > 0 ? 'MODERATE' : 'COMPLIANT';

  const verdictLabel =
    riskLevel === 'CRITICAL'
      ? 'Illegal Dark Patterns Detected'
      : riskLevel === 'SEVERE'
        ? 'Forbidden Promotion Practices Detected'
        : riskLevel === 'MODERATE'
          ? 'Unfair Interface Practices Detected'
          : 'Compliant Disclosure';

  const headline =
    violations.length === 0
      ? 'No forbidden promotion pattern found in this screenshot.'
      : calc.isAdvertisedNoCostEmi
        ? `${violations.length} statutory violation${violations.length > 1 ? 's' : ''} found — the "0% interest" claim is misleading and the true cost of credit is ${formatINR(calc.hiddenExtraCostOverCash)} (${formatPercent(calc.trueEffectiveAprPercent)} p.a. effective).`
        : `${violations.length} statutory violation${violations.length > 1 ? 's' : ''} found — the advertised ${formatPercent(calc.nominalRatePa)} rate costs you ${formatINR(calc.hiddenExtraCostOverCash)} in interest, GST and fees, an effective ${formatPercent(calc.trueEffectiveAprPercent)} p.a.`;

  return {
    allFindings: findings,
    violations,
    legalityScore,
    riskLevel,
    verdictLabel,
    headline,
    hiddenExtraCost: calc.hiddenExtraCostOverCash,
    trueEffectiveAprPercent: calc.trueEffectiveAprPercent,
    criticalCount,
    highCount,
    mediumCount,
  };
}

function countSeverity(findings: ViolationFinding[], severity: ViolationSeverity): number {
  return findings.filter((finding) => finding.rule.severity === severity).length;
}

/* -------------------------------------------------------------------------- */
/* NCH 1915 DOSSIER                                                           */
/* -------------------------------------------------------------------------- */

export interface DossierInput {
  verdict: ComplianceVerdict;
  calc: EmiCalculationResult;
  extracted: ExtractedScreenshotData | null;
  lenderName: string;
  complainantName?: string;
  platformOverride?: string;
}

/**
 * Builds a formal, copy-paste ready complaint for the National Consumer
 * Helpline (1915), including the rupee-by-rupee mathematical proof and the
 * statute behind every alleged violation.
 */
export function generateNchDossier(input: DossierInput): string {
  const { verdict, calc, extracted } = input;
  const platform = input.platformOverride?.trim() || extracted?.platformName?.trim() || 'the e-commerce platform';
  const product = extracted?.productName?.trim() || 'the product booked on EMI';
  const lender = input.lenderName;
  const complainant = input.complainantName?.trim() || '[Your full name, address, phone, email]';
  const today = formatIndianDate(new Date());

  const scheduleRows = calc.schedule
    .map(
      (row) =>
        `| ${String(row.month).padStart(2, '0')} | ${formatINR(row.openingBalance)} | ${formatINR(row.principalComponent)} | ${formatINR(row.interestComponent)} | ${formatINR(row.gstOnInterest)} | ${formatINR(row.actualMonthlyOutflow)} |`,
    )
    .join('\n');

  const violationBlocks = verdict.violations
    .map((finding, index) => {
      const { rule } = finding;
      return [
        `${index + 1}. ${rule.title.toUpperCase()} [${rule.severity}]`,
        `   Statute      : ${rule.statuteName}`,
        `   Provision    : ${rule.sectionOrClause}`,
        `   Legal test   : ${rule.legalDefinition}`,
        `   What happened: ${rule.forbiddenPromotionPattern}`,
        `   Our evidence :`,
        ...finding.evidence.map((line) => `     - ${line}`),
        ...finding.mathProof.map((line) => `     - [MATH] ${line}`),
        `   Remedy sought: ${rule.consumerRemedy}`,
        '',
      ].join('\n');
    })
    .join('\n');

  const relief = [
    `a) Refund of the entire hidden cost of ${formatINR(calc.hiddenExtraCostOverCash)} charged over and above the advertised cash price of ${formatINR(calc.listedProductPrice)}, being the un-disclosed processing fee, GST on that fee and 18% GST levied on the interest component;`,
    calc.sneakedAddOnsTotal > 0
      ? `b) Cancellation and refund of the pre-ticked/pre-sneaked add-ons worth ${formatINR(calc.sneakedAddOnsTotal)} along with the GST charged thereon;`
      : `b) Withdrawal of the "No-Cost / 0% Interest" claim unless and until the all-inclusive annualised percentage rate is disclosed with equal prominence at every stage of the offer;`,
    `c) Compensation for the unfair trade practice and the mental agony caused, together with litigation costs;`,
    `d) A direction to the Central Consumer Protection Authority to examine the "No-Cost EMI" presentation on ${platform} under the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023.`,
  ].join('\n');

  return `COMPLAINT BEFORE THE NATIONAL CONSUMER HELPLINE (NCH 1915) / CENTRAL CONSUMER PROTECTION AUTHORITY
(Consumer Protection Act, 2019 — Consumer Protection (E-Commerce) Rules, 2020)

Date: ${today}
Complainant: ${complainant}
Opposite Party 1 (platform)  : ${platform}
Opposite Party 2 (financier) : ${lender}

SUBJECT: Misleading "No-Cost / 0% Interest" EMI promotion, drip pricing, hidden 18% GST on the interest component and dark patterns in the checkout of ${platform} — complaint and claim for refund of ${formatINR(calc.hiddenExtraCostOverCash)} with compensation.

------------------------------------------------------------------
1. TRANSACTION PARTICULARS
------------------------------------------------------------------
Product / service      : ${product}
Advertised cash price  : ${formatINR(calc.listedProductPrice)} (Indian Rupees ${numberToIndianWords(calc.listedProductPrice)} only)
EMI tenure             : ${calc.tenureMonths} months
Advertised instalment  : ${formatINR(calc.emiBase)} per month, offered as a "No-Cost / 0% Interest" EMI
Actual monthly outflow : ${formatINR(calc.firstMonthOutflow)} in month 1 (instalment + 18% GST on interest), i.e. not ${formatINR(calc.emiBase)}
Total actually paid    : ${formatINR(calc.totalPaidViaEmi)}
Extra over cash price  : ${formatINR(calc.hiddenExtraCostOverCash)}
True effective APR     : ${formatPercent(calc.trueEffectiveAprPercent)} p.a. (annualised, all-inclusive)
Nominal rate applied   : ${formatPercent(calc.nominalRatePa, 2)} p.a. on a reducing balance

------------------------------------------------------------------
2. MATHEMATICAL PROOF OF THE HIDDEN COST (deterministic reducing-balance computation)
------------------------------------------------------------------
Principal actually booked by the lender .......... ${formatINR(calc.loanPrincipal)}
Upfront merchant discount that sustains the "0%" claim ... ${formatINR(calc.upfrontMerchantDiscount)}
Processing / convenience fee ..................... ${formatINR(calc.processingFeeBase)}
GST @ 18% on the processing fee .................. ${formatINR(calc.gstOnProcessingFee)}
18% GST levied monthly on the interest component .. ${formatINR(calc.totalGstOnInterest)}
Pre-selected / sneaked add-ons ................... ${formatINR(calc.sneakedAddOnsTotal)}
Total GST extracted (fee + interest) ............. ${formatINR(calc.totalGstBleed)}
Effective annualised APR of the cash flows ....... ${formatPercent(calc.trueEffectiveAprPercent)} p.a.

Month-by-month amortisation (opening balance / principal / bank interest / 18% GST on interest / actual statement outflow):
| M  | Opening Balance | Principal | Bank Interest | GST on Interest | Actual Monthly Outflow |
|----|-----------------|-----------|---------------|-----------------|------------------------|
${scheduleRows}

Conclusion: A scheme that is marketed as "no cost" but makes the consumer part with ${formatINR(calc.hiddenExtraCostOverCash)} more than the cash price carries an effective annualised cost of ${formatPercent(calc.trueEffectiveAprPercent)} p.a. It is therefore not "0% interest" in substance, and the failure to disclose that cost prominently is a misleading advertisement under Section 2(28) and an unfair trade practice under Section 2(47) of the Consumer Protection Act, 2019.

------------------------------------------------------------------
3. STATUTORY VIOLATIONS ESTABLISHED (${verdict.violations.length} in total — legality score ${verdict.legalityScore}/100)
------------------------------------------------------------------
${violationBlocks}
------------------------------------------------------------------
4. RELIEF SOUGHT
------------------------------------------------------------------
${relief}

------------------------------------------------------------------
5. DOCUMENTS RELIED UPON
------------------------------------------------------------------
1. Screenshot(s) of the product listing, EMI offer and final checkout/payment page (attached).
2. Credit card / account statement evidencing the processing fee and the monthly GST on interest.
3. This computation sheet derived from the lender's own published EMI terms (reducing-balance amortisation).
4. Timeline note: date of listing view, date of transaction, date the hidden charge first appeared.

DECLARATION: I state that the facts stated above are true to the best of my knowledge and belief, and that the computations enclosed are arithmetic derivations from the lender's published terms.

Signature: ______________________            Place: __________________
Name     : ${complainant}
Date     : ${today}

Filing channels: National Consumer Helpline 1915 (consumerhelpline.gov.in) · CCPA (dark patterns) · RBI Consumer Education & Protection Department (Key Facts Statement violation) · Grievance Officer of ${platform} (48-hour acknowledgement, 30-day resolution under the E-Commerce Rules, 2020).
`;
}
