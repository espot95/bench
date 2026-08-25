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

## 8. VIAGGI DI MERCATO — comprare attivamente (M3, richiesta utente)

> Stato: engine in `market/negotiation.ts` (puro, RNG iniettato); UI `ui/src/MarketMap.tsx`
> (mappa Europa) + dialogo trattativa. La UI è guscio: ogni regola vive nell'engine.

### 8.1 La sezione (UI)
Bottone dall'hub/Sede → mappa d'Europa scura tinta col colore sociale. **Italia e
Inghilterra attive** (città reali dei club, da `clubIdentity`); le altre nazioni sono
marker spenti "In costruzione 🚧". Click città → club di quella città → rosa completa
(overall derivato, età, scadenza, prezzo stimato, status). **Ricerca globale** con filtri
combinabili: nome, ruolo, età, nazionalità, campionato, prezzo massimo, scadenza.

### 8.2 Status di mercato (`playerMarketStatus`)
Derivato (mai memorizzato) da rosa e finanze del venditore:
- **incedibile**: top-2 del club per overall E reparto non in surplus E cassa sana →
  ask ×1.5, il presidente può rifiutare il tavolo (composure alta, non a deadline).
- **in vetrina**: surplus di reparto (> target+1), o 30+ con ingaggio pesante, o cassa
  in sofferenza → ask ×0.85, soglie di chiusura più morbide.
- **cedibile**: il resto. Ask ×1.

### 8.3 Trattativa DINAMICA sul cartellino (`openNegotiation`/`offerFee`)
Macchina a stati con **mood del venditore** (0..1) e max `MAX_ROUNDS=4` giri:
- Offerta ≥ richiesta corrente → stretta di mano.
- Offerta < ask×`INSULT`(0.55) → mood crolla; sotto mood 0.2 il tavolo SALTA (definitivo).
- Altrimenti: controproposta = punto tra offerta e ask che scende con mood, giri,
  status, deadline day (`DEADLINE_SOFT`) e trattativa **in persona** (`IN_PERSON_DISCOUNT`).
  Personalità: composure tiene duro sul prezzo, temperament rischia il ribaltone del
  tavolo (riusa lo spirito di `BLOWUP`), ambition ha fame di cassa.
- Il venditore ha un **floor privato** (ask × fattore da status/personalità/pressioni):
  offerte ≥ floor a fine giri vengono accettate a malincuore.
- Ogni scambio produce righe di **log narrativo** (chi parla, cosa dice) per la UI.

### 8.4 L'ingaggio col giocatore (stage `wage`)
A cartellino chiuso: `playerAcceptsMove` (gap reputazione) — se rifiuta, salta tutto.
Poi 2 giri con l'entourage: richiesta = `expectedWage` × premio (ambition del giocatore,
step-down di reputazione chiede di più, scadenza chiede meno). Commissione agenzia come
da `agencyCommissionFor`.

### 8.5 Chiusura, finestre e PRE-ACCORDI (`finalizeDeal`)
Vincoli veri: cassa ≥ fee+commissione, transferBudget ≥ fee, rosa < 27. A finestra aperta
→ `executeTransfer` immediato. A finestra chiusa → **pre-accordo** (lo custodisce la
sessione UI, guscio): si esegue automaticamente alla prima giornata di finestra, con
riga in gazzetta. Le condizioni si ri-verificano all'esecuzione.

### 8.6 Trasferte (`TRIP_COST`), shortlist e DS
- Trattare **in persona** = trasferta: costo a ledger (`bookTrip`, type `other`),
  **max 1 viaggio per giornata** (stato di sessione), sconto `IN_PERSON_DISCOUNT` sulle
  soglie del venditore. Da remoto ("via fax"): nessun costo, nessuno sconto.
- **Shortlist**: stellina su qualunque giocatore (sessione UI); a inizio finestra la
  gazzetta ricorda gli obiettivi seguiti.
