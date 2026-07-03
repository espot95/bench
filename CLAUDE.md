# CLAUDE.md

Guida operativa per lavorare su questo repo. Tienila aggiornata: quando cambiano stack,
convenzioni o stato del progetto, aggiorna la sezione corrispondente.

## Cos'è

Gioco manageriale di calcio **single-player, locale, offline**, ispirato a Football Manager.
UI solo a menù/tabelle/schermate dati: **niente 3D, niente game loop realtime**.
Prima si costruisce e si valida un **motore headless** (dominio + simulazione), poi arriva la UI.

## Stack

- **Linguaggio/runtime**: TypeScript (`strict`), Node 22+ (dev su Node 23), ESM (`"type": "module"`).
- **Esecuzione dev**: `tsx`. **Build**: `tsc`.
- **CLI**: `commander`.
- **Persistenza**: **SQLite** via **Drizzle ORM** (`better-sqlite3` come driver, sincrono) +
  `drizzle-kit` per le migrazioni. Il salvataggio È un file `.sqlite`.
- **Test**: `vitest`.
- **Lint/format**: `biome`.
- **RNG**: PRNG seedabile scritto in casa (mulberry32) + distribuzioni (Poisson, Gauss).
  **Non** si usa `Math.random`.

## Perché queste scelte (per non rimetterle in discussione)

- **TS e non Java/Spring**: single-player locale, nessun server/concorrenza. Il motore puro TS
  viene poi **riusato tale e quale** come libreria dalla futura UI React.
- **SQLite e non Postgres**: nessun server, il save è un file portabile, `better-sqlite3` è
  sincrono (ideale per simulare tante partite in loop). Drizzle dà lo schema tipato/migrazioni
  ("strutturato") e, se un giorno servisse il cloud, la sintassi è quasi identica a Postgres →
  migrazione localizzata in `persistence/`.

## Architettura: functional core, imperative shell

Regola d'oro: **dominio e motore sono puri e deterministici; persistenza e CLI sono il guscio.**

```
src/
  rng/          PRNG seedabile + distribuzioni (poisson, gaussian)          [puro]
  domain/       entità e value object: Player, Club, League, Season,
                Match, Contract, Attributes; calcolo rating/overall         [puro, no I/O]
  engine/       motore partita, Elo, scheduler, classifica, motore stagione [puro, deterministico]
  generation/   generatore dati fittizi (nomi, attributi, rose)             [usa rng]
  persistence/  schema Drizzle + repository (map dominio<->tabelle)          [guscio]
  cli/          comandi commander, wiring, stampa report                    [guscio]
```

### Invarianti (NON violare)

1. **`engine/` e `domain/` non fanno I/O**: niente accesso al DB, niente `console`, niente `fs`.
2. **Niente `Math.random` / niente `Date.now()` dentro engine e domain**: l'RNG è **iniettato**
   come parametro. Ogni simulazione è riproducibile dato un `seed`.
3. **Il DB si tocca solo in `persistence/`**, dietro repository. Il resto del codice non conosce
   Drizzle né SQL.
4. **La CLI non contiene logica di gioco**: solo wiring (genera → simula → salva → stampa).

## Convenzioni di codice

- ESM puro, import con estensione esplicita `.js` nei path relativi (TS + `moduleResolution: NodeNext`).
- Preferire funzioni pure + tipi/`interface`/`type`; niente classi con stato mutabile condiviso nel core.
- ID come `string` (tipizzati con brand type dove utile, es. `PlayerId`, `ClubId`).
- Nessun numero magico sparso: le costanti del motore stanno in `engine/constants.ts` e sono
  documentate in `SPEC.md`.
- Attributi giocatore: scala **1–20** (stile FM).
- Nomi file: `kebab-case`. Nomi tipi: `PascalCase`. Funzioni/variabili: `camelCase`.

## Comandi (aggiornare man mano che esistono davvero)

```bash
npm install
npm run dev -- <comando>     # esegue la CLI via tsx
npm test                     # vitest
npm run lint                 # biome check
npm run build                # tsc
npm run db:generate          # drizzle-kit: genera migrazioni dallo schema
```

CLI prevista in Fase 1:

```bash
npm run dev -- simulate-season --seed 42        # simula una stagione, stampa classifica + statistiche
npm run dev -- calibrate --matches 20000 --seed 1  # report Monte Carlo per validare il motore
```

## Stato del progetto

Roadmap a fasi (MVP incrementale). **Regola**: non si passa alla UI finché il motore stagione
non è credibile e testato (statistiche nelle bande realistiche, vedi SPEC.md §Validazione).

- [ ] **Fase 0 — Scaffolding**: tooling, struttura, `rng/` con test, CLAUDE.md + SPEC.md.
- [ ] **Fase 1 — Motore headless (CLI, no UI)**
  - [ ] 1a Dominio + Attributes + calcolo rating
  - [ ] 1b Generazione dati fittizi: 1 lega, ~20 club, rose complete
  - [ ] 1c Motore partita (Poisson + Elo + varianza) + test statistico
  - [ ] 1d Motore stagione: scheduler + simulazione + classifica + Elo
  - [ ] 1e Persistenza SQLite (Drizzle): salva mondo + stagione + risultati
  - [ ] 1f CLI `simulate-season` + `calibrate` con report statistiche
  - [ ] **Gate**: statistiche realistiche su molti seed + test verdi → revisione umana prima della UI
- [ ] **Fase 2+ (dopo)**: sviluppo/invecchiamento giocatori, mercato, multi-stagione, coppe,
  infortuni/morale → **UI React (Vite)** che consuma il motore come libreria.

### Log decisioni

- Attributi su scala 1–20 (FM-like).
- SQLite + Drizzle confermato (no Postgres in Fase 1).
- Motore partita: Poisson con correzione Dixon–Coles + Elo per la forma + varianza per-partita.
