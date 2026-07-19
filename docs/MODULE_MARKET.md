# MODULE_MARKET.md — Mercato tra club (Fase 2b)

> Spec di `src/market/` per i trasferimenti a titolo definitivo (GAME_DESIGN §6.4, §4).
> Trattativa **single-shot** (l'IA risolve in un colpo: accetta/contro-offre/rifiuta; la
> negoziazione multi-passo interattiva è Fase 4). Prestiti = Fase 3+.

## 1. Prezzo richiesto dal venditore (`askingPrice`)

```
base = baseMarketValue(overall, età, potential, anniResidui)     // §6.4, già in value.ts
importanza = 1 + IMP_K · max(0, overall − mediaRosa) / 10        // i big costano oltre il valore
carattere  = 1 + ATTACH · loyaltyPres? no: presidente venditore:
             + PREMIUM_COMPOSURE · (composure − 0.5)              // il lucido non svende
             − DISCOUNT_AMBITION · (ambition − 0.5)               // l'ambizioso reinveste, vende
ask = base × importanza × clamp(carattere, 0.8, 1.5)
```
Contratto in scadenza (≤1 anno) già schiacciato da `baseMarketValue` (fattore residuo).

## 2. Esito della trattativa (`negotiateTransfer`, single-shot)

L'acquirente offre `bid`. Il venditore IA:
- `bid ≥ ask` → **accetta**;
- `bid ≥ ask × SOFT (0.85)` → **contro-offerta** a `(bid+ask)/2`; l'acquirente-presidente
  accetta la contro se rientra nel budget e nel suo carattere (ambizioso sì, prudente solo
  se ≤ ask×0.95); il fumantino può rompere (prob. `temperament × 0.2`);
- sotto → **rifiuta** («non è in vendita a queste cifre»).
- Il giocatore deve poi accettare il contratto (riuso `expectedWage`; rifiuto se il club
  compratore ha reputazione ≪ attuale e lui non è in scadenza — semplice gate `REP_GAP`).

## 3. Esecuzione (`executeTransfer` — unico a muovere giocatori, con `signing.ts`)

- Rose: rimozione dal venditore, aggiunta al compratore; vecchio contratto cancellato,
  nuovo creato (`ct-tr-<anno>-<n>` deterministico); commissione agenzia come in 1b.
- **Soldi**: compratore `cash −= fee`, `transferBudget −= fee`, ledger `transfer_in`;
  venditore `cash += fee`, ledger `transfer_out`. Vincoli PRIMA (mai violati):
  `fee ≤ transferBudget`, `fee+commissione ≤ cash`, ingaggio nel monte, quote §6.5/`nonEuCap`.

## 4. Ambientamento (GAME_DESIGN §5 — adattabilità + pressione del cartellino)

Alla firma il giocatore riceve `transferStatus` (core, transiente, persistito):
```
rampTotal     = round( RAMP_MIN(3) + RAMP_SPAN(14) · (1 − adaptability) )   // giornate
rampRemaining = rampTotal
pricePressure = clamp( FEE_K(0.6) · max(0, fee/base − 1) · (repCompratore/100), 0, 0.5 )
```
Effetti per-partita (`matchStrength`):
- contributo × `(1 − RAMP_MALUS(0.10) · rampRemaining/rampTotal)` — il nuovo rende meno
  finché non si ambienta (3-17 giornate secondo adattabilità);
- pressione efficace del giocatore = pressione piazza + `pricePressure` → filtrata dal
  CARATTERE via `pressureEffect` (SPEC §18): il fragile strapagato affonda, il leader la
  converte, il menefreghista non la sente.
Decadimento: a ogni giornata giocata dal club `rampRemaining−−`, `pricePressure × 0.85`;
a rampa esaurita `transferStatus` si rimuove. Svincolati (1b): rampa sì, pricePressure 0.

## 5. CLI (ruolo manager: propone, il presidente esegue — GAME_DESIGN §3.1)

`bid <pos. classifica> <n. giocatore>` nel `manage`: proposta al presidente → verdetto
(budget/quote/merito come 1b + fee dal §2) → racconto della trattativa. Le **cessioni**
arrivano con la modalità presidente (2c): il manager non controlla le vendite.

## 6. Validazione

- Vincoli mai violati su N trattative (budget/cassa/monte/quote, entrambi i lati).
- Carattere venditore: il lucido spunta di più, l'ambizioso vende più facilmente.
- Scadenza: fee crolla con ≤1 anno di contratto.
- Ambientamento: adaptability alta → rampa corta; strapagato fragile in big → resa giù,
  stesso trasferimento con leader → assorbito; ramp scade e si pulisce.
- Career gates invariati (l'IA non fa mercato attivo: solo l'utente muove giocatori).