- **Suggerimenti del DS** (`dsSuggestions`): da `squadNeeds` del club utente → i migliori
  candidati raggiungibili (prezzo ≤ budget, score = overall − età×0.4 + gioventù).
  Deterministico, niente RNG.

## 9. M4 — Mercato con MEMORIA (richiesta utente: "più attivo" + rapporti storici)

> Engine: `market/relations.ts` (rapporti tra club), estensioni in `market/ai.ts`,
> aggancio rivali in `contracts/renewal-negotiation.ts`. Costanti in `RELATIONS`/`AI_MARKET`.

### 9.1 Rapporti storici tra club (`market/relations.ts`)
`World.clubRelations: Map<string, number>` — SPARSA (coppia assente = neutra), chiave
ordine-indipendente `clubRelationKey(a,b)`. Ogni trasferimento concluso tra due club
(`executeTransfer`, unico esecutore) fa `+BUMP(1)`; a ogni offseason `×DECAY(0.75)` e
pulizia sotto 0.1 (`decayRelations` in `advanceOffseason`). Letture clampate a `CAP(3)`.
Effetti ("è più facile trattare con chi conosci"):
- trattativa in uscita dell'utente (§8): floor del venditore ×(1−`FLOOR_EASE`·rel), mood
  iniziale +`MOOD_BOOST`·rel, riga narrativa ("dopo gli affari passati c'è fiducia");
- `collectOffers`: i club amici offrono un filo di più (fee ×(1+0.02·rel));
- `aiOffersForUser`: i club col rapporto vengono pescati per primi tra i pretendenti.
Persistenza: nel salvataggio JSON della UI (codec); NON nella persistence SQLite v1
(dichiarato: i salvataggi CLI non esistono ancora).

### 9.2 Domanda AI viva (`aiMarketRound`)
- **Spesa scalata**: chance per club ×(1 + `CASH_PUSH`·min(1, transferBudget/60M)·
  (0.5+ambizione)) — i ricchi ambiziosi (la PL col suo surplus) comprano di più.
- **Duelli**: con p=`DUEL_P` un secondo club con lo stesso bisogno rilancia → ask
  ×[1.08..1.25], vince chi ha più budget×ambizione, headline "DUELLO".
- **Effetto domino**: chi vende un titolare, con p=`DOMINO_P` reinveste SUBITO su un
  sostituto dello stesso ruolo (stessi vincoli), headline "EFFETTO DOMINO".
- **Sfuma sul gong**: al deadline day p=`GONG_P` che l'affare salti alla firma (headline,
  nessun trasferimento).

### 9.3 Rumors e borsino
`marketRumors(...)`: nelle finestre E nelle 2 giornate prima dell'apertura, indiscrezioni
procedurali (p=`RUMOR_P`/giornata) su accoppiamenti plausibili (`findTarget`), a volte sui
giocatori dell'utente ("la piazza trema"); `DealNews.playerId` (nuovo, additivo) le rende
tracciabili. **Borsino** (UI, Sede→Mercato): ultimi movimenti con freccia sopra/sotto la
valutazione (`fee` vs `baseMarketValue`) + voci 🔥 dai rumors.

### 9.4 Offerte con memoria e canale-rinnovi
- **Ritorno del rifiutato**: un'offerta AI rifiutata può tornare (p=`RETURN_OFFER_P`, una
  volta) con fee ×`RETURN_RAISE`(1.12) — `returnOffer`, memoria nella sessione UI.
- **Addii annunciati / cessioni richieste** (MODULE_CONTRACTS): i giocatori "leaving" o
  che chiedono la cessione (promessa tradita → `wantsOut`) finiscono nella hot-list:
  `solicitOffers` genera offerte AI REALI ma scontate (`HOT_DISCOUNT`) — incassi subito o
  li perdi a zero.
- **Stallo del mercenario**: al ritorno al tavolo cita un rivale REALE
  (`bestRivalInterest`: club che potrebbe permetterselo) e la richiesta sale almeno al suo
  livello — non più un rialzo astratto.
