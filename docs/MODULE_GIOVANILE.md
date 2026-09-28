# MODULE_GIOVANILE.md — Settore giovanile (F4b)

> Fasi G1+G2+G3 implementate: accademia a livelli, Primavera col torneo a minuti,
> prestiti formativi, offerte AI per i gioielli, intake dall'impero estero, bandiere.

## 1. Filosofia

Il vivaio è la **spesa strategica** del presidente: paghi oggi (investimento +
retta annua) per raccogliere tra anni. Coerente con la casa: **niente numeri**
(giudizi parlati con incertezza), **zero RNG di simulazione** (tutto da hash
`club|anno` via `createRng` locale), **tutto additivo** (i save vecchi non hanno
`academy` e nulla cambia; i club AI non hanno vivaio → lega byte-identica).

## 2. Modello (owner: `src/engine/academy.ts`)

- `AcademyState { level 1..4, builtYear, prospects[], lastIntakeYear }` — vive in
  `SessionExtras.academy` (guscio, SOLO club utente), NON in `world`.
- `AcademyProspect { player: Player, joinedYear }` — il ragazzo è un `Player`
  completo (archetipi, ruoli, corsa, altezza, radar derivano gratis) ma sta FUORI
  da `world.players` finché non viene promosso.
- `ACADEMY.LEVELS`: investimento/retta/classe/qualità/crescita —
  L1 3M+0.8M/anno classe 3; L2 6M+1.5M classe 4 (+6 rep); L3 12M+2.5M classe 5
  (+12); L4 25M+4M classe 6 (+20, crescita ×1.5). Max 18 in Primavera, si esce a
  `LEAVE_AGE` 20.

## 3. I meccanismi

- **Classe estiva** (`academyIntake`): 15-17 anni, nazionalità di casa al 75%,
  qualità `generatePlayer(rep club + repBonus)`; `trainedClubId = club` (le liste
  SPEC §14.2: cresciuto nel club).
- **Giudizio parlato** (`scoutJudgment`): stima = `potential` (campo nascosto già
  nel modello) + rumore stabile per (ragazzo, anni-in-accademia) che si restringe
  (±9 → ±2 in 3 anni). Fasce: predestinato ≥82 / da seguire ≥74 / buon prospetto
  ≥66 / grezzo. Fiducia: prima impressione → osservato → conosciuto.
- **Crescita estiva** (`growProspects`): chiude una quota del gap verso il
  potenziale (`GROWTH_SHARE` 0.28 × growth di livello × rumore 0.7-1.3, cap +7),
  applicata uniformemente agli attributi.
- **Promozione** (`promoteProspect`): rispetta lo squad cap, crea il contratto con
  `makeContract` (rng da hash), inserisce in `world.players`/`club.playerIds`.
- **Giro d'estate** (`settleAcademyYear`, da `advanceSeason` del guscio): retta a
  ledger (voce NUOVA `giovanile`), torneo Primavera, crescita, rientri dai
  prestiti, uscite d'età, classe nuova; ritorna il report per la gazzetta.

## 3b. G2 — Il torneo, i prestiti, i gioielli

- **Torneo Primavera** (`simulatePrimavera`): minuti per GERARCHIA dai valori veri
  (titolari ~2300′, rotazione ~1300′, margine ~450′, rumore hash ±15%); piazzamento
  1..16 dalla qualità dei titolari (+rumore); capocannoniere del vivaio. I minuti
  muovono la crescita (`MINUTES_GROWTH` 0.75→1.25): chi non gioca cresce poco.
- **Prestito formativo** (`sendOnLoan`, 17+): destinazione deterministica in
  seconda divisione di casa; l'anno fuori dà minuti pieni e crescita ×1.35 — ma nel
  20% dei casi il salto RIDIMENSIONA (×0.5). Rientro al conguaglio con esito
  raccontato ('maturato'/'ridimensionato').
- **Offerte AI** (`youthOffers`): fino a 2 l'anno per i 17+ giudicati predestinato/
  da seguire (non in prestito); fee = (potenziale stimato − 55) × 400k, ×1.5 il
  predestinato, min 1.5M; offerente deterministico dalla propria lega. Ignorarle =
  tenerli. `sellProspectDeal`: cassa + voce `plusvalenza` PURA; il guscio ferisce
  la piazza (soddisfazione −0.08 predestinato / −0.04, morde i rinnovi abbonamenti).

## 3c. G3 — L'impero e le bandiere

- **Intake dall'estero**: i mercati con ≥20k tifosi (`club.foreignFans`, l'impero
  di MODULE_SPONSORS §7) mandano ragazzi: `FOREIGN_SLOT_PCT` 30% per posto-classe,
  nazionalità dal mercato (hash). La campagna internazionale che semina tifosi ora
  semina anche calciatori.
- **Bandiere** (guscio, `SessionExtras.academyGrads`): ogni promosso è registrato;
  al 3º anno in prima squadra (ancora in rosa) diventa BANDIERA — gazzetta con lo
  striscione, soddisfazione +0.03, chip dorato nel pannello.

## 4. UI

Edificio "Settore giovanile" ATTIVO sull'hub (triangolo lime, anteprima con
livello e ragazzi); `Screen 'giovanile'` con `AcademyPane`: testata livello/retta/
upgrade, lista Primavera (badge ruolo, età, chip-giudizio colorato + fiducia),
scheda del selezionato (archetipo, corsa, Radar senza numeri) e bottone Promuovi
(disabilitato a rosa piena).

## 5. Gate

Suite (`academy.test.ts`: intake deterministico e fuori dal mondo, giudizi
stabili/fiducia, crescita+uscite, promozione con contratto e cap, retta+report),
biome, tsc core+ui, vite build. Niente ricalibrazione: il motore-partita non è
toccato.
