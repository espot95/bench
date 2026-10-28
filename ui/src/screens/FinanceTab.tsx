/**
 * FINANZE — la vista di CONTROLLO TOTALE del presidente: tesoreria, verdetto di
 * sostenibilità, dashboard, dettaglio, bilancio e previsioni. Estratto da App.tsx.
 */

import { Help } from '../Help';
import { Ic } from '../Ic';
import { DualLines, HBars, NEG, POS, SeasonNetBars } from '../charts';
import {
  type GameSession,
  financeDashboard,
  financeDetail,
  financeTrends,
  treasuryView,
} from '../game';

export function FinanceTab({
  session,
  accent,
  finBasis,
  setFinBasis,
  fcYears,
  setFcYears,
}: {
  session: GameSession;
  accent: string;
  finBasis: 'anno' | 'settimana';
  setFinBasis: (b: 'anno' | 'settimana') => void;
  fcYears: 3 | 5;
  setFcYears: (y: 3 | 5) => void;
}) {
  const t = treasuryView(session);
  const d = financeDashboard(session);
  const K = (n: number) =>
    n >= 1e6 || n <= -1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
  /** Importo nella base scelta: annuo, o /52 per la vista settimanale. */
  const B = (n: number) => K(finBasis === 'anno' ? n : n / 52);
  const statusColor =
    t.ratioStatus === 'blocco'
      ? 'text-red-300'
      : t.ratioStatus === 'allerta'
        ? 'text-amber-300'
        : 'text-emerald-300';
  return (
    <div className="space-y-4 text-sm">
      {/* Tesoreria (MODULE_FINANCES §5): cassa, fido, sostenibilità */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
          <div className="text-xs uppercase tracking-widest text-zinc-500">Cassa</div>
          <div className={`text-2xl font-bold ${t.cash < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
            {K(t.cash)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            fido {K(t.overdraft)} ·{' '}
            {t.overdraftUsed > 0 ? `usato ${K(t.overdraftUsed)} (interessi in corsa)` : 'non usato'}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            disponibilità totale <b>{K(t.room)}</b>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
          <div className="text-xs uppercase tracking-widest text-zinc-500">
            Sostenibilità (squad-cost)
            <Help text="Regola stile UEFA: stipendi annui + ammortamenti dei cartellini non oltre l'80% dei ricavi attesi. Dal 70% scatta l'allerta; dall'80% il blocco (niente aumenti né nuovi ingaggi finché non rientri)." />
          </div>
          <div className={`text-2xl font-bold ${statusColor}`}>
            {Math.round(t.ratio * 100)}%
            <span className="ml-2 text-xs font-normal uppercase">{t.ratioStatus}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-800">
            <div
              className={`h-full ${t.ratioStatus === 'blocco' ? 'bg-red-400' : t.ratioStatus === 'allerta' ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{
                width: `${t.ratioCap > 0 ? Math.min(100, (t.ratio / t.ratioCap) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            stipendi {K(t.billWeekly * 52)}/anno · tetto {K(t.capWeekly * 52)}/anno (cap{' '}
            {Math.round(t.ratioCap * 100)}% dei ricavi)
          </div>
          {t.amortization > 0 && (
            <div className="mt-1 text-xs text-zinc-400">
              rosa a bilancio <b>{K(t.bookValue)}</b> · ammortamenti {K(t.amortization)}/anno
              (pesano sul cap)
            </div>
          )}
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
          <div className="text-xs uppercase tracking-widest text-zinc-500">Proiezione stagione</div>
          <div
            className={`text-2xl font-bold ${t.projection.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
          >
            {t.projection.net >= 0 ? '+' : ''}
            {K(t.projection.net)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            ricavi attesi {K(t.projection.revenues)} · stipendi {K(t.projection.wages)} · gestione{' '}
            {K(t.projection.upkeep)}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            stagione in corso: {K(t.inTot)} entrate · {K(t.outTot)} uscite ·{' '}
            <b className={t.net >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {t.net >= 0 ? '+' : ''}
              {K(t.net)}
            </b>
          </div>
        </div>
      </div>

      {/* Il verdetto (MODULE_FINANCES): si può investire nella squadra? */}
      <div
        className={`rounded-lg border p-3 ${
          d.verdict.level === 'verde'
            ? 'border-emerald-800 bg-emerald-950/30'
            : d.verdict.level === 'giallo'
              ? 'border-amber-800 bg-amber-950/30'
              : 'border-red-800 bg-red-950/30'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-bold">
            {d.verdict.level === 'verde'
              ? '🟢 Puoi investire'
              : d.verdict.level === 'giallo'
                ? '🟡 Investi con prudenza'
                : '🔴 Niente investimenti'}
            <Help text="Il semaforo pesa tre cose: il saldo di gestione (entrate attese meno uscite), lo squad-cost (stipendi + ammortamenti entro l'80% dei ricavi) e la cassa. Verde = margini per comprare; giallo = con giudizio; rosso = prima sistemare i conti." />
          </span>
          <span className="text-xs text-zinc-400">
            mercato (cassa+fido) <b className="text-zinc-200">{K(d.verdict.room)}</b> · spazio
            ingaggi sotto il cap <b className="text-zinc-200">{K(d.verdict.wageHeadroom)}/anno</b>
          </span>
        </div>
        <div className="mt-1 text-xs text-zinc-400">{d.verdict.reasons.join(' · ')}</div>
      </div>

      {/* 🔎 Controllo totale (richiesta utente): ingaggi, impegni, mercato, stadio */}
      {(() => {
        const fd = financeDetail(session);
        const posLabel: Record<string, string> = {
          GK: 'Portieri',
          DF: 'Difesa',
          MF: 'Centrocampo',
          FW: 'Attacco',
        };
        const byPosMax = Math.max(1, ...fd.wages.byPos.map((r) => r.gross));
        const futMax = Math.max(1, ...fd.futures.map((f) => f.ammortamenti + f.rate));
        const marketNet = fd.market.cessioni - fd.market.acquisti - fd.market.commissioni;
        return (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Monte ingaggi scomposto */}
            <div className="anim-in rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Monte ingaggi
                <Help text="Chi pesa davvero sul monte stipendi: i sei ingaggi più alti (lordo annuo, con la quota sul totale) e la spesa per reparto. Il netto è circa il 52% del lordo." />
              </h4>
              <div className="mb-2 text-xs text-zinc-400">
                totale <b className="text-zinc-200">{K(fd.wages.billAnnual)}/anno</b> · tetto{' '}
                {K(fd.wages.capAnnual)}/anno
              </div>
              <div className="space-y-1.5">
                {fd.wages.top.map((w) => (
                  <div key={w.name}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-zinc-300">
                        <span className="mr-1.5 inline-block w-9 rounded border border-zinc-700 bg-zinc-900 text-center text-[10px] font-bold text-zinc-400">
                          {w.role}
                        </span>
                        {w.name}
                      </span>
                      <span className="text-zinc-400">
                        {K(w.gross)}{' '}
                        <span className="text-zinc-600">
                          · netto {K(w.net)} · {Math.round(w.pct * 100)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded bg-zinc-800">
                      <div
                        className="gauge-fill h-full rounded bg-amber-400/70"
                        style={{ width: `${Math.round(w.pct * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {fd.wages.byPos.map((r) => (
                  <div key={r.pos}>
                    <div className="mx-auto h-10 w-3 overflow-hidden rounded bg-zinc-800">
                      <div
                        className="gauge-fill w-full rounded bg-sky-400/60"
                        style={{
                          height: `${Math.round((r.gross / byPosMax) * 100)}%`,
                          marginTop: `${100 - Math.round((r.gross / byPosMax) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] uppercase text-zinc-500">
                      {posLabel[r.pos] ?? r.pos}
                    </div>
                    <div className="text-[10px] text-zinc-400">{K(r.gross)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Impegni futuri */}
            <div className="anim-in rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Impegni futuri
                <Help text="Cosa hai già promesso di pagare nei prossimi anni: gli ammortamenti dei cartellini a bilancio (non muovono cassa ma pesano sul cap) e le rate dei trasferimenti a pagamento dilazionato (quelle sì, escono dalla cassa a fine stagione)." />
              </h4>
              <div className="space-y-2">
                {fd.futures.map((f) => (
                  <div key={f.year}>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{f.year}</span>
                      <span className="text-zinc-300">
                        ammortamenti <b>{K(f.ammortamenti)}</b>
                        {f.rate > 0 && (
                          <>
                            {' '}
                            · rate <b className="text-red-300">{K(f.rate)}</b>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-0.5 flex h-1.5 gap-px overflow-hidden rounded bg-zinc-800">
                      <div
                        className="gauge-fill h-full bg-zinc-500"
                        style={{
                          width: `${Math.round((f.ammortamenti / futMax) * 100)}%`,
                        }}
                      />
                      <div
                        className="gauge-fill h-full bg-red-400/80"
                        style={{ width: `${Math.round((f.rate / futMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-400">
                {fd.expiring.count > 0 ? (
                  <>
                    <b className="text-zinc-200">{fd.expiring.count}</b> contratti in scadenza a
                    fine stagione: se non rinnovi liberi{' '}
                    <b className="text-emerald-300">{K(fd.expiring.wagesFreed)}/anno</b> di ingaggi.
                  </>
                ) : (
                  'Nessun contratto in scadenza a fine stagione.'
                )}
              </div>
            </div>

            {/* Il mercato dell'anno */}
            <div className="anim-in rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Il mercato dell'anno
                <Help text="Solo i movimenti di mercato già transitati in questa stagione: incassi da cessioni (con le plusvalenze evidenziate), spese per acquisti e commissioni agli agenti. Il saldo dice se il mercato ti sta finanziando o costando." />
              </h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between border-b border-zinc-800/60 py-1">
                  <span className="text-zinc-300">Cessioni incassate</span>
                  <span className="font-semibold text-emerald-400">+{K(fd.market.cessioni)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800/60 py-1">
                  <span className="pl-3 text-zinc-500">di cui plusvalenze</span>
                  <span className="text-emerald-300/80">{K(fd.market.plusvalenze)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800/60 py-1">
                  <span className="text-zinc-300">Acquisti pagati</span>
                  <span className="font-semibold text-red-400">−{K(fd.market.acquisti)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800/60 py-1">
                  <span className="text-zinc-300">Commissioni agli agenti</span>
                  <span className="font-semibold text-red-400">−{K(fd.market.commissioni)}</span>
                </div>
                <div className="mt-1.5 flex justify-between rounded bg-zinc-800/60 px-2.5 py-1.5">
                  <span className="font-bold text-zinc-200">Saldo mercato</span>
                  <span
                    className={`font-bold ${marketNet >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {marketNet >= 0 ? '+' : ''}
                    {K(marketNet)}
                  </span>
                </div>
              </div>
            </div>

            {/* La giornata allo stadio */}
            <div className="anim-in rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                La giornata allo stadio
                <Help text="Quanto rende davvero una partita in casa: incassi da botteghino già contabilizzati, la media a gara, i costi di organizzazione della giornata e i ricavi commerciali della cittadella. La capienza è il tuo tetto naturale." />
              </h4>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-300">
                  {K(fd.matchday.incassoMedio)}
                </span>
                <span className="text-xs text-zinc-500">
                  incasso medio a gara ({fd.matchday.gare} gare in casa)
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between border-b border-zinc-800/60 py-1">
                  <span className="text-zinc-300">Botteghino stagione</span>
                  <span className="font-semibold text-emerald-400">
                    +{K(fd.matchday.incassoTotale)}
                  </span>
                </div>
                {fd.matchday.abbonamenti > 0 && (
                  <div className="flex justify-between border-b border-zinc-800/60 py-1">
                    <span className="text-zinc-300">Campagna abbonamenti</span>
                    <span className="font-semibold text-emerald-400">
                      +{K(fd.matchday.abbonamenti)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-b border-zinc-800/60 py-1">
                  <span className="text-zinc-300">Commerciale cittadella</span>
                  <span className="font-semibold text-emerald-400">
                    +{K(fd.matchday.commerciale)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-zinc-800/60 py-1">
                  <span className="text-zinc-300">Costi di giornata</span>
                  <span className="font-semibold text-red-400">
                    −{K(fd.matchday.costiMatchday)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">Capienza stadio</span>
                  <span className="text-zinc-300">
                    {fd.matchday.capienza.toLocaleString('it-IT')} posti
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* La dashboard: tutte le voci, base annua o settimanale */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Bilancio di gestione
        </h4>
        <div className="flex gap-1">
          {(['anno', 'settimana'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setFinBasis(b)}
              className={`rounded border px-3 py-1 text-xs font-semibold ${
                finBasis === b
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800/60'
              }`}
            >
              {b === 'anno' ? 'Annuale' : 'Settimanale'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 text-sm md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            Entrate
          </h4>
          {d.incomes.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between border-b border-zinc-800/60 py-1.5"
            >
              <span className="text-zinc-300">
                {r.label}{' '}
                <span className="text-[10px] uppercase text-zinc-600">
                  {r.kind === 'attesa' ? 'attesi' : 'incassati'}
                </span>
              </span>
              <span className="font-semibold text-emerald-400">+{B(r.amount)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between rounded-lg bg-zinc-800/60 px-3 py-2">
            <span>Totale entrate</span>
            <span className="font-bold text-emerald-300">+{B(d.totalIn)}</span>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">Uscite</h4>
          {d.expenses.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between border-b border-zinc-800/60 py-1.5"
            >
              <span className={r.nonCash ? 'text-zinc-500' : 'text-zinc-300'}>
                {r.label}{' '}
                <span className="text-[10px] uppercase text-zinc-600">
                  {r.nonCash ? 'non cassa' : r.kind === 'attesa' ? 'attesi' : 'spesi'}
                </span>
              </span>
              <span className={`font-semibold ${r.nonCash ? 'text-zinc-500' : 'text-red-400'}`}>
                −{B(r.amount)}
              </span>
            </div>
          ))}
          <div className="mt-2 flex justify-between rounded-lg bg-zinc-800/60 px-3 py-2">
            <span>Totale uscite</span>
            <span className="font-bold text-red-300">−{B(d.totalOut)}</span>
          </div>
        </div>
      </div>
      <div
        className={`flex items-baseline justify-between rounded-lg border px-4 py-2.5 ${
          d.saldo >= 0
            ? 'border-emerald-900/70 bg-emerald-950/30'
            : 'border-red-900/70 bg-red-950/30'
        }`}
      >
        <span className="font-bold">
          Saldo di gestione{' '}
          <span className="text-xs font-normal text-zinc-500">
            ({finBasis === 'anno' ? 'annuo' : 'a settimana'}, ammortamenti esclusi)
          </span>
        </span>
        <span className={`text-xl font-bold ${d.saldo >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
          {d.saldo >= 0 ? '+' : ''}
          {B(d.saldo)}
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        Le voci "attese" sono la proiezione della stagione (stessa formula del motore economico);
        "incassati/spesi" è quanto già transitato quest'anno per le voci episodiche (coppe, mercato,
        eventi). Gli ammortamenti non muovono cassa ma pesano sul cap ingaggi.
      </p>

      {/* 📈 Andamento & previsione (impero v2, richiesta utente) */}
      {(() => {
        const tr = financeTrends(session);
        const yy = (y: number) => `'${String(y).slice(2)}`;
        const histRows = tr.history.map((h) => ({
          label: yy(h.year),
          a: h.revenue,
          b: h.costs,
        }));
        const netRows = [
          ...tr.history.map((h) => ({ label: yy(h.year), value: h.net })),
          ...tr.forecast
            .slice(0, fcYears)
            .map((f) => ({ label: yy(f.year), value: f.net, forecast: true })),
        ];
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Ricavi e costi per stagione
              </h4>
              <DualLines rows={histRows} aLabel="ricavi" bLabel="costi" />
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Netto: storia + previsione
                </h4>
                <div className="flex gap-1">
                  {([3, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFcYears(n)}
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                        fcYears === n
                          ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                          : 'border-zinc-800 text-zinc-500 hover:bg-zinc-800/60'
                      }`}
                    >
                      {n} stagioni
                    </button>
                  ))}
                </div>
              </div>
              <SeasonNetBars rows={netRows} />
              <p className="mt-1 text-[10px] text-zinc-600">
                Previsione "a bocce ferme" (barre tratteggiate): voci strutturali attese + monte
                ingaggi corrente + piano di ammortamento reale dei cartellini — migliora da sola man
                mano che i cartellini si esauriscono. Niente mercato, coppe o eventi futuri.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Composizione entrate
              </h4>
              <HBars
                rows={[...tr.dashboard.incomes]
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 7)
                  .map((r) => ({ label: r.label, value: r.amount }))}
                color={POS}
                width={300}
              />
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Composizione uscite
              </h4>
              <HBars
                rows={[...tr.dashboard.expenses]
                  .filter((r) => !r.nonCash)
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 7)
                  .map((r) => ({ label: r.label, value: r.amount }))}
                color={NEG}
                width={300}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
