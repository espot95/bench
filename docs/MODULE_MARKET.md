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

## 7. Mercato AI ATTIVO (M1-M2, richiesta utente: "attivo ed entusiasmante")

> Stato: IMPLEMENTATO in `market/ai.ts` (puro, RNG iniettato). Il mondo compra e vende
> da solo nelle finestre; i club AI bussano alla porta dell'utente.

### 7.1 Finestre di mercato
`MARKET_WINDOWS`: **estiva** = giornate 1-4 (la stagione parte col mercato aperto, come
agosto), **invernale** = giornate 18-22. `marketWindowOpen(round, totalRounds)` scala
sulle stagioni corte. Fuori finestra: nessun trasferimento.

### 7.2 Bisogni di rosa (`squadNeeds`)
Per club e reparto (GK/DF/MF/FW): urgenza = carenza numerica rispetto a SQUAD_COMPOSITION
+ qualità media del reparto sotto la media rosa + invecchiamento (titolari 30+). Ordinati
per urgenza; il club AI compra dove ha più bisogno.

### 7.3 Giro di mercato AI (`aiMarketRound` — una chiamata per giornata di finestra)
Per ogni club AI della lega in gioco (mai il club utente, né come compratore né come
venditore): probabilità per giornata (`DEAL_CHANCE` 0.10, ×1.6 nell'ultima giornata di
finestra — deadline). Flusso: bisogno più urgente → target = miglior giocatore di quel
ruolo NON del club, di club con reputazione ≤ propria+8, overall ≥ media reparto,
prezzo ≤ transferBudget → `negotiateTransfer` (bid = ask × fattore ambizione compratore)
→ `playerAcceptsMove` → `executeTransfer` (ledger veri: il surplus PL finalmente circola).
Ritorna `DealNews[]` per il feed.

### 7.4 Offerte per i giocatori dell'utente (`aiOffersForUser`)
Ogni giornata di finestra: probabilità che un club AI (con budget e bisogno nel ruolo)
punti un giocatore dell'utente — più probabile per i migliori in rosa e verso deadline.
Offerta = askingPrice × (0.85..1.1). L'utente: **accetta** (executeTransfer inverso),
**controproone** una volta (accettata se ≤ ask × disponibilità ambizione compratore),
**rifiuta**. Rifiutare il Grande Salto (rep compratore ≥ rep+10) a un giocatore ambizioso
costa morale: `refusalMoraleHit` = −0.10 × ambition (professionalism attenua ×(1−0.5·prof)).
Le offerte scadono dopo 2 giornate.

### 7.5 Feed notizie (`DealNews`)
Ogni affare AI produce {round, buyer, seller, player, fee, headline} — titoli procedurali
("COLPO", "SGARBO", "AFFARE in extremis" a deadline). Nella UI: ticker dell'hub + tab
Mercato in Sede. Costanti in `AI_MARKET`, da rifinire con finance-health.
