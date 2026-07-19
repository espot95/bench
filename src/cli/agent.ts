/**
 * Agent career CLI (MODULE_AGENT §5): pre-season window of free actions, auto-simulated
 * seasons, end-of-season digest. Thin wiring over src/agent — no game logic here.
 */

import {
  type AgentArchetype,
  type AgentState,
  agentlessPlayers,
  hireScout,
  hypeClient,
  investInClient,
  proposeMandate,
  requiredReputation,
  settleAgentExtras,
  settleAgentSeason,
  settleHype,
  startAgentCareer,
} from '../agent/career.js';
import { placeClient } from '../agent/placement.js';
import type { LeagueId, PlayerId } from '../core/ids.js';
import { personalityLabel } from '../core/personality.js';
import type { Player, StandingRow, World } from '../core/types.js';
import { playAllDivisions } from '../engine/career.js';
import { advanceOffseason } from '../engine/progression.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { type ScoutingState, observePlayer, renderReportLine } from '../scouting/report.js';
import { createLineReader } from './line-reader.js';

export async function runAgentLoop(seed: number, startYear: number, archetype: AgentArchetype) {
  const rl = createLineReader();
  try {
    const world = generateWorld(createRng(seed));
    const state = startAgentCareer(world, archetype);
    const scout: ScoutingState = new Map();
    const scoutRng = createRng((seed ^ 0x3e11a7) >>> 0);
    const actRng = createRng((seed ^ 0x77c1) >>> 0);
    let year = startYear;
    let shortlist: Player[] = [];

    console.log(
      `\nCarriera da PROCURATORE (${archetype}) — reputazione ${state.reputation}, cassa ${(state.cash / 1000).toFixed(0)}k.`,
    );
    while (true) {
      const raw = await rl.question(
        `\n[${year}] liberi · scout <n> · firma <n> [pct] [anni] · clienti · piazza <n> · hype <n> · investi <n> <M> · osservatore · conti · avanza · quit > `,
      );
      if (raw === null) break;
      const [cmd, a1, a2, a3] = raw.trim().toLowerCase().split(/\s+/);

      if (cmd === 'quit' || cmd === 'q') break;

      if (cmd === 'liberi' || cmd === '' || cmd === undefined) {
        // Top prospects + a "within your reach" tail, so the novice has a real path.
        const pool = agentlessPlayers(world);
        const top = [...pool].sort((x, y) => y.potential - x.potential).slice(0, 10);
        const reachable = [...pool]
          .sort((x, y) => requiredReputation(x) - requiredReputation(y))
          .filter((x) => !top.includes(x))
          .slice(0, 8);
        shortlist = [...top, ...reachable];
        if (shortlist.length === 0) {
          console.log('  Nessun giocatore senza agente in giro (rarità!).');
          continue;
        }
        console.log(`  ═ Senza agente (top 15 per prospettiva) — \`firma <n>\` ═`);
        shortlist.forEach((p, i) => {
          if (!scout.has(p.id)) observePlayer(scout, p, world, year, scoutRng);
          const r = scout.get(p.id);
          const req = Math.round(requiredReputation(p));
          console.log(
            `  ${String(i + 1).padStart(2)}. ${r ? renderReportLine(r, p) : p.name}  [serve rep ~${req}]`,
          );
        });
        continue;
      }

      if (cmd === 'scout' && a1) {
        const p = shortlist[Number.parseInt(a1, 10) - 1];
        if (!p) {
          console.log('  Indice non valido (prima `liberi`).');
          continue;
        }
        const r = observePlayer(scout, p, world, year, scoutRng);
        console.log(`  ${renderReportLine(r, p)}`);
        continue;
      }

      if (cmd === 'firma' && a1) {
        const p = shortlist[Number.parseInt(a1, 10) - 1];
        if (!p) {
          console.log('  Indice non valido (prima `liberi`).');
          continue;
        }
        const pct = a2 ? Number.parseFloat(a2) / 100 : 0.08;
        const years = a3 ? Number.parseInt(a3, 10) : 2;
        const out = proposeMandate(world, state, p, { wagePct: pct, years }, year, actRng);
        console.log(`  ${out.accepted ? '✓' : '✗'} ${p.name}: ${out.reason}`);
        continue;
      }

      if (cmd === 'clienti') {
        if (state.mandates.length === 0) {
          console.log('  Portafoglio vuoto: vai a caccia (`liberi`).');
          continue;
        }
        for (const m of state.mandates) {
          const p = world.players.get(m.playerId);
          if (!p) continue;
          const club = [...world.clubs.values()].find((c) => c.playerIds.includes(p.id));
          const wage = p.contractId ? (world.contracts.get(p.contractId)?.wage ?? 0) : 0;
          console.log(
            `  ${p.name.padEnd(22)} ${p.position}  età ${p.age}  ${club ? club.name : 'svincolato'}  ${(wage / 1000).toFixed(0)}k/sett. · ${Math.round(m.wagePct * 100)}% fino al ${m.endYear} · ${personalityLabel(p)}`,
          );
        }
        continue;
      }

      if (cmd === 'piazza' && a1) {
        const m = state.mandates[Number.parseInt(a1, 10) - 1];
        const p = m ? world.players.get(m.playerId) : undefined;
        if (!p) {
          console.log('  Indice non valido (vedi `clienti`).');
          continue;
        }
        const res = placeClient(world, state, p, year, 0, actRng);
        console.log(
          res.placed
            ? `  ✓ ${p.name} → ${res.clubName}${res.fee ? ` (cartellino ${((res.fee ?? 0) / 1e6).toFixed(1)}M)` : ''} — fee a te: ${((res.commission ?? 0) / 1000).toFixed(0)}k. «${res.reason}»`
            : `  ✗ ${p.name}: ${res.reason}`,
        );
        continue;
      }

      if (cmd === 'hype' && a1) {
        const m = state.mandates[Number.parseInt(a1, 10) - 1];
        const p = m ? world.players.get(m.playerId) : undefined;
        if (!p) {
          console.log('  Indice non valido (vedi `clienti`).');
          continue;
        }
        const out = hypeClient(state, p);
        console.log(`  ${out.ok ? '✓' : '✗'} ${p.name}: ${out.reason}`);
        continue;
      }

      if (cmd === 'osservatore') {
        console.log(
          hireScout(
            world,
            state,
            `Osservatore ${(world.agencies?.find((a) => a.id === state.agencyId)?.staff.length ?? 0) + 1}`,
          )
            ? '  ✓ Osservatore assunto (300k/anno): coprirà i senza-agente a ogni stagione.'
            : '  ✗ Cassa insufficiente.',
        );
        continue;
      }

      if (cmd === 'investi' && a1) {
        const m = state.mandates[Number.parseInt(a1, 10) - 1];
        const p = m ? world.players.get(m.playerId) : undefined;
        if (!p) {
          console.log('  Indice non valido (vedi `clienti`).');
          continue;
        }
        const out = investInClient(world, state, p, (Number.parseFloat(a2 ?? '0.2') || 0.2) * 1e6);
        console.log(`  ${out.ok ? '✓' : '✗'} ${p.name}: ${out.reason}`);
        continue;
      }

      if (cmd === 'conti') {
        console.log(
          `  Cassa ${(state.cash / 1e6).toFixed(2)}M · reputazione ${state.reputation.toFixed(0)} · clienti ${state.mandates.length} · agganci ${state.agganci}`,
        );
        for (const e of state.ledger.slice(-6)) {
          console.log(
            `   ${e.year}  ${e.type === 'wage_cut' ? '% stipendio' : 'fee firma'}  +${(e.amount / 1000).toFixed(0)}k  ${e.note}`,
          );
        }
        continue;
      }

      if (cmd === 'avanza' || cmd === 'a') {
        const { standingsByLeague } = playAllDivisions(world, year, seed + year);
        advanceOffseason(
          world,
          standingsByLeague as Map<LeagueId, StandingRow[]>,
          createRng(seed + year + 99999),
          year + 1,
        );
        const digest = settleAgentSeason(world, state, year + 1, actRng);
        const extras = settleAgentExtras(world, state, scout, year + 1, scoutRng);
        const hypeOut = settleHype(world, state, actRng);
        year++;
        console.log(`  ═ Stagione ${year - 1} conclusa ═`);
        console.log(
          `  Incassi: ${(digest.wageCuts / 1000).toFixed(0)}k da % stipendi + ${(digest.signingFees / 1000).toFixed(0)}k da fee · cassa ${(state.cash / 1e6).toFixed(2)}M · rep ${state.reputation.toFixed(0)}`,
        );
        if (digest.expired.length) console.log(`  Ti hanno lasciato: ${digest.expired.join(', ')}`);
        if (digest.lost.length) console.log(`  Usciti dal giro: ${digest.lost.join(', ')}`);
        if (extras.observed > 0)
          console.log(
            `  Osservatori: ${extras.observed} nuovi report (costo ${(extras.scoutWages / 1000).toFixed(0)}k).`,
          );
        if (hypeOut.earned > 0)
          console.log(`  Agganci +${hypeOut.earned} (totale ${state.agganci}).`);
        if (hypeOut.bursts.length)
          console.log(
            `  💥 BOLLA SCOPPIATA su: ${hypeOut.bursts.join(', ')} — reputazione a picco.`,
          );
        if (extras.developed.length)
          console.log(`  La scommessa matura: ${extras.developed.join(', ')} (attributi su).`);
        shortlist = [];
        continue;
      }

      console.log(
        '  Comandi: liberi · scout <n> · firma <n> [pct%] [anni] · clienti · conti · avanza · quit',
      );
    }
  } finally {
    rl.close();
  }
}

/** Kept for symmetric imports in index.ts. */
export type { PlayerId as _AgentCliPlayerIdRef };
