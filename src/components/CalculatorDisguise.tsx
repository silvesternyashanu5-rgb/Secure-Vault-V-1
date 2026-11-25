import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, History, Moon, Sun, X } from 'lucide-react';
import type { ThemeMode } from '../types/vault';

interface CalculatorDisguiseProps {
  secretCode: string;
  biometricAvailable: boolean;
  darkMode: ThemeMode;
  onToggleTheme: () => void;
  onUnlockSuccess: () => void;
  onRequestBiometricUnlock: () => Promise<void>;
}

interface HistoryEntry {
  expression: string;
  result: string;
}

export const CalculatorDisguise: React.FC<CalculatorDisguiseProps> = ({
  secretCode,
  biometricAvailable,
  darkMode,
  onToggleTheme,
  onUnlockSuccess,
  onRequestBiometricUnlock,
}) => {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [expressionPreview, setExpressionPreview] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [rawInputSequence, setRawInputSequence] = useState('');
  const acHoldTimerRef = useRef<number | null>(null);

  const isCurrentlyDark =
    darkMode === 'dark' ||
    (darkMode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const formatNumber = (num: number): string => {
    if (!Number.isFinite(num)) return 'Error';
    const str = Number(num.toPrecision(12)).toString();
    return str.length > 14 ? num.toExponential(6) : str;
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '×':
        return a * b;
      case '÷':
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  };

  const inputDigit = useCallback(
    (digit: string) => {
      setRawInputSequence((prev) => (prev + digit).slice(-24));

      if (waitingForOperand) {
        setDisplay(digit);
        setWaitingForOperand(false);
      } else {
        setDisplay((prev) =>
          prev === '0' || prev === 'Error' ? digit : prev.length < 15 ? prev + digit : prev
        );
      }
    },
    [waitingForOperand]
  );

  const inputDecimal = useCallback(() => {
    setRawInputSequence('');
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => (prev.includes('.') ? prev : `${prev}.`));
  }, [waitingForOperand]);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(false);
    setExpressionPreview('');
    setRawInputSequence('');
  }, []);

  const backspace = useCallback(() => {
    setRawInputSequence((prev) => prev.slice(0, -1));
    setDisplay((prev) => {
      if (prev.length <= 1 || prev === 'Error') return '0';
      return prev.slice(0, -1);
    });
  }, []);

  const toggleSign = useCallback(() => {
    setDisplay((prev) => {
      if (prev === '0' || prev === 'Error') return prev;
      return prev.startsWith('-') ? prev.slice(1) : `-${prev}`;
    });
  }, []);

  const inputPercent = useCallback(() => {
    const value = parseFloat(display);
    if (!Number.isNaN(value)) {
      setDisplay(formatNumber(value / 100));
    }
  }, [display]);

  const handleOperator = useCallback(
    (nextOp: string) => {
      setRawInputSequence('');
      const inputValue = parseFloat(display);
      if (Number.isNaN(inputValue)) return;

      if (previousValue === null) {
        setPreviousValue(inputValue);
        setExpressionPreview(`${formatNumber(inputValue)} ${nextOp}`);
      } else if (operator && !waitingForOperand) {
        const result = calculate(previousValue, inputValue, operator);
        setDisplay(formatNumber(result));
        setPreviousValue(result);
        setExpressionPreview(`${formatNumber(result)} ${nextOp}`);
      } else {
        setExpressionPreview(`${formatNumber(previousValue)} ${nextOp}`);
      }

      setWaitingForOperand(true);
      setOperator(nextOp);
    },
    [display, operator, previousValue, waitingForOperand]
  );

  const handleEquals = useCallback(() => {
    // Discreet trigger: matching secret code followed by '=' opens the vault
    if (secretCode && (rawInputSequence === secretCode || display === secretCode)) {
      setRawInputSequence('');
      onUnlockSuccess();
      return;
    }
    setRawInputSequence('');

    if (operator && previousValue !== null) {
      const current = parseFloat(display);
      const result = calculate(previousValue, current, operator);
      const formatted = formatNumber(result);
      const expr = `${formatNumber(previousValue)} ${operator} ${formatNumber(current)}`;

      setHistory((prev) => [{ expression: expr, result: formatted }, ...prev].slice(0, 20));
      setDisplay(formatted);
      setExpressionPreview(`${expr} =`);
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  }, [display, onUnlockSuccess, operator, previousValue, rawInputSequence, secretCode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        inputDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        inputDecimal();
      } else if (e.key === '+') {
        e.preventDefault();
        handleOperator('+');
      } else if (e.key === '-') {
        e.preventDefault();
        handleOperator('-');
      } else if (e.key === '*') {
        e.preventDefault();
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearAll();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === '%') {
        e.preventDefault();
        inputPercent();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [backspace, clearAll, handleEquals, handleOperator, inputDecimal, inputDigit, inputPercent]);

  const startAcHold = () => {
    if (!biometricAvailable) return;
    acHoldTimerRef.current = window.setTimeout(() => {
      void onRequestBiometricUnlock();
    }, 1200);
  };

  const cancelAcHold = () => {
    if (acHoldTimerRef.current !== null) {
      clearTimeout(acHoldTimerRef.current);
      acHoldTimerRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Authentic Calculator Top Bar — zero hints of SecureVault */}
      <header className="h-14 px-4 sm:px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <span className="font-display text-base font-semibold tracking-tight">
          Calculator
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Calculation history"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle color theme"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isCurrentlyDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Calculator Keypad Chassis */}
          <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 flex flex-col justify-between">
            {/* Readout Screen */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 px-5 py-6 text-right mb-5">
              <div className="h-5 font-mono text-xs text-slate-400 dark:text-slate-500 truncate">
                {expressionPreview || '\u00A0'}
              </div>
              <div className="mt-1 font-mono text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white truncate tabular-nums">
                {display}
              </div>
            </div>

            {/* Keypad Grid */}
            <div className="grid grid-cols-4 gap-3">
              <button
                type="button"
                onClick={clearAll}
                onPointerDown={startAcHold}
                onPointerUp={cancelAcHold}
                onPointerLeave={cancelAcHold}
                className="min-h-[56px] rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-base hover:bg-slate-300/80 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
              >
                AC
              </button>
              <button
                type="button"
                onClick={toggleSign}
                className="min-h-[56px] rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-base hover:bg-slate-300/80 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
              >
                ±
              </button>
              <button
                type="button"
                onClick={inputPercent}
                className="min-h-[56px] rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-base hover:bg-slate-300/80 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
              >
                %
              </button>
              <button
                type="button"
                onClick={() => handleOperator('÷')}
                className={`min-h-[56px] rounded-2xl font-semibold text-xl transition active:scale-[0.98] cursor-pointer ${
                  operator === '÷' && waitingForOperand
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 dark:bg-emerald-600/20 text-white dark:text-emerald-400 hover:bg-slate-800 dark:hover:bg-emerald-600/30'
                }`}
              >
                ÷
              </button>

              {['7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => inputDigit(d)}
                  className="min-h-[56px] rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-white font-mono font-medium text-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleOperator('×')}
                className={`min-h-[56px] rounded-2xl font-semibold text-xl transition active:scale-[0.98] cursor-pointer ${
                  operator === '×' && waitingForOperand
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 dark:bg-emerald-600/20 text-white dark:text-emerald-400 hover:bg-slate-800 dark:hover:bg-emerald-600/30'
                }`}
              >
                ×
              </button>

              {['4', '5', '6'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => inputDigit(d)}
                  className="min-h-[56px] rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-white font-mono font-medium text-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleOperator('-')}
                className={`min-h-[56px] rounded-2xl font-semibold text-xl transition active:scale-[0.98] cursor-pointer ${
                  operator === '-' && waitingForOperand
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 dark:bg-emerald-600/20 text-white dark:text-emerald-400 hover:bg-slate-800 dark:hover:bg-emerald-600/30'
                }`}
              >
                −
              </button>

              {['1', '2', '3'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => inputDigit(d)}
                  className="min-h-[56px] rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-white font-mono font-medium text-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleOperator('+')}
                className={`min-h-[56px] rounded-2xl font-semibold text-xl transition active:scale-[0.98] cursor-pointer ${
                  operator === '+' && waitingForOperand
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 dark:bg-emerald-600/20 text-white dark:text-emerald-400 hover:bg-slate-800 dark:hover:bg-emerald-600/30'
                }`}
              >
                +
              </button>

              <button
                type="button"
                onClick={() => inputDigit('0')}
                className="min-h-[56px] rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-white font-mono font-medium text-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={inputDecimal}
                className="min-h-[56px] rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-white font-mono font-medium text-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
              >
                .
              </button>
              <button
                type="button"
                onClick={backspace}
                aria-label="Backspace"
                className="min-h-[56px] rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
              >
                <Delete className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleEquals}
                className="min-h-[56px] rounded-2xl bg-emerald-600 text-white font-semibold text-xl hover:bg-emerald-500 active:scale-[0.98] transition cursor-pointer"
              >
                =
              </button>
            </div>
          </div>

          {/* Calculation Tape / History Panel on Desktop or Drawer */}
          <aside
            className={`lg:col-span-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col ${
              showHistory ? 'block' : 'hidden lg:flex'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Calculation Tape
              </h2>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="lg:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No calculations yet
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Keyboard shortcuts supported (0–9, +, -, *, /, Enter)
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2 overflow-y-auto max-h-[340px]">
                {history.map((item, idx) => (
                  <li key={`${item.expression}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => setDisplay(item.result)}
                      className="w-full text-right rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <div className="font-mono text-xs text-slate-400 dark:text-slate-500">
                        {item.expression}
                      </div>
                      <div className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                        {item.result}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};
