# CLAUDE.md — Puntatore operativo

> **Le fonti di verità sono in `docs/`** — leggile prima di scrivere codice:
> - `docs/GAME_DESIGN.md` — la costituzione del gioco (design, ruoli, sistemi, roadmap §10).
> - `docs/ARCHITECTURE.md` — binding rigido tra moduli: nomi/tipi dei dati condivisi,
>   cosa è read-only, come si agganciano i moduli futuri.
> - `docs/CLAUDE.md` — stato globale del progetto, aggiornato a fine sessione.
> - `docs/SPEC.md` — formule e costanti del motore (Poisson/Dixon-Coles/Elo, eventi,
>   invecchiamento, morale, infortuni, liste). Se cambi una formula, aggiorna prima quello.

## Regole operative (sintesi — il dettaglio è in docs/)

- **Pianifica, poi implementa**: proponi architettura/piano e ASPETTA conferma (GAME_DESIGN §1.6).
- **Functional core, imperative shell**: `src/core` e `src/engine` puri e deterministici —
  niente I/O, niente `console`, niente `Math.random`/`Date.now`; RNG **iniettato** (mulberry32).
- **`src/core` è READ-ONLY dopo la Fase 0**: si estende solo aggiornando prima
  GAME_DESIGN/ARCHITECTURE. Il DB si tocca solo in `src/persistence/`. La CLI è solo wiring.
- **Attributi, non overall**: l'overall è derivato (`playerOverall()`), MAI memorizzato.
- **Calibrazione**: non toccare `engine/constants.ts` o la generazione senza rilanciare
  `calibrate` e i test (bande in `engine/calibration.test.ts`).
- A fine sessione: aggiorna `docs/CLAUDE.md` (cosa fatto, moduli toccati).

## Stack

TypeScript `strict`, Node 22+, ESM (`.js` negli import relativi, `NodeNext`). SQLite via
Drizzle (`better-sqlite3`). Test `vitest`, lint/format `biome`, dev `tsx`, build `tsc`.

## Comandi

```bash
npm install
npm test                     # vitest (suite completa)
npm run lint                 # biome check
npm run build                # tsc
```

**Su PowerShell/Windows NON usare `npm run dev -- <args>`** (il wrapper scarta i flag).
Invocare `tsx` direttamente:

```powershell
npx tsx src/cli/index.ts world-summary --seed 42        # diagnostica Fase 0 (modello dati)
npx tsx src/cli/index.ts simulate-season --seed 42      # stagione completa, 4 divisioni
npx tsx src/cli/index.ts calibrate --matches 20000      # report Monte Carlo del motore
npx tsx src/cli/index.ts manage --seed 42               # career interattiva da allenatore
npx tsx src/cli/index.ts simulate-career --seasons 5    # career automatica multi-stagione
```

Nota CLI: l'input interattivo usa un lettore a coda su `node:readline` (non
`readline/promises`, che perde righe con stdin da pipe).
