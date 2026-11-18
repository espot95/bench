/**
 * Color picker dell'atelier (MODULE_STADIUM §3.4 E-bis): react-colorful in un
 * popover — swatch cliccabile, selettore, campo hex e la palette dei
 * SUGGERIMENTI (colori sociali + armonie). Sostituisce gli input nativi.
 */

import { useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';

export function ColorField({
  label,
  value,
  onChange,
  suggestions,
}: {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  suggestions?: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-between gap-2 text-xs text-zinc-400">
      {label}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-10 rounded border border-zinc-600 transition-transform hover:scale-105"
        style={{ background: value }}
        title={value}
        aria-label={`${label ?? 'colore'}: ${value}`}
      />
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            role="presentation"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          <div className="note-in absolute right-0 top-8 z-50 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-2xl">
            <HexColorPicker color={value} onChange={onChange} style={{ width: 168, height: 128 }} />
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-zinc-500">#</span>
              <HexColorInput
                color={value}
                onChange={onChange}
                className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[11px] uppercase text-zinc-200"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto text-[10px] text-zinc-500 underline hover:text-zinc-300"
              >
                fatto
              </button>
            </div>
            {suggestions && suggestions.length > 0 && (
              <div className="mt-1.5 grid grid-cols-6 gap-1">
                {suggestions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    className={`h-5 w-6 rounded border transition-transform hover:scale-110 ${
                      c.toLowerCase() === value.toLowerCase() ? 'border-white' : 'border-zinc-700'
                    }`}
                    style={{ background: c }}
                    title={c}
                    aria-label={`usa ${c}`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
