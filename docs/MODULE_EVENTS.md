# MODULE_EVENTS.md — F4: l'estate e gli eventi (ritiro, tour mondiale, concerti)

> Owner: `src/engine/events.ts` (cataloghi + economia pura) + estensioni runner in
> `engine/season.ts`. Solo CLUB UTENTE (l'AI resta neutrale: bande salve). Scelte
> estive in `SessionExtras.summer`, proposte concerti in `SessionExtras.concertOffers`.
> Settore giovanile: RIMANDATO (scelta utente).

## 1. Ritiro estivo — la città conta (richiesta utente)

Catalogo `RITIRO_SPOTS` (località REALI — i toponimi sono liberi): Dimaro Val di Sole,
Auronzo, Pinzolo, Moena, Bad Waltersdorf, Algarve, Marbella, St. Moritz, Dubai + il
"campo comunale" di casa (economico, strutture povere). Ogni meta: `quality` 1-100
(strutture: campi, palestre, spa), `cost` (voce spesa `ritiro`).

**Effetto** (prime `PREP_ROUNDS 10` giornate, via `runner.applyPreparation`):
- forma: boost di squadra `1 + PREP_BOOST 0.03 × quality/100` su attacco+difesa;
- infortuni: `injuryMult = 1 − PREP_INJ 0.3 × quality/100` moltiplicato sull'`injMult`
  dei DuelMods di TUTTI i giocatori del club (stessa presa del duello, SPEC §19).
Niente ritiro = niente effetto (partenza diesel). Scelta bloccata alla 1ª giornata.

## 2. Tour estivo — in tutto il mondo (richiesta utente)

Catalogo `TOUR_DESTINATIONS`: emergenti (CHN/JPN/USA/KOR/IND) + AUS/SAU/MEX/BRA/ARG/
RSA + piazze europee vicine. Ogni meta: `market` (peso commerciale), `distance`
(vicino/medio/lontano → costo viaggio e stanchezza).

**Incasso** (voce `eventi`, può essere IN PERDITA — realismo):
`TOUR_BASE 2.5M × fama² × market × affinità − viaggio`, affinità = ×1.4 se hai già
tifosi nel mercato, ×1.2 se hai un giocatore di quella nazione. Il piccolo che va in
Cina ci rimette; il grande monetizza.

**Sinergie**:
- `settleForeignFans(..., touredNation)`: crescita del mercato ×`TOUR_FAN_MULT 1.5`
  quell'anno; senza giocatori della nazione il tour SEMINA `5k × fama` tifosi (il
  grande può aprire un mercato col tour; per il piccolo evaporano sotto MIN_KEEP).
- **Clausola sponsor `tour`** (grandi/multinazionali, p≈0.2): "porta il tour in
  {nazione}" → bonus 10-20% dell'annuo se `touredNation` coincide al conguaglio.

**Contropartita**: gambe pesanti alle prime giornate (`applyPreparation` con boost<1:
lontano 0.985×2 giornate, medio 0.99×1) — ritiro e tour si SOMMANO (stack di
modificatori): solo tour = ricco ma sfilacciato, entrambi = equilibrio.

## 3. Concerti — eventi attivi con usura del campo (richiesta utente)

Prerequisito: licenza `concerti` dello stadio (MODULE_STADIUM §3, che resta anche come
piccola rendita passiva di affitti). Ai round `CONCERT_ROUNDS [4,10,16,22,28,33]` un
promoter propone una data (artisti PARODIA di band, mai persone: Coldplace, The
Rolling Stoves, Oasys…): `cachet` fisso + botteghino, tier dell'artista gated su
capienza/reputazione. La data indica il round della gara: se quel round il club gioca
IN CASA (`homeClash`) il concerto è a ridosso del match.

- **Pubblicità per il pienone** (richiesta utente): 3 livelli (`AD_FILL 0/+0.20/+0.35`
  riempimento, costo `AD_COST_PER_SEAT 0/4/9` × capienza, voce spesa `eventi`).
  Conviene con stadio grande e piazza tiepida; a stadio già pieno è denaro buttato.
- **Incasso** = cachet + capienza × riempimento × `TICKET 30` − pubblicità (voce
  `eventi`); riempimento base = 0.35 + 0.35×rep/100 + richiamo del tier.
- **Usura del campo**: se `homeClash`, `runner.applyPitchWear(clubId, round)` → in
  QUELLA gara interna ogni squadra col gioco PALLA A TERRA (stile coach `possession`)
  ha i mod di stile smorzati (`WEAR_DAMP 0.4` verso il neutro) + `ownShots ×
  WEAR_SHOTS 0.96` — vale per entrambe le squadre, tua compresa. Cachet grosso nelle
  date scomode: incassi o proteggi il fraseggio.

## 4. Runner (engine/season.ts) e determinismo

- `applyPreparation(clubId, {boost, injuryMult, rounds})`: STACK di modificatori
  club-livello `[{until, boost, injuryMult}]` (ritiro + tour convivono); in partita i
  boost attivi si moltiplicano su attacco/difesa e gli injuryMult sugli injMult dei
  DuelMods. `applyPitchWear(clubId, untilRound)`.
- Snapshot: `preparation?` e `pitchWear?` opzionali (salvataggi vecchi ok).
- Con mappe vuote i fattori sono ESATTAMENTE 1 → calibrazione e lega bit-identiche
  senza eventi. Le proposte concerti usano RNG derivato dal seed nel guscio (come le
  offerte sponsor): zero draw sugli stream di simulazione.

## 5. Voci di bilancio (MODULE_FINANCES)

`eventi` (entrata: tour, concerti; uscita: pubblicità concerti, tour in perdita) e
`ritiro` (uscita). Etichette UI dedicate.

## 6. Validazione

- Tour: il grande netta più del piccolo; affinità che paga; perdita possibile e
  postata come spesa; clausola tour saldata solo con la nazione giusta; crescita
  fanbase ×1.5 con `touredNation`; semina per il grande senza giocatori.
- Ritiro: stack in snapshot; il boost ribalta ≥1 risultato su N seed (a parità di
  draw); injuryMult < 1 nei DuelMods del club preparato.
- Concerti: pubblicità che alza riempimento e netto (stadio grande e freddo) ed è
  sprecata a stadio pieno; `homeClash` dai fixtures; usura che cambia il risultato di
  una squadra `possession` e lascia BIT-IDENTICO un match senza palleggiatori.
- Bande career/calibrazione intatte (AI neutrale, fattori = 1 senza eventi).
