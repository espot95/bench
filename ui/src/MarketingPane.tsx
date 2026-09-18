/**
 * UFFICIO MARKETING (MODULE_STADIUM §3.4, richiesta utente): campagna abbonamenti
 * (fascia + tetto con stime vive), listino per classe di gara (campionato/cartello/
 * coppa), prezzi per settore, campagne marketing dell'anno. Stesso linguaggio del
 * Piano partita: segmented animati, gauge, card che entrano in scena.
 */

import { useState } from 'react';
import type { CampaignId, MatchClass, PriceLevel, SectorId } from '../../src/core/types';
import { Help } from './Help';
import { Ic } from './Ic';
import {
  type GameSession,
  chooseCampaign,
  marketingView,
  setAbbonamenti,
  setMatchPrice,
  setSectorTicketPrice,
} from './game';

const M = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`);

const LEVEL_LABEL: Record<PriceLevel, string> = {
  popolare: 'Popolare',
  standard: 'Standard',
  premium: 'Premium',
};

/** Segmented control col cursore che scivola (stesso kit del Piano partita). */
function Seg<T extends string>({
  value,
  options,
  onPick,
  accent,
}: {
  value: T;
  options: { id: T; label: string }[];
  onPick: (v: T) => void;
  accent: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  return (
    <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <div
        className="seg-thumb"
        style={{
          left: 3,
          width: `calc(${100 / options.length}% - 6px)`,
          transform: `translateX(calc(${idx * 100}% + ${idx * 6}px))`,
          background: accent,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === value ? 'on' : ''}
          style={o.id === value ? { color: accent } : undefined}
          onClick={() => onPick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MarketingPane({ session, accent }: { session: GameSession; accent: string }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const mv = marketingView(session);
  const card = 'rounded-xl border border-zinc-800 bg-zinc-950/50 p-3';

  if (!mv.built) {
    return (
      <div className={`anim-in ${card} text-sm`}>
        <div className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <Ic name="campaign" /> Ufficio marketing
        </div>
        {mv.building ? (
          <p className="text-zinc-400">
            Cantiere in corso: l'ufficio apre tra poche giornate. Da lì gestirai abbonamenti,
            listino per tipo di gara e campagne per i tifosi.
          </p>
        ) : (
          <p className="text-zinc-400">
            Apri l'<b className="text-zinc-200">ufficio marketing</b> ({M(mv.cost)}) dalla lista qui
            sopra: si piazza <b>sulla mappa della città</b>, e più il quartiere scelto è caldo di
            tifo, più le campagne renderanno. Sblocca abbonamenti, listino per classe di gara
            (cartello, coppa, campionato), prezzi per settore e campagne stagionali.
          </p>
        )}
      </div>
    );
  }

  const abb = mv.abbonamenti;
  const currentAbb = abb.options.find((o) => o.level === abb.current);
  const capSeats = Math.round(abb.capacity * abb.capShare);

  return (
    <div className="space-y-4">
      {/* ---- Testata: dove sta l'ufficio, quanto pesa, striscia sold-out ---- */}
      <div className={`anim-in ${card} flex flex-wrap items-center gap-3 text-xs`}>
        <span className="font-bold uppercase tracking-widest text-zinc-500">
          <Ic name="campaign" /> Ufficio marketing
        </span>
        <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-zinc-300">
          {mv.densityLabel} · campagne al {mv.powerPct}%
          <Help text="L'ufficio è piazzato sulla mappa della città: nel cuore del tifo le campagne rendono fino al 140%, in periferia scendono verso il 60%." />
        </span>
        {mv.soldOutStreak > 0 && (
          <span
            className={`rounded-full border px-2.5 py-0.5 font-semibold ${
              mv.soldOutStreak >= mv.hypeAt
                ? 'border-amber-500/60 bg-amber-950/40 text-amber-300'
                : 'border-zinc-700 text-zinc-400'
            }`}
          >
            <Ic name="local_fire_department" fill={mv.soldOutStreak >= mv.hypeAt} /> sold-out ×
            {mv.soldOutStreak}
            {mv.soldOutStreak >= mv.hypeAt && ' — la città ne parla!'}
            <Help text="Striscia di tutto esaurito in corso: da 3 in su l'hype porta più paganti a ogni gara. Si azzera al primo stadio non pieno e a ogni estate." />
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Abbonamenti ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="card_membership" /> Campagna abbonamenti
            <Help text="Si chiude ogni AGOSTO: l'incasso arriva tutto subito in cassa, ma da lì in poi gli abbonati entrano gratis — a ogni gara incassi solo i biglietti singoli dei posti liberi. La domanda ricorda la stagione scorsa: vincere fa rinnovare, alzare i prezzi dopo un'annata storta li fa scappare." />
          </div>
          <Seg
            value={abb.current}
            options={abb.options.map((o) => ({
              id: o.level,
              label: `${LEVEL_LABEL[o.level]} · ${o.price}€`,
            }))}
            onPick={(level) => {
              setAbbonamenti(session, level, abb.capShare);
              refresh();
            }}
            accent={accent}
          />
          <div className="mt-3 text-xs text-zinc-400">
            Tetto abbonamenti: <b className="text-zinc-200">{capSeats.toLocaleString('it-IT')}</b>{' '}
            tessere ({Math.round(abb.capShare * 100)}% dei {abb.capacity.toLocaleString('it-IT')}{' '}
            posti)
            <Help text="Quante tessere al massimo metti in vendita: un tetto basso tiene liberi più posti da vendere gara per gara (e più cari). Oltre l'85% non si va: i biglietti singoli devono esistere." />
          </div>
          <input
            type="range"
            min={0}
            max={Math.round(abb.maxShare * 100)}
            step={5}
            value={Math.round(abb.capShare * 100)}
            onChange={(e) => {
              setAbbonamenti(session, abb.current, Number(e.target.value) / 100);
              refresh();
            }}
            className="mt-1 w-full accent-current"
            style={{ color: accent }}
          />
          {currentAbb && (
            <div className="mt-2 rounded-lg bg-zinc-900/70 px-3 py-2 text-xs">
              Stima alla prossima campagna:{' '}
              <b className="text-zinc-200">
                {Math.min(currentAbb.abbonati, capSeats).toLocaleString('it-IT')} abbonati
              </b>{' '}
              ·{' '}
              <b className="text-emerald-300">
                +{M(Math.min(currentAbb.abbonati, capSeats) * currentAbb.price)}
              </b>{' '}
              subito in cassa
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
            {abb.sottoscritti !== null && (
              <span className="rounded border border-zinc-800 px-2 py-0.5">
                quest'anno:{' '}
                <b className="text-zinc-300">{abb.sottoscritti.toLocaleString('it-IT')}</b> abbonati
                {abb.pricePaid !== null && <> a {abb.pricePaid}€</>}
              </span>
            )}
            {abb.satisfaction !== null && (
              <span className="rounded border border-zinc-800 px-2 py-0.5">
                umore dei tifosi:{' '}
                <b
                  className={
                    abb.satisfaction === 'alta'
                      ? 'text-emerald-300'
                      : abb.satisfaction === 'media'
                        ? 'text-zinc-300'
                        : 'text-red-300'
                  }
                >
                  {abb.satisfaction}
                </b>
              </span>
            )}
          </div>
        </div>

        {/* ---- Listino per classe di gara ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="local_activity" /> Listino biglietti
            <Help text="Tre listini: campionato normale, partite di cartello (derby cittadini e big riconosciuti da soli) e coppa. Il premium incassa di più a biglietto ma riempie meno; la coppa non è coperta dagli abbonamenti — pagano tutti, ma il pubblico è più magro." />
          </div>
          <div className="space-y-3">
            {mv.listino.map((row) => {
              const cur = row.options.find((o) => o.level === row.current);
              return (
                <div key={row.id}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-zinc-300">{row.label}</span>
                    {cur && (
                      <span className="text-zinc-500">
                        ~<b className="text-emerald-300">{M(cur.gate)}</b>/gara · riempimento{' '}
                        {cur.fillPct}%
                      </span>
                    )}
                  </div>
                  <Seg
                    value={row.current}
                    options={row.options.map((o) => ({
                      id: o.level,
                      label: LEVEL_LABEL[o.level],
                    }))}
                    onPick={(level) => {
                      setMatchPrice(session, row.id as MatchClass, level);
                      refresh();
                    }}
                    accent={accent}
                  />
                </div>
              );
            })}
          </div>
          {mv.nextHome && (
            <div
              className={`note-in mt-3 rounded-lg border px-3 py-1.5 text-[11px] ${
                mv.nextHome.cls === 'cartello'
                  ? 'border-amber-700/60 bg-amber-950/30 text-amber-200'
                  : 'border-zinc-800 text-zinc-500'
              }`}
            >
              Prossima in casa: <b>{mv.nextHome.opponent}</b> —{' '}
              {mv.nextHome.derby
                ? 'DERBY, biglietti da cartello!'
                : mv.nextHome.cls === 'cartello'
                  ? 'partita di cartello.'
                  : 'listino di campionato.'}
            </div>
          )}
        </div>

        {/* ---- Prezzi per settore ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="stadium" /> Prezzi per settore
            <Help text="Un ritocco sopra il listino di gara, settore per settore: curva popolare che riempie, tribuna premium che incassa. Pesa in proporzione ai posti veri del settore." />
          </div>
          <div className="space-y-2">
            {mv.sectors.map((sec) => (
              <div key={sec.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                  {sec.name}{' '}
                  <span className="text-zinc-600">{sec.seats.toLocaleString('it-IT')} posti</span>
                </span>
                <div className="flex gap-1">
                  {(['popolare', 'standard', 'premium'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        setSectorTicketPrice(session, sec.id as SectorId, level);
                        refresh();
                      }}
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                        sec.current === level
                          ? 'bg-zinc-800'
                          : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                      }`}
                      style={
                        sec.current === level ? { borderColor: accent, color: accent } : undefined
                      }
                    >
                      {LEVEL_LABEL[level]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Campagne dell'anno ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="rocket_launch" /> Campagna dell'anno
            <Help text="Una a stagione, si paga subito e vale fino all'estate: alla chiusura potenzia anche la campagna abbonamenti, poi si ricompra. L'effetto dipende da DOVE hai messo l'ufficio: nel cuore del tifo rende molto di più." />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {mv.campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!c.ok || (mv.campaignLocked && !c.active)}
                onClick={() => {
                  setMsg(chooseCampaign(session, c.id as CampaignId));
                  refresh();
                }}
                className={`rounded-lg border p-2 text-left transition-all duration-200 ${
                  c.active
                    ? 'scale-[1.03] bg-zinc-800'
                    : !c.ok || mv.campaignLocked
                      ? 'border-zinc-800/60 opacity-50'
                      : 'border-zinc-800 hover:bg-zinc-900'
                }`}
                style={c.active ? { borderColor: accent } : undefined}
              >
                <div
                  className="flex items-baseline justify-between text-xs font-bold"
                  style={c.active ? { color: accent } : undefined}
                >
                  <span>{c.label}</span>
                  <span className="font-normal text-zinc-500">{M(c.cost)}</span>
                </div>
                <div className="mt-1 text-[11px] leading-snug text-zinc-400">{c.desc}</div>
                {c.reason && <div className="mt-1 text-[10px] text-red-300/80">{c.reason}</div>}
                {c.active && (
                  <div className="mt-1 text-[10px] font-semibold" style={{ color: accent }}>
                    <Ic name="check_circle" fill /> in corso fino all'estate
                  </div>
                )}
              </button>
            ))}
          </div>
          {mv.campaignLocked && (
            <p className="note-in mt-2 text-[11px] text-zinc-500">
              La campagna di quest'anno è già partita: la prossima si sceglie dalla nuova stagione.
            </p>
          )}
        </div>
      </div>
      {msg && <p className="note-in text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
