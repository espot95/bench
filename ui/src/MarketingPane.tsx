/**
 * UFFICIO MARKETING (MODULE_STADIUM §3.4, richiesta utente): campagna abbonamenti
 * (fascia + tetto con stime vive), listino per classe di gara (campionato/cartello/
 * coppa), prezzi per settore, campagne marketing dell'anno. Stesso linguaggio del
 * Piano partita: segmented animati, gauge, card che entrano in scena.
 */

import { useState } from 'react';
import type { CampaignId, MatchClass, PriceLevel, PromoKind, SectorId } from '../../src/core/types';
import { Help } from './Help';
import { Ic } from './Ic';
import {
  type GameSession,
  buyFeature,
  chooseAbroadCampaign,
  chooseCampaign,
  marketingView,
  sellStadiumName,
  setAbbonamenti,
  setBasePrice,
  setMatchPrice,
  setPromo,
  setSectorTicketPrice,
  setTestimonial,
  signBoard,
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

  const featureOf = (id: string) => mv.features.find((f) => f.id === id);
  /** Card-invito di un servizio non ancora attivo: cosa fa + bottone d'acquisto. */
  const Unlock = ({ id }: { id: 'abbonamenti' | 'campagne' | 'estero' | 'pubblicita' }) => {
    const f = featureOf(id);
    if (!f) return null;
    return (
      <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-3 text-center">
        <Ic name="lock" /> <b className="text-zinc-200">{f.label}</b>
        <p className="mt-1 text-[11px] text-zinc-400">{f.desc}</p>
        <button
          type="button"
          onClick={() => {
            setMsg(buyFeature(session, f.id));
            refresh();
          }}
          className="mt-2 rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-800"
          style={{ borderColor: accent, color: accent }}
        >
          Attiva il servizio · {M(f.cost)} una tantum
        </button>
      </div>
    );
  };

  const abb = mv.abbonamenti;
  const currentAbb = abb.options.find((o) => o.level === abb.current);
  const capSeats = Math.round(abb.capacity * abb.capShare);

  return (
    <div className="space-y-4">
      {/* ---- Testata: quanto morde il marchio in patria, striscia sold-out ---- */}
      <div className={`anim-in ${card} flex flex-wrap items-center gap-3 text-xs`}>
        <span className="font-bold uppercase tracking-widest text-zinc-500">
          <Ic name="campaign" /> Ufficio marketing
        </span>
        <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-zinc-300">
          campagne nazionali al {mv.powerPct}%
          <Help text="Conta il MERCATO in cui parli, non dove sta l'ufficio: in patria il mercato è il tuo popolo, e un blasone più grande lo muove di più (dal 70% al 130%). All'estero invece decide il mercato che scegli per la campagna internazionale." />
        </span>
        {mv.live && (
          <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-zinc-300">
            <Ic
              name={
                mv.live.momentum > 0
                  ? 'trending_up'
                  : mv.live.momentum < 0
                    ? 'trending_down'
                    : 'trending_flat'
              }
            />{' '}
            {mv.live.pos}ª in classifica
            {mv.live.momentum > 0 && ' · la piazza si scalda'}
            {mv.live.momentum < 0 && ' · la piazza si raffredda'}
            <Help text="Il pubblico segue il CAMPO: la posizione vera in classifica e la striscia delle ultime 3 gare muovono i paganti a ogni partita in casa, in su e in giù." />
          </span>
        )}
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
            <Help text="Si chiude ogni AGOSTO: incasso tutto subito, poi gli abbonati entrano gratis — a ogni gara incassi solo i biglietti singoli dei posti liberi. Le tessere hanno uno ZOCCOLO DURO: i rinnovi partono dai vecchi abbonati (vincere fa rinnovare, alzare i prezzi dopo un'annata storta li fa scappare), la crescita annua è limitata, e i veri shock sono promozione (boom) e retrocessione (fuga). Un colpo di mercato da fenomeno firmato in estate gonfia la campagna." />
          </div>
          {!mv.abbOwned && <Unlock id="abbonamenti" />}
          <div className={mv.abbOwned ? '' : 'hidden'}>
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
                  <b className="text-zinc-300">{abb.sottoscritti.toLocaleString('it-IT')}</b>{' '}
                  abbonati
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
        </div>

        {/* ---- Listino per classe di gara ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="local_activity" /> Listino biglietti
            <Help text="Il prezzo base in € è TUO: il default cambia per lega (la Premier costa più della Serie A, la Championship più della B) e il pubblico reagisce allo scostamento — caro sul default della tua lega = stadio più vuoto. Sopra, tre listini: campionato, cartello (derby, big e scontri d'alta classifica riconosciuti da soli) e coppa, che non è coperta dagli abbonamenti." />
          </div>
          <div className="mb-3 rounded-lg bg-zinc-900/60 px-3 py-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-zinc-400">Prezzo base del biglietto</span>
              <span>
                <b className="text-lg text-zinc-100">{mv.prezzo.base}€</b>
                {mv.prezzo.base !== mv.prezzo.default && (
                  <button
                    type="button"
                    className="ml-2 text-[10px] text-zinc-500 underline hover:text-zinc-300"
                    onClick={() => {
                      setBasePrice(session, null);
                      refresh();
                    }}
                  >
                    torna al default di lega ({mv.prezzo.default}€)
                  </button>
                )}
              </span>
            </div>
            <input
              type="range"
              min={mv.prezzo.min}
              max={mv.prezzo.max}
              step={1}
              value={mv.prezzo.base}
              onChange={(e) => {
                setBasePrice(session, Number(e.target.value));
                refresh();
              }}
              className="mt-1 w-full accent-current"
              style={{ color: accent }}
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>{mv.prezzo.min}€</span>
              <span>default della tua lega: {mv.prezzo.default}€</span>
              <span>{mv.prezzo.max}€</span>
            </div>
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
              {mv.promo.owned && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-zinc-500">
                    Promo della gara
                    <Help text="Una leva per UNA partita: più gente allo stadio, ma il biglietto rende meno. 'Famiglie' e 'Omaggio' riempiono con lo sconto; 'Scuole' riempie tantissimo, incassa poco e scalda la piazza (bene per i rinnovi). Si consuma al fischio d'inizio." />
                  </span>
                  {mv.promo.options.map((o) => (
                    <button
                      key={o.kind}
                      type="button"
                      onClick={() => {
                        const next = mv.nextHome;
                        if (!next) return;
                        setPromo(
                          session,
                          next.round,
                          mv.promo.current === o.kind ? null : (o.kind as PromoKind),
                        );
                        refresh();
                      }}
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors ${
                        mv.promo.current === o.kind
                          ? 'bg-zinc-800'
                          : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                      }`}
                      style={
                        mv.promo.current === o.kind
                          ? { borderColor: accent, color: accent }
                          : undefined
                      }
                      title={`riempimento +${o.fill}% · biglietto al ${o.gate}%`}
                    >
                      {o.kind}
                    </button>
                  ))}
                </div>
              )}
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

        {/* ---- Campagna nazionale dell'anno ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="rocket_launch" /> Campagna nazionale
            <Help text="Una a stagione, si paga subito e vale fino all'estate: alla chiusura potenzia anche la campagna abbonamenti, poi si ricompra. Parla al TUO popolo: più il club è un blasone, più il messaggio arriva." />
          </div>
          {!mv.campaignsOwned && <Unlock id="campagne" />}
          <div className={`grid gap-2 sm:grid-cols-2 ${mv.campaignsOwned ? '' : 'hidden'}`}>
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
          {/* Testimonial (D): la faccia delle campagne */}
          {mv.campaignsOwned && (
            <div className="mt-3 border-t border-zinc-800 pt-2">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                <Ic name="face" /> Testimonial dell'anno
                <Help text="Un giocatore presta la faccia alle campagne: paghi una fee al suo entourage e il potere delle campagne nazionali sale (più è forte, più tira). Se lo cedi a metà stagione la campagna resta ORFANA: il boost sparisce, la fee no. Si risceglie ogni estate." />
              </div>
              {mv.testimonial.current ? (
                <div className="text-xs">
                  <span className="font-semibold" style={{ color: accent }}>
                    {mv.testimonial.current.name}
                  </span>{' '}
                  {mv.testimonial.current.boostPct > 0 ? (
                    <span className="text-zinc-400">
                      — campagne al +{mv.testimonial.current.boostPct}%
                    </span>
                  ) : (
                    <span className="text-red-300/80">— il volto se n'è andato</span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {mv.testimonial.candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setMsg(setTestimonial(session, c.id));
                        refresh();
                      }}
                      className="rounded border border-zinc-800 px-2 py-1 text-left text-[10px] hover:bg-zinc-900"
                      title={c.band}
                    >
                      <span className="font-semibold text-zinc-200">{c.name}</span>{' '}
                      <span className="text-zinc-500">{M(c.fee)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Bordocampo (A): l'inventario pubblicitario ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="featured_video" /> Bordocampo
            <Help text="Vendi VISIBILITÀ: cartelloni LED a bordocampo, contratti di 1-2 anni. Il valore sono gli occhi veri — più pubblico porti allo stadio, più i brand pagano; gli stadi grandi reggono più slot. Le annualità successive arrivano ai conguagli estivi." />
          </div>
          {!mv.boards.owned ? (
            <Unlock id="pubblicita" />
          ) : (
            <>
              <div className="mb-2 text-[11px] text-zinc-500">
                {mv.boards.deals.length}/{mv.boards.slots} cartelloni venduti
              </div>
              <div className="space-y-1.5">
                {mv.boards.deals.map((d) => (
                  <div
                    key={d.brandName}
                    className="flex items-baseline justify-between rounded-lg bg-zinc-900/70 px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold text-zinc-200">{d.brandName}</span>
                    <span className="text-zinc-400">
                      <b className="text-emerald-300">{M(d.annualValue)}</b>/anno · fino al{' '}
                      {d.endYear}
                    </span>
                  </div>
                ))}
              </div>
              {mv.boards.offers.length > 0 && (
                <>
                  <div className="mt-2 mb-1 text-[10px] uppercase tracking-widest text-zinc-600">
                    Offerte sul tavolo
                  </div>
                  <div className="space-y-1.5">
                    {mv.boards.offers.map((o) => (
                      <div
                        key={o.brandId}
                        className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-1.5 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold text-zinc-200">{o.brandName}</span>{' '}
                          <span className="text-zinc-600">({o.tier})</span>
                        </span>
                        <span className="mr-2 text-zinc-400">
                          {M(o.annualValue)}/anno · {o.years} ann{o.years === 1 ? 'o' : 'i'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMsg(signBoard(session, o.brandId));
                            refresh();
                          }}
                          className="rounded border px-2 py-0.5 text-[10px] font-semibold hover:bg-zinc-800"
                          style={{ borderColor: accent, color: accent }}
                        >
                          Firma
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {mv.boards.deals.length >= mv.boards.slots && (
                <p className="note-in mt-2 text-[11px] text-zinc-500">
                  Tutto esaurito anche a bordocampo: gli slot crescono con la capienza.
                </p>
              )}
            </>
          )}
        </div>

        {/* ---- Naming rights (B): il nome dello stadio ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="stadium" /> Naming rights
            <Help text="Un brand compra il NOME dello stadio: contratto di 5 anni, prima annualità + anticipo subito in cassa, annualità ai conguagli. Ma il nome è identità: la curva la prende MALE — la soddisfazione dei tifosi cala, e sono loro a rinnovare gli abbonamenti. Soldi subito contro zoccolo duro." />
          </div>
          {mv.naming.active ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs">
              <div className="font-semibold" style={{ color: accent }}>
                <Ic name="verified" fill /> {mv.naming.active.name}
              </div>
              <div className="mt-0.5 text-zinc-400">
                {M(mv.naming.active.annualValue)}/anno · fino al {mv.naming.active.endYear}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {mv.naming.offers.map((o) => (
                <div
                  key={o.brandId}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-zinc-200">{o.stadiumName}</span>
                    <div className="text-[10px] text-zinc-500">
                      {M(o.annualValue)}/anno × {o.years} anni · alla firma{' '}
                      {M(o.annualValue + o.upfront)}
                    </div>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(sellStadiumName(session, o.brandId));
                      refresh();
                    }}
                    className="rounded border border-amber-700/60 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-950/40"
                    title="la curva non la prenderà bene"
                  >
                    Vendi il nome
                  </button>
                </div>
              ))}
              <p className="text-[10px] text-zinc-600">
                vendere il nome ferisce la piazza: i rinnovi abbonamenti ne risentono
              </p>
            </div>
          )}
        </div>

        {/* ---- Campagna internazionale ---- */}
        <div className={`anim-in ${card} lg:col-span-2`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="public" /> Campagna internazionale
            <Help text="Una a stagione: scegli il mercato-nazione e l'ufficio ci investe fino all'estate. Dove hai giocatori del posto la crescita dei tifosi si moltiplica al conguaglio; dove non hai nessuno la campagna SEMINA il mercato da zero (e più il club è famoso, più il seme attecchisce). I tifosi esteri poi fruttano merchandising, negozi e diritti TV con la stirpe." />
          </div>
          {!mv.abroad.owned ? (
            <Unlock id="estero" />
          ) : mv.abroad.nation ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs">
              <span className="font-semibold" style={{ color: accent }}>
                <Ic name="check_circle" fill /> In corso su {mv.abroad.nation}
              </span>{' '}
              <span className="text-zinc-400">
                — gli effetti sui tifosi si vedono al conguaglio di fine stagione.
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {mv.abroad.markets.map((mk) => (
                  <button
                    key={mk.code}
                    type="button"
                    disabled={mv.abroad.locked}
                    onClick={() => {
                      setMsg(chooseAbroadCampaign(session, mk.code));
                      refresh();
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      mv.abroad.locked
                        ? 'border-zinc-800/60 opacity-50'
                        : 'border-zinc-800 hover:bg-zinc-900'
                    }`}
                    title={`lancia la campagna su ${mk.code} (${M(mv.abroad.cost)})`}
                  >
                    <span className="font-bold text-zinc-200">{mk.code}</span>
                    <span className="ml-1.5 text-zinc-500">
                      {mk.fans >= 1000
                        ? `${Math.round(mk.fans / 1000)}k tifosi`
                        : 'mercato vergine'}
                      {mk.locals > 0 && ` · ${mk.locals} tuo${mk.locals > 1 ? 'i' : ''} in rosa`}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                costo {M(mv.abroad.cost)} · dove hai giocatori del posto moltiplica la crescita,
                altrove semina un mercato nuovo
              </p>
            </>
          )}
          {mv.abroad.locked && !mv.abroad.nation && (
            <p className="note-in mt-2 text-[11px] text-zinc-500">
              La campagna internazionale di quest'anno è già stata lanciata.
            </p>
          )}
        </div>
      </div>
      {msg && <p className="note-in text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
