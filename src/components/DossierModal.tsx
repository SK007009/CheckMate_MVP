import { useState } from 'react';
import { Check, Copy, Download, FileText } from 'lucide-react';
import { Button, Modal } from './ui';

export function DossierModal({
  open,
  onClose,
  dossier,
  complainantName,
  onComplainantChange,
  platformName,
  onPlatformChange,
}: {
  open: boolean;
  onClose: () => void;
  dossier: string;
  complainantName: string;
  onComplainantChange: (value: string) => void;
  platformName: string;
  onPlatformChange: (value: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(dossier);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleDownload() {
    const blob = new Blob([dossier], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `checkmate-nch-1915-dossier-${platformName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'complaint'}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="NCH 1915 Dispute Dossier"
      subtitle="Auto-generated formal complaint under the Consumer Protection Act 2019 and the CCPA Dark Patterns Guidelines 2023, with the deterministic math proof attached."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy to clipboard'}
          </Button>
          <Button onClick={handleDownload}>
            <Download size={13} /> Download .txt
          </Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
            Complainant (you)
          </span>
          <input
            value={complainantName}
            onChange={(event) => onComplainantChange(event.target.value)}
            placeholder="Full name, address, phone, email"
            className="mt-1 w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-emerald-400/50"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">
            Platform / opposite party
          </span>
          <input
            value={platformName}
            onChange={(event) => onPlatformChange(event.target.value)}
            placeholder="Amazon India"
            className="mt-1 w-full rounded-lg border border-term-line bg-black/35 px-2.5 py-2 text-xs text-term-text outline-none focus:border-emerald-400/50"
          />
        </label>
      </div>

      <div className="mb-2 flex items-center gap-2 text-[10.5px] text-term-muted">
        <FileText size={12} /> The letter regenerates live as you edit the fields above.
      </div>

      <pre className="num max-h-[46vh] overflow-auto rounded-xl border border-term-line bg-black/45 p-4 text-[10.5px] leading-relaxed whitespace-pre-wrap text-term-text">
        {dossier}
      </pre>
    </Modal>
  );
}
