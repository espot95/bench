# CLAUDE.md — Stato globale del progetto

> Aggiornato a fine sessione, come da GAME_DESIGN §1.6 e §11. La fonte di verità del design è
> `GAME_DESIGN.md`; il binding tecnico tra moduli sarà `docs/ARCHITECTURE.md` (prodotto in Fase 0).

## Fase corrente: FASE 0 — Modello dati core + ARCHITECTURE.md

Obiettivo: fondamenta dati condivise (`src/core`, read-only dopo questa fase), schema SQLite con
round-trip save/load, `docs/ARCHITECTURE.md` rigido, CLI diagnostico. **Nessuna logica nuova di
ruoli o sistemi in questa fase.**

Stato: **pianificazione** — piano proposto, in attesa di conferma dell'utente.

## Eredità: cosa esiste già nel repo (pre-rifondazione)

Il repo contiene una implementazione precedente, validata e con **136 test verdi**, costruita a
fasi (storia dettagliata nel `CLAUDE.md` in radice, da consolidare qui a valle della Fase 0):

- **Motore partita/stagione** (Poisson + Dixon-Coles + Elo + varianza), calibrato su bande
  realistiche (casa ~45%, pari ~25%, gol ~2.87, campione ~83 pt). GAME_DESIGN §9.1 lo indica
  come "stato attuale", da evolvere a xG in Fase 1.
- **Dominio**: Player (attributi 1-100 taggati fisico/tecnico, potenziale, 11 tratti §5,
  injuryProneness, morale, trainedClubId, agentId), Club, League, Nation, Season, Match(+eventi),
  Contract (già esteso con fee/bonus/agente).
- **Sistemi già implementati** (oltre lo scope della Fase 0 della nuova roadmap):
  invecchiamento per-attributo con personalità; eventi partita (gol/cartellini/sostituzioni);
  infortuni; morale Strato 1; career multi-stagione con promo/retro; mondo a 2 nazioni
  (ITA/ENG) con liste/quote vivaio-UE; economia contratti + agenti + pool svincolati (parziale).
- **Persistenza** SQLite (Drizzle) con round-trip; **CLI** simulate-season / calibrate /
  manage / simulate-career.

Nota: `Player.overall` è oggi **memorizzato** (e persistito) — la Fase 0 lo rende derivato,
come da GAME_DESIGN §1.2.

## Decisioni aperte (in attesa dell'utente)

Vedi proposta di piano in conversazione: collocazione dei sistemi esistenti nella nuova
struttura §11, rimozione dell'overall memorizzato, consolidamento budget→FinancialState,
destino di nazioni/liste e infortuni (non presenti nel GAME_DESIGN), posizione di
CLAUDE.md/SPEC.md/GAME_DESIGN.md.

## Moduli toccati in questa sessione

- `docs/` creata; questo file. Nessun codice ancora (piano in attesa di conferma).
