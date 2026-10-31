import { useState } from 'react';
import { Database, Download, FileJson, Plus, Scale, Trash2, Upload } from 'lucide-react';
import type { BankEmiProfile, LenderType } from '../data/bankPlansDb';
import {
  describeProcessingFee,
  exportBankProfilesJson,
  getAllBankProfiles,
  importBankProfilesFromJson,
  registerNewBankProfile,
  removeCustomBankProfile,
  validateBankProfile,
} from '../data/bankPlansDb';
import { CONSUMER_PROTECTION_RULES, SEVERITY_WEIGHT } from '../data/consumerRightsDb';
import { Badge, Button, Modal } from './ui';

interface DraftBank {
  id: string;
  displayName: string;
  aliases: string;
  lenderType: LenderType;
  feeType: 'FLAT' | 'PERCENTAGE' | 'HIGHER_OF_BOTH';
  flatAmountINR: string;
  percentageRate: string;
  gstApplicableOnFee: boolean;
  ratesText: string;
  gstOnMonthlyInterestPercent: string;
  foreclosurePenaltyPercent: string;
  rewardPointsBlockedOnEmi: boolean;
  hiddenClausesText: string;
}

const EMPTY_DRAFT: DraftBank = {
  id: '',
  displayName: '',
  aliases: '',
  lenderType: 'CREDIT_CARD',
  feeType: 'FLAT',
  flatAmountINR: '199',
  percentageRate: '0',
  gstApplicableOnFee: true,
  ratesText: '3: 15.5, 6: 15.5, 9: 15.5, 12: 15.5, 18: 15.5, 24: 15.5',
  gstOnMonthlyInterestPercent: '18',
  foreclosurePenaltyPercent: '3',
  rewardPointsBlockedOnEmi: true,
  hiddenClausesText: 'Processing fee + 18% GST billed in the first statement\n18% GST charged monthly on the interest component',
};

/** Parses "3: 15.5, 6: 16" (or a JSON object) into a tenure→rate map. */
function parseRates(input: string): Record<number, number> {
  const trimmed = input.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, number>;
      const result: Record<number, number> = {};
      for (const [tenure, rate] of Object.entries(parsed)) {
        result[Number(tenure)] = Number(rate);
      }
      return result;
    } catch {
      return {};
    }
  }
  const result: Record<number, number> = {};
  for (const chunk of trimmed.split(/[,;\n]/)) {
    const [tenure, rate] = chunk.split(/[:=]/);
    const months = Number.parseFloat((tenure ?? '').trim());
    const value = Number.parseFloat((rate ?? '').trim());
    if (Number.isFinite(months) && months > 0 && Number.isFinite(value)) {
      result[Math.round(months)] = value;
    }
  }
  return result;
}

