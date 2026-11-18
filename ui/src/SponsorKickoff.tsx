/**
 * Il tavolo degli sponsor d'insediamento (MODULE_SPONSORS §1): alla partenza
 * carriera i 4 slot sono SCOPERTI e il mercato presenta le offerte vere — si
 * firma qui, oppure si rimanda (zero incassi dallo slot finché resta vuoto; le
 * offerte restano firmabili dal pannello Sponsor, e ogni estate gli slot
 * scoperti ne ricevono di fresche). Guscio puro: riusa SponsorPane.
 */

import { useState } from 'react';
import { SponsorPane } from './SponsorPane';
import type { GameSession } from './game';

export function SponsorKickoff({
  session,
  accent,
  onDone,
}: {
  session: GameSession;
  accent: string;
  onDone: () => void;
}) {
  const [, setTick] = useState(0);
  const signed = (session.club.sponsors ?? []).length;
  return (
    <div className="anim-in min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="text-xs uppercase tracking-widest text-zinc-500">
          Insediamento · {session.club.name} · {session.year}/{String(session.year + 1).slice(2)}
        </div>
        <h1 className="text-2xl font-bold" style={{ color: accent }}>
          Il tavolo degli sponsor
        </h1>
        <p className="text-sm text-zinc-400">
          Prima della panchina, l'ufficio commerciale: le aziende hanno fatto le loro offerte per i
          4 slot del club. Firma quelle che ti convincono — o rimanda: uno slot scoperto non incassa
          nulla, ma nessuno ti obbliga a stringere la prima mano che si allunga.
        </p>
        <SponsorPane session={session} accent={accent} onSigned={() => setTick((t) => t + 1)} />
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <span className="text-sm text-zinc-400">
            {signed === 0
              ? 'Nessun contratto firmato: si parte senza sponsor.'
              : `${signed} contratt${signed === 1 ? 'o' : 'i'} firmat${signed === 1 ? 'o' : 'i'}.`}
          </span>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-950"
            style={{ background: accent }}
            onClick={onDone}
          >
            Si va in panchina →
          </button>
        </div>
      </div>
    </div>
  );
}
