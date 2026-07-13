/**
 * Fase 0 diagnostic (GAME_DESIGN §10): generate a fictional world and print an end-to-end
 * summary of the core data model — entities, distributions, trait labels, derived-overall
 * check. NO engine involved: this validates the data model, not the simulation.
 */

import { wageBudgetStatus } from '../core/finance.js';
import { buildDefaultNations } from '../core/nations.js';
import { personalityLabel } from '../core/personality.js';
import { playerOverall } from '../core/ratings.js';
import { type World, leaguesOfNation, nationById } from '../core/types.js';
import { buildRosterList } from '../engine/roster.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';

export function runWorldSummary(seed: number, minimal: boolean): void {
  const rng = createRng(seed);
  const world = minimal
    ? generateWorld(rng, { nations: buildDefaultNations().slice(0, 1), divisions: 1 })
    : generateWorld(rng);

  const players = [...world.players.values()];
  console.log(`\n═══ World summary (seed ${seed}${minimal ? ', profilo minimo' : ''}) ═══\n`);

  // --- Struttura ---
  for (const nation of world.nations ?? []) {
    const pyramid = leaguesOfNation(world, nation.id);
    const label = pyramid.map((l) => `${l.name} (${l.clubIds.length} club)`).join(' · ');
    console.log(
      `  ${nation.name} [${nation.code}${nation.euMember ? ', UE' : ', non-UE'}]: ${label}`,
    );
  }
  console.log(
    `  Totali: ${world.clubs.size} club, ${players.length} giocatori, ` +
      `${world.agencies?.length ?? 0} agenzie, ${world.managers?.size ?? 0} manager, ` +
      `${world.presidents?.size ?? 0} presidenti, ${world.contracts.size} contratti`,
  );

  // --- Giocatori: distribuzioni ---
  const ages = players.map((p) => p.age);
  const overalls = players.map((p) => playerOverall(p));
  console.log('\n  Giocatori:');
  console.log(
    `    Età      min ${Math.min(...ages)}  media ${avg(ages).toFixed(1)}  max ${Math.max(...ages)}`,
  );
  console.log(
    `    Overall  min ${Math.min(...overalls).toFixed(1)}  media ${avg(overalls).toFixed(1)}  max ${Math.max(...overalls).toFixed(1)}  (derivato, mai memorizzato)`,
  );
  const selfRepresented = players.filter((p) => p.agencyId === null).length;
  console.log(`    Auto-rappresentati: ${selfRepresented} (professionalità ≥ 0.8)`);

  // --- Check: overall è una funzione pura degli attributi ---
  const sample = players[0];
  if (sample) {
    const again = playerOverall(sample);
    const stored = 'overall' in (sample as object);
    console.log(
      `    Check overall: ricalcolo stabile ${again === playerOverall(sample) ? 'OK' : 'FAIL'}; ` +
        `campo memorizzato assente ${stored ? 'FAIL' : 'OK'}`,
    );
  }

  // --- Etichette carattere (i numeri grezzi restano nascosti) ---
  console.log('\n  Esempi di carattere (etichette derivate):');
  for (const p of players.slice(0, 6)) {
    console.log(`    ${p.name.padEnd(22)} ${p.position}  età ${p.age}  → ${personalityLabel(p)}`);
  }

  // --- Manager / presidenti ---
  const managers = [...(world.managers?.values() ?? [])];
  const exPlayers = managers.filter((m) => m.exPlayer).length;
  console.log(
    `\n  Manager: età media ${avg(managers.map((m) => m.age)).toFixed(1)}, ex-giocatori ${exPlayers}/${managers.length}`,
  );
  const m0 = managers[0];
  if (m0)
    console.log(
      `    Es.: ${m0.name}, ${m0.age} anni, reputazione ${m0.reputation}${m0.exPlayer ? ', ex-giocatore' : ''}`,
    );

  // --- Finanze + liste (coerenza del modello, non logica) ---
  let inBudget = 0;
  let legalLists = 0;
  for (const club of world.clubs.values()) {
    if (wageBudgetStatus(world, club).withinBudget) inBudget++;
    if (buildRosterList(world, club).legal) legalLists++;
  }
  console.log(`\n  Club in-budget (monte ingaggi): ${inBudget}/${world.clubs.size}`);
  console.log(
    `  Club con quote piene sulla lista over-21: ${legalLists}/${world.clubs.size} (gli altri coprono i minimi con U22 esenti — nessun escluso su mondo fresco)`,
  );

  // --- Contenitori futuri ---
  console.log(
    `\n  Contenitori futuri: relazioni spogliatoio ${describeRelations(world)}, ` +
      `gruppi affinità ${world.affinityGroups?.length ?? 0} (vuoti per design in Fase 0)`,
  );
  console.log('');
}

function describeRelations(world: World): string {
  const total = [...(world.relationships?.values() ?? [])].reduce((n, s) => n + s.size, 0);
  return `${total} coppie non-neutre`;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