export function DatabaseModal({
  open,
  onClose,
  onDatabaseChanged,
}: {
  open: boolean;
  onClose: () => void;
  onDatabaseChanged: () => void;
}) {
  const [tab, setTab] = useState<'banks' | 'laws'>('banks');
  const [draft, setDraft] = useState<DraftBank>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const profiles = getAllBankProfiles();

  function updateDraft(patch: Partial<DraftBank>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function submitDraft() {
    setNotice(null);
    const profile: BankEmiProfile = {
      id: draft.id.trim().toLowerCase().replace(/\s+/g, '-'),
      displayName: draft.displayName.trim(),
      aliases: draft.aliases
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
      lenderType: draft.lenderType,
      processingFee: {
        type: draft.feeType,
        flatAmountINR: Number.parseFloat(draft.flatAmountINR) || 0,
        percentageRate: Number.parseFloat(draft.percentageRate) || 0,
        gstApplicableOnFee: draft.gstApplicableOnFee,
      },
      nominalInterestRatesPa: parseRates(draft.ratesText),
      gstOnMonthlyInterestPercent: Number.parseFloat(draft.gstOnMonthlyInterestPercent) || 0,
      foreclosurePenaltyPercent: Number.parseFloat(draft.foreclosurePenaltyPercent) || 0,
      rewardPointsBlockedOnEmi: draft.rewardPointsBlockedOnEmi,
      hiddenClauses: draft.hiddenClausesText
        .split('\n')
        .map((clause) => clause.trim())
        .filter(Boolean),
      isCustomUserAdded: true,
    };

    const validation = validateBankProfile(profile);
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }

    try {
      registerNewBankProfile(profile);
      setErrors([]);
      setNotice(`Registered "${profile.displayName}" — it is now selectable in the audit overrides and the comparison matrix.`);
      setDraft(EMPTY_DRAFT);
      onDatabaseChanged();
    } catch (error) {
      setErrors([(error as Error).message]);
    }
  }

  function handleImport() {
    const { added, errors: importErrors } = importBankProfilesFromJson(importText);
    setErrors(importErrors);
    setNotice(added > 0 ? `Imported ${added} bank profile(s).` : null);
    if (added > 0) {
      setImportText('');
      setShowImport(false);
      onDatabaseChanged();
    }
  }

  function handleExport() {
    const json = exportBankProfilesJson();
    void navigator.clipboard?.writeText(json);
    setNotice('Full lender database copied to the clipboard as JSON (seeds + custom entries).');
  }

  function handleDelete(id: string) {
    removeCustomBankProfile(id);
    setNotice('Custom bank profile removed. Seed profiles cannot be deleted.');
    onDatabaseChanged();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Manage Bank & Legal Databases"
      subtitle="Inspect the extensible lender records and the statutory rule set, and register a new bank EMI plan live — the math engine and judge pick it up immediately."
    >
      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'banks' ? 'primary' : 'outline'} onClick={() => setTab('banks')}>
          <Database size={13} /> Lender database ({profiles.length})
        </Button>
        <Button variant={tab === 'laws' ? 'primary' : 'outline'} onClick={() => setTab('laws')}>
          <Scale size={13} /> Legal rule database ({CONSUMER_PROTECTION_RULES.length})
        </Button>
      </div>

      {notice ? (
        <p className="mb-3 rounded-lg border border-blue-400/30 bg-blue-400/5 px-3 py-2 text-[11px] text-blue-200">
          {notice}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul className="mb-3 space-y-1 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
          {errors.map((error) => (
            <li key={error} className="text-[11px] leading-relaxed text-rose-200">
              • {error}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'banks' ? (
        <div className="flex flex-col gap-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="text-[10px] tracking-widest text-term-muted uppercase">
                  <th className="pb-2">id / name</th>
                  <th className="pb-2">aliases (OCR match)</th>
                  <th className="pb-2">type</th>
                  <th className="pb-2">processing fee</th>
                  <th className="pb-2 text-right">rates % p.a.</th>
                  <th className="pb-2 text-right">GST on interest</th>
                  <th className="pb-2 text-right">foreclosure</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-t border-term-line/70 align-top">
                    <td className="py-2 pr-3">
                      <span className="num block text-[10px] text-term-muted">{profile.id}</span>
                      <span className="block font-semibold text-term-text">{profile.displayName}</span>
                      {profile.isCustomUserAdded ? <Badge tone="info">custom</Badge> : null}
                    </td>
                    <td className="py-2 pr-3 text-[10.5px] text-term-muted">{profile.aliases.join(', ') || '—'}</td>
                    <td className="num py-2 pr-3 text-[10.5px] text-term-muted">
                      {profile.lenderType.replace('_', ' ')}
                    </td>
                    <td className="py-2 pr-3 text-[10.5px] text-term-text">{describeProcessingFee(profile)}</td>
                    <td className="num py-2 pr-3 text-right text-[10.5px] text-term-muted">
                      {Object.entries(profile.nominalInterestRatesPa)
                        .map(([tenure, rate]) => `${tenure}M:${rate}`)
                        .join(' · ')}
                    </td>
                    <td className="num py-2 pr-3 text-right text-[10.5px] text-term-text">
                      {profile.gstOnMonthlyInterestPercent}%
                    </td>
                    <td className="num py-2 pr-3 text-right text-[10.5px] text-term-text">
                      {profile.foreclosurePenaltyPercent}%
                    </td>
                    <td className="py-2 text-right">
                      {profile.isCustomUserAdded ? (
                        <Button variant="danger" onClick={() => handleDelete(profile.id)} className="!px-2 !py-1">
                          <Trash2 size={12} />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-term-muted">seeded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 text-xs font-bold text-term-text">
                <Plus size={13} /> Add a new bank EMI plan
              </h3>
              <Button variant="ghost" onClick={() => setShowImport((value) => !value)} className="!px-2 !py-1">
                <FileJson size={12} /> {showImport ? 'Hide JSON import' : 'Import JSON'}
              </Button>
              <Button variant="ghost" onClick={handleExport} className="!px-2 !py-1">
                <Download size={12} /> Export database
              </Button>
            </div>

            {showImport ? (
              <div className="mb-3">
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder='[{"id":"kotak-cc","displayName":"Kotak Credit Card EMI","aliases":["kotak"],"lenderType":"CREDIT_CARD","processingFee":{"type":"FLAT","flatAmountINR":199,"percentageRate":0,"gstApplicableOnFee":true},"nominalInterestRatesPa":{"6":16,"12":16},"gstOnMonthlyInterestPercent":18,"foreclosurePenaltyPercent":3,"rewardPointsBlockedOnEmi":true,"hiddenClauses":["..."]}]'
                  className="num h-28 w-full rounded-lg border border-term-line bg-black/35 p-3 text-[10.5px] text-term-text outline-none focus:border-blue-400/50"
                />
                <Button className="mt-2" onClick={handleImport}>
                  <Upload size={12} /> Import profiles
                </Button>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="id (slug)">
                <input
                  value={draft.id}
                  onChange={(event) => updateDraft({ id: event.target.value })}
                  placeholder="kotak-cc"
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                />
              </Field>
              <Field label="Display name">
                <input
                  value={draft.displayName}
                  onChange={(event) => updateDraft({ displayName: event.target.value })}
                  placeholder="Kotak Mahindra Credit Card EMI"
                  className="w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                />
              </Field>
              <Field label="OCR aliases (comma separated)">
                <input
                  value={draft.aliases}
                  onChange={(event) => updateDraft({ aliases: event.target.value })}
                  placeholder="kotak, kotak bank, league"
                  className="w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                />
              </Field>
              <Field label="Lender type">
                <select
                  value={draft.lenderType}
                  onChange={(event) => updateDraft({ lenderType: event.target.value as LenderType })}
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                >
                  <option value="CREDIT_CARD">CREDIT_CARD</option>
                  <option value="DEBIT_CARD">DEBIT_CARD</option>
                  <option value="NBFC_CARD">NBFC_CARD</option>
                </select>
              </Field>
              <Field label="Processing fee type">
                <select
                  value={draft.feeType}
                  onChange={(event) =>
                    updateDraft({ feeType: event.target.value as DraftBank['feeType'] })
                  }
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                >
                  <option value="FLAT">FLAT</option>
                  <option value="PERCENTAGE">PERCENTAGE</option>
                  <option value="HIGHER_OF_BOTH">HIGHER_OF_BOTH</option>
                </select>
              </Field>
              <Field label="Flat fee ₹ / percentage %">
                <div className="flex gap-2">
                  <input
                    value={draft.flatAmountINR}
                    onChange={(event) => updateDraft({ flatAmountINR: event.target.value })}
                    className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                  />
                  <input
                    value={draft.percentageRate}
                    onChange={(event) => updateDraft({ percentageRate: event.target.value })}
                    className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                  />
                </div>
              </Field>
              <Field label="Nominal rates % p.a. per tenure">
                <input
                  value={draft.ratesText}
                  onChange={(event) => updateDraft({ ratesText: event.target.value })}
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                />
              </Field>
              <Field label="GST on monthly interest %">
                <input
                  value={draft.gstOnMonthlyInterestPercent}
                  onChange={(event) => updateDraft({ gstOnMonthlyInterestPercent: event.target.value })}
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                />
              </Field>
              <Field label="Foreclosure penalty %">
                <input
                  value={draft.foreclosurePenaltyPercent}
                  onChange={(event) => updateDraft({ foreclosurePenaltyPercent: event.target.value })}
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                />
              </Field>
              <Field label="GST on processing fee">
                <button
                  type="button"
                  onClick={() => updateDraft({ gstApplicableOnFee: !draft.gstApplicableOnFee })}
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-left text-xs text-term-text"
                >
                  {draft.gstApplicableOnFee ? '18% GST applicable' : 'No GST on fee'}
                </button>
              </Field>
              <Field label="Reward points blocked on EMI">
                <button
                  type="button"
                  onClick={() => updateDraft({ rewardPointsBlockedOnEmi: !draft.rewardPointsBlockedOnEmi })}
                  className="num w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-left text-xs text-term-text"
                >
                  {draft.rewardPointsBlockedOnEmi ? 'Blocked' : 'Earned'}
                </button>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Hidden clauses (one per line)">
                  <textarea
                    value={draft.hiddenClausesText}
                    onChange={(event) => updateDraft({ hiddenClausesText: event.target.value })}
                    className="h-20 w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-blue-400/50"
                  />
                </Field>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button onClick={submitDraft}>
                <Plus size={13} /> Register bank plan
              </Button>
              <span className="text-[10.5px] text-term-muted">
                Saved to localStorage and merged with the seeded profiles at runtime.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {CONSUMER_PROTECTION_RULES.map((rule) => (
            <li key={rule.ruleId} className="rounded-xl border border-term-line bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="num text-[10px] tracking-widest text-blue-300/80">{rule.ruleId}</span>
                <Badge
                  tone={
                    rule.severity === 'CRITICAL' ? 'danger' : rule.severity === 'HIGH' ? 'danger' : 'warn'
                  }
                >
                  {rule.severity} · weight {SEVERITY_WEIGHT[rule.severity]}
                </Badge>
              </div>
              <h3 className="mt-1.5 text-xs font-bold text-term-text">{rule.title}</h3>
              <p className="mt-1 text-[10.5px] leading-relaxed text-term-muted">
                <span className="font-semibold text-term-text">Statute:</span> {rule.statuteName}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-term-muted">
                <span className="font-semibold text-term-text">Clause:</span> {rule.sectionOrClause}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-term-muted">
                <span className="font-semibold text-term-text">Legal test:</span> {rule.legalDefinition}
              </p>
              <p className="num mt-1.5 text-[10px] leading-relaxed text-amber-200">
                trigger: {rule.triggerConditionCode}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
