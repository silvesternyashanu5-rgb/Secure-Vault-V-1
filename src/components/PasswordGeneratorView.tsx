import React, { useEffect, useState } from 'react';
import { Check, Copy, Plus, RefreshCw } from 'lucide-react';
import { evaluatePasswordStrength, generateStrongPassword } from '../lib/crypto';

interface PasswordGeneratorViewProps {
  onUsePasswordInNewItem: (secret: string) => void;
}

export const PasswordGeneratorView: React.FC<PasswordGeneratorViewProps> = ({
  onUsePasswordInNewItem,
}) => {
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const regenerate = () => {
    setGenerated(
      generateStrongPassword({
        length,
        uppercase,
        lowercase,
        numbers,
        symbols,
        excludeAmbiguous,
      })
    );
    setCopied(false);
  };

  useEffect(() => {
    regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, uppercase, lowercase, numbers, symbols, excludeAmbiguous]);

  const strength = evaluatePasswordStrength(generated);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Cryptographic Key &amp; Password Generator
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Generated locally using browser CSPRNG (<code className="font-mono">crypto.getRandomValues</code>).
        </p>
      </div>

      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6">
        {/* Output Readout */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5">
          <div className="font-mono text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white break-all tracking-tight">
            {generated}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Strength: <strong className="text-emerald-600 dark:text-emerald-400">{strength.label}</strong>
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {length} chars
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={regenerate}
                className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="min-h-[40px] flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => onUsePasswordInNewItem(generated)}
                className="min-h-[40px] flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save to Vault</span>
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="pw-length" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Password Length
              </label>
              <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                {length}
              </span>
            </div>
            <input
              id="pw-length"
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Uppercase (A–Z)', value: uppercase, set: setUppercase },
              { label: 'Lowercase (a–z)', value: lowercase, set: setLowercase },
              { label: 'Numbers (0–9)', value: numbers, set: setNumbers },
              { label: 'Symbols (!@#$%^&*)', value: symbols, set: setSymbols },
              {
                label: 'Exclude Ambiguous (0, O, 1, l, I)',
                value: excludeAmbiguous,
                set: setExcludeAmbiguous,
              },
            ].map((opt) => (
              <label
                key={opt.label}
                className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
                <input
                  type="checkbox"
                  checked={opt.value}
                  onChange={(e) => opt.set(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
