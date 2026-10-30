/**
 * CheckMate — Module 3
 * Consumer Rights & Forbidden Promotion Database
 *
 * A structured, programmatic encoding of the Indian rules that make most
 * "No-Cost EMI" banners and checkout pages unlawful:
 *
 *  - The Consumer Protection Act, 2019 (misleading advertisement, unfair trade practice)
 *  - The CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023
 *    (Annexure 1 clauses: false urgency, basket sneaking, confirm shaming,
 *     interface interference, drip pricing)
 *  - RBI Key Facts Statement (KFS) mandate for retail loans, 2024
 *  - The GST law basis for 18% GST on the interest component of card EMIs
 *
 * Every rule carries a machine-readable triggerConditionCode consumed by
 * src/lib/complianceJudge.ts, so legal reasoning stays data-driven: adding a rule
 * here is enough to make the judge enforce it.
 */

export type ViolationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface ConsumerProtectionRule {
  ruleId: string;
  title: string;
  statuteName: string;
  sectionOrClause: string;
  severity: ViolationSeverity;
  legalDefinition: string;
  forbiddenPromotionPattern: string;
  triggerConditionCode: string;
  consumerRemedy: string;
}

/** Trigger codes evaluated by complianceJudge.ts — never hard-code strings elsewhere. */
export const RULE_TRIGGER_CODES = {
  ZERO_COST_WITHOUT_APR: 'isAdvertisedNoCostEmi === true && trueEffectiveAprPercent > 1.0 && !explicitAprShownOnScreen',
  DRIP_PRICING: 'dripFeesFound.length > 0 || totalUpfrontFee > 0',
  BASKET_SNEAKING: 'preTickedAddonsFound.length > 0',
  INTERFACE_INTERFERENCE: 'isGstAndAprHiddenInFinePrint === true',
  FALSE_URGENCY: 'hasFalseUrgencyTimer === true',
  CONFIRM_SHAMING: 'hasConfirmShaming === true',
} as const;

