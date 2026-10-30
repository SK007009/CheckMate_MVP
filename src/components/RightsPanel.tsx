import { CheckCircle2, FileText, Gavel, ScrollText, ShieldAlert } from 'lucide-react';
import type { ComplianceVerdict } from '../lib/complianceJudge';
import type { ExtractedScreenshotData } from '../services/visionScanner';
import { formatINR, formatPercent } from '../lib/format';
import { Badge, Button, Panel } from './ui';

export interface RightsPanelProps {
  verdict: ComplianceVerdict;
  extracted: ExtractedScreenshotData | null;
  onOpenDossier: () => void;
  hasAudit: boolean;
}

export function RightsPanel({ verdict, extracted, onOpenDossier, hasAudit }: RightsPanelProps) {
  const riskTone =
    verdict.riskLevel === 'CRITICAL'
      ? 'danger'
      : verdict.riskLevel === 'SEVERE'
        ? 'danger'
        : verdict.riskLevel === 'MODERATE'
          ? 'warn'
          : 'good';

  const scoreColor =
    verdict.legalityScore >= 80 ? '#2ee6a8' : verdict.legalityScore >= 55 ? '#ffb020' : '#ff5c68';

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Promotional Legality Score"
        step="05"
        icon={<Gavel size={15} />}
        subtitle="Judged against the CCPA Dark Patterns Guidelines 2023, the Consumer Protection Act 2019 and the RBI Key Facts Statement mandate."
      >
        <div className="flex items-center gap-4">
          <div
            className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(${scoreColor} ${verdict.legalityScore * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
            }}
          >
            <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-[#0d1117]">
              <span className="num text-xl font-bold text-term-text">{verdict.legalityScore}</span>
              <span className="text-[9px] tracking-widest text-term-muted uppercase">/ 100</span>
            </div>
          </div>
          <div className="min-w-0">
            <Badge tone={riskTone as 'danger' | 'warn' | 'good'}>{verdict.verdictLabel}</Badge>
            <p className="mt-2 text-[11.5px] leading-relaxed text-term-text">{verdict.headline}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {verdict.criticalCount > 0 ? (
                <Badge tone="danger">{verdict.criticalCount} critical</Badge>
              ) : null}
              {verdict.highCount > 0 ? <Badge tone="danger">{verdict.highCount} high</Badge> : null}
              {verdict.mediumCount > 0 ? <Badge tone="warn">{verdict.mediumCount} medium</Badge> : null}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-term-line bg-black/25 px-3 py-2.5">
            <div className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
              Claimed interest
            </div>
            <div className="num mt-1 text-base font-bold text-term-text">
              {extracted?.emiOptionsShown.some((option) => option.isMarkedNoCost) ? '0%' : 'As shown'}
            </div>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2.5">
            <div className="text-[10px] font-semibold tracking-widest text-rose-200/80 uppercase">
              True effective APR
            </div>
            <div className="num mt-1 text-base font-bold text-rose-300">
              {formatPercent(verdict.trueEffectiveAprPercent)}
            </div>
          </div>
        </div>

        <Button className="mt-4 w-full" onClick={onOpenDossier} disabled={!hasAudit}>
          <FileText size={14} /> Generate NCH 1915 Dispute Dossier
        </Button>
        <p className="mt-2 text-[10px] leading-relaxed text-term-muted">
          Auto-populated complaint letter with the month-by-month mathematical proof, the statute behind each
          violation, and the relief sought. Copy it or download as .txt.
        </p>
      </Panel>

      <Panel
        title="Statutory Violations Detected"
        icon={<ShieldAlert size={15} />}
        subtitle={
          verdict.violations.length > 0
            ? `${verdict.violations.length} finding(s) with the exact clause and the rupee proof behind each.`
            : 'No forbidden promotion pattern was triggered by this screenshot.'
        }
      >
        {verdict.violations.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-3 py-3 text-[11px] leading-relaxed text-emerald-200">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            Every rule in the database passed for this screenshot: the all-inclusive cost, the GST treatment and any
            add-ons appear to be disclosed. Load a demo preset to see the judge in action.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {verdict.violations.map((finding) => {
              const { rule } = finding;
              const tone =
                rule.severity === 'CRITICAL'
                  ? { border: 'border-rose-500/40', bg: 'bg-rose-500/5', text: 'text-rose-200', badge: 'danger' as const }
                  : rule.severity === 'HIGH'
                    ? { border: 'border-rose-400/30', bg: 'bg-rose-400/5', text: 'text-rose-100', badge: 'danger' as const }
                    : { border: 'border-amber-400/35', bg: 'bg-amber-400/5', text: 'text-amber-100', badge: 'warn' as const };
              return (
                <li key={rule.ruleId} className={`rounded-xl border ${tone.border} ${tone.bg} p-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`text-xs font-bold ${tone.text}`}>{rule.title}</h3>
                    <Badge tone={tone.badge}>{rule.severity}</Badge>
                  </div>
                  <p className="num mt-2 text-[10px] leading-relaxed text-term-muted">{rule.ruleId}</p>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-term-text">
                    <span className="font-semibold">Statute:</span> {rule.statuteName}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-term-muted">
                    <span className="font-semibold text-term-text">Clause:</span> {rule.sectionOrClause}
                  </p>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-term-muted">
                    <span className="font-semibold text-term-text">Pattern:</span> {rule.forbiddenPromotionPattern}
                  </p>

                  <div className="mt-2">
                    <div className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
                      Evidence
                    </div>
                    <ul className="mt-1 space-y-1">
                      {finding.evidence.map((line) => (
                        <li key={line} className="text-[10.5px] leading-relaxed text-term-text">
                          • {line}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {finding.mathProof.length > 0 ? (
                    <div className="mt-2">
                      <div className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
                        Rupee proof
                      </div>
                      <ul className="mt-1 space-y-1">
                        {finding.mathProof.map((line) => (
                          <li key={line} className="num text-[10.5px] leading-relaxed text-amber-200">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <p className="mt-2 border-t border-white/5 pt-2 text-[10.5px] leading-relaxed text-emerald-200/90">
                    <span className="font-semibold">Remedy:</span> {rule.consumerRemedy}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {extracted && extracted.rawFinePrintTextExtracted.length > 0 ? (
        <Panel
          title="Fine Print the Model Read"
          icon={<ScrollText size={15} />}
          subtitle="Obfuscated clauses extracted from the screenshot — this is where the GST and penalty terms usually live."
        >
          <ul className="space-y-1.5">
            {extracted.rawFinePrintTextExtracted.map((line) => (
              <li
                key={line}
                className="num rounded-lg border border-term-line bg-black/30 px-3 py-2 text-[10px] leading-relaxed text-term-muted"
              >
                {line}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title="Rule Engine Coverage"
        icon={<ShieldAlert size={15} />}
        subtitle={`${verdict.allFindings.length} rules evaluated · ${verdict.violations.length} triggered · hidden cost measured at ${formatINR(
          verdict.hiddenExtraCost,
        )}.`}
      >
        <ul className="space-y-1.5">
          {verdict.allFindings.map((finding) => (
            <li
              key={finding.rule.ruleId}
              className="flex items-center justify-between gap-3 rounded-lg border border-term-line bg-black/25 px-3 py-2"
            >
              <span className="text-[10.5px] leading-snug text-term-text">
                {finding.rule.ruleId.replace('RULE_', '').replace(/_/g, ' ')}
              </span>
              {finding.triggered ? (
                <Badge tone="danger">triggered</Badge>
              ) : (
                <Badge tone="good">passed</Badge>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