export const CONSUMER_PROTECTION_RULES: ConsumerProtectionRule[] = [
  {
    ruleId: 'RULE_MISLEADING_ZERO_COST',
    title: 'Misleading "No-Cost / 0% Interest" promotion without APR disclosure',
    statuteName:
      'Consumer Protection Act, 2019 (Section 2(28) — Misleading Advertisement) & RBI Circular on Key Facts Statement (KFS) for Retail Loans (2024)',
    sectionOrClause:
      'CPA 2019 Section 2(28) read with Section 2(47) (unfair trade practice); RBI KFS mandate — annualised percentage rate must be disclosed to the borrower',
    severity: 'CRITICAL',
    legalDefinition:
      'An advertisement or offer is misleading when it creates a false impression of the cost of credit. A scheme marketed as "No-Cost" or "0% interest" while the consumer unavoidably pays processing fees, 18% GST on the fee and 18% GST on every month\'s interest has a true effective APR strictly greater than zero. RBI\'s Key Facts Statement mandate requires the all-inclusive annualised cost (APR) to be disclosed prominently before the borrower commits.',
    forbiddenPromotionPattern:
      'Headline copy of "No-Cost EMI" or "0% Interest", an EMI table showing only the monthly instalment, and no all-inclusive APR figure (fees + GST + monthly GST on interest included) anywhere on the listing, EMI pop-up or checkout page.',
    triggerConditionCode: RULE_TRIGGER_CODES.ZERO_COST_WITHOUT_APR,
    consumerRemedy:
      'Written demand to the platform and lender to refund the entire hidden cost (processing fee + GST + GST on monthly interest) and to withdraw the "No-Cost" label, failing which a complaint for misleading advertisement and unfair trade practice under Section 2(28) and Section 2(47) CPA 2019 before the District Consumer Disputes Redressal Commission, plus a parallel representation to RBI and CCPA.',
  },
  {
    ruleId: 'RULE_DRIP_PRICING',
    title: 'Drip pricing (hidden convenience / packaging / processing fees)',
    statuteName:
      'CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 — Annexure 1, Clause 8 (Drip Pricing)',
    sectionOrClause:
      'Annexure 1, Clause 8 (Drip Pricing) & Section 2(47) CPA 2019 — unfair trade practice',
    severity: 'HIGH',
    legalDefinition:
      'Drip pricing is a dark pattern where a price is initially shown without unavoidable charges and the total is revealed only incrementally as the consumer proceeds, or only in the payment statement, so the real price is never compared like-for-like with the advertised price.',
    forbiddenPromotionPattern:
      'Product page or EMI banner quotes an EMI / price that excludes mandatory platform convenience fees, packaging fees, card processing fees, e-mandate registration charges or payment-gateway fees, which then surface on the final checkout screen or the credit-card statement.',
    triggerConditionCode: RULE_TRIGGER_CODES.DRIP_PRICING,
    consumerRemedy:
      'Demand a full refund of the undisclosed mandatory charges and an all-inclusive price disclosure at the listing stage. Non-compliance is reported to the Central Consumer Protection Authority (CCPA) as a dark pattern under the 2023 Guidelines, with a copy of the complaint to the platform\'s Grievance Officer within the statutory 48-hour acknowledgement window.',
  },
  {
    ruleId: 'RULE_BASKET_SNEAKING',
    title: 'Basket sneaking (pre-ticked protection plans, insurance, warranty)',
    statuteName:
      'CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 — Annexure 1, Clause 2 (Basket Sneaking)',
    sectionOrClause: 'Annexure 1, Clause 2 (Basket Sneaking)',
    severity: 'HIGH',
    legalDefinition:
      'Basket sneaking is the inclusion of additional paid items, services, donations or add-ons in a cart or EMI plan without the explicit informed consent of the user, typically through pre-ticked checkboxes, bundled insurance or silently applied plans.',
    forbiddenPromotionPattern:
      'Extended warranty, device protection, credit shield, travel insurance or donation amounts pre-selected (pre-ticked) in the EMI/cart summary, with the opt-out is buried or worded to shame the user.',
    triggerConditionCode: RULE_TRIGGER_CODES.BASKET_SNEAKING,
    consumerRemedy:
      'Demand immediate removal and refund of every sneaked item as an unauthorised charge, in writing to the platform, with escalation to the CCPA and to the card issuer as a disputed charge. Consent obtained without an unfailingly affirmative action is not valid consent.',
  },
  {
    ruleId: 'RULE_INTERFACE_INTERFERENCE',
    title: 'Interface interference & fine-print obfuscation of GST and APR',
    statuteName:
      'CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 — Annexure 1, Clause 6 (Interface Interference)',
    sectionOrClause: 'Annexure 1, Clause 6 (Interface Interference)',
    severity: 'HIGH',
    legalDefinition:
      'Interface interference manipulates the presentation of information — through prominence, colour contrast, hidden expansion, or low-visibility fine print — to prevent the user from making a free and informed choice.',
    forbiddenPromotionPattern:
      '"₹0 Interest / No Cost EMI" rendered in bold high-contrast type while the 18% GST on the monthly interest component, the processing-fee GST and the all-inclusive APR are buried in collapsed tooltips, low-contrast footnotes, asterisked disclaimers or a separate terms page.',
    triggerConditionCode: RULE_TRIGGER_CODES.INTERFACE_INTERFERENCE,
    consumerRemedy:
      'Demand that the all-inclusive cost, the GST treatment and the APR be presented with equal or greater prominence than the "0%" claim, and report the interface treatment to the CCPA as interface interference under the 2023 Guidelines.',
  },
  {
    ruleId: 'RULE_FALSE_URGENCY',
    title: 'False urgency & scarcity pressure on an EMI offer',
    statuteName:
      'CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 — Annexure 1, Clause 1 (False Urgency)',
    sectionOrClause: 'Annexure 1, Clause 1 (False Urgency)',
    severity: 'MEDIUM',
    legalDefinition:
      'False urgency is the use of countdown timers, "deal ends in", artificial scarcity warnings or unverified low-stock claims to create a false sense of urgency so the consumer skips reading the fine print of an offer.',
    forbiddenPromotionPattern:
      'A descending timer ("Deal ends in 04:12"), "Only 1 left at this EMI", or a "price rising soon" badge positioned next to the No-Cost EMI call-to-action, pressuring the consumer past the EMI terms and the add-on opt-outs.',
    triggerConditionCode: RULE_TRIGGER_CODES.FALSE_URGENCY,
    consumerRemedy:
      'Document the timer with timestamps and report the false urgency pattern to the CCPA. Where the offer was in fact unrestricted, the same conduct constitutes a misleading advertisement under Section 2(28) CPA 2019.',
  },
  {
    ruleId: 'RULE_CONFIRM_SHAMING',
    title: 'Confirm shaming on the EMI opt-out button',
    statuteName:
      'CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 — Annexure 1, Clause 3 (Confirm Shaming)',
    sectionOrClause: 'Annexure 1, Clause 3 (Confirm Shaming)',
    severity: 'MEDIUM',
    legalDefinition:
      'Confirm shaming uses guilt, fear, ridicule or societal pressure in the wording of a decline/opt-out action so that the user is emotionally coerced into accepting an add-on or an offer they did not want.',
    forbiddenPromotionPattern:
      'Opt-out copy such as "No, I prefer to risk my ₹70,000 phone without protection", "No thanks, I don\'t want to save money" or "Skip and pay more later", instead of a neutral "No, continue without protection".',
    triggerConditionCode: RULE_TRIGGER_CODES.CONFIRM_SHAMING,
    consumerRemedy:
      'Demand replacement of the coercive copy with neutral opt-out language and report the confirm shaming pattern to the CCPA under the 2023 Guidelines; treat any resulting add-on charge as an unauthorised charge for refund.',
  },
];

export function getRuleById(ruleId: string): ConsumerProtectionRule | undefined {
  return CONSUMER_PROTECTION_RULES.find((rule) => rule.ruleId === ruleId);
}

export function getRulesBySeverity(severity: ViolationSeverity): ConsumerProtectionRule[] {
  return CONSUMER_PROTECTION_RULES.filter((rule) => rule.severity === severity);
}

export const SEVERITY_LABELS: Record<ViolationSeverity, string> = {
  CRITICAL: 'Critical — statutory consumer harm',
  HIGH: 'High — CCPA dark pattern',
  MEDIUM: 'Medium — unfair interface practice',
};

export const SEVERITY_WEIGHT: Record<ViolationSeverity, number> = {
  CRITICAL: 45,
  HIGH: 25,
  MEDIUM: 12,
};

/** Statutory reporting channels referenced by the generated dossier. */
export const REDRESSAL_CHANNELS = {
  nationalHelpline: 'National Consumer Helpline (NCH) — dial 1915 or file at consumerhelpline.gov.in',
  ccpa: 'Central Consumer Protection Authority (CCPA) — dark patterns and misleading advertisements',
  rbi: 'Reserve Bank of India — Consumer Education & Protection Department (Key Facts Statement violations)',
} as const;
