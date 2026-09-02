# MODULE_CUPS.md — F3: le coppe nazionali knockout

> Owner: `src/engine/cup.ts` (puro, RNG dedicato per coppa). Le coppe corrono IN
> PARALLELO al campionato: stream separati, stato serializzabile posseduto dalle shell
> (UI `SessionExtras.cups`, CLI locale). Ristrette alle leghe esistenti (richiesta
> utente): tutti i club delle due divisioni di ogni nazione.

## 1. Le tre coppe (formati fedeli al reale)

| Coppa | Nazione | Formato | Montepremi |
|---|---|---|---|
| **Coppa Italia** | ITA (40 club) | tabellone FISSO con teste di serie: le prime 8 del tier 1 (rank reputazione) entrano agli OTTAVI; le altre 32 giocano due turni preliminari. Gara secca in casa della meglio classificata; finale campo neutro. | ×1.2 |
| **FA Cup** | ENG (40 club) | SORTEGGIO integrale a ogni turno, nessuna testa di serie: il piccolo può pescare il gigante (in casa di chi è estratto primo). Le 16 di rango più basso giocano il turno preliminare. Finale campo neutro. | ×1.6 |
| **League Cup** | ENG (40 club) | come la Coppa Italia (tabellone con teste di serie; Carabao è solo lo sponsor). | ×0.7 |

Nazioni future senza formato dedicato: una "Coppa {nazione}" seeded ×1.0.

## 2. Calendario e turni

6 turni per coppa, intercalati al campionato: si giocano DOPO le giornate
`CUP.AFTER_ROUNDS = [3, 8, 14, 20, 27, 34]` (i "turni infrasettimanali"). Le shell
chiamano `playCupStage` quando la giornata di lega supera il checkpoint. 40 squadre:
preliminari fino a 32/16 → ottavi (dove entrano le teste di serie nei formati seeded)
→ quarti → semifinali → finale.

## 3. La partita di coppa

Motore VERO: `buildMatchScript` (cartellini/sub/duelli SPEC §19) + `simulateScore` +
`assignGoals` — referto completo con marcatori e minuti. Contesto di forza NAZIONALE
(entrambe le divisioni, `buildLeagueContext` su lega sintetica; xG profile del tier 1).
XI = migliore naturale; per il club utente vale la formazione sticky della shell.
Pareggio nei 90' → **rigori** (deterministici dal RNG di coppa, probabilità dalla
forza relativa, clamp 0.35-0.65; nessun fattore campo nella finale neutra).

**Limite dichiarato v1** (bande intatte per costruzione): Elo, infortuni e squalifiche
delle gare di coppa NON rimbalzano sul campionato — i risultati di lega sono
byte-identici con o senza coppe. Ponte fatica/squalifiche/turnover = v2.

## 4. Determinismo e salvataggi

RNG di coppa derivato dal seed (`seed ^ hash(cupId)`), stato PERSISTITO in
`NationalCup.rngState` e riallineato a ogni turno: salvataggio a metà stagione →
ripresa byte-identica. Il contesto di forza si ricostruisce dal mondo al momento del
turno (deterministico a parità di storia). Zero draw fuori dallo stream di coppa.

## 5. Soldi e gloria (voce `coppa` — MODULE_FINANCES)

- **Premio per turno superato** (a OGNI vincitrice, anche AI): ladder
  `CUP.PRIZES = [0.15, 0.3, 0.6, 1.2, 2.5] M` × prizeMult; finale: vincitrice 8M,
  finalista 3M (× mult). Cifre piccole vs ricavi (bande finanziarie monitorate).
- **Botteghino utente**: gara interna di coppa (non neutra) → voce `gate` nota
  "coppa", = gate di lega per-partita × `CUP.GATE_MULT 0.8`.
- **Reputazione**: vincitrice +2, finalista +1 (cap 99), applicate alla finale.
- Headline: sorprese (tier 2 elimina tier 1 o gap di rango ≥ 12), vincitrice.

## 6. Shell

- **UI**: `SessionExtras.cups` (create a inizio stagione e a ogni `advanceSeason`);
  `playRound` fa avanzare i turni dovuti, referto della gara utente nel report,
  gazzetta per sorprese/eliminazioni; vista tabellone (`cupView`).
- **CLI**: `simulate-season` crea e gioca le coppe, stampa il cammino e le vincitrici;
  `simulate-career` le gioca ogni stagione dentro `runCareer` (vincitrici nel report).
  `manage` senza coppe in v1 (dichiarato).

## 7. Validazione

- Struttura: 6 turni, 40→1, teste di serie che entrano agli ottavi nei formati seeded;
  FA Cup con sorteggio (accoppiamenti diversi tra seed diversi).
- Determinismo: stesso seed → stesso vincitore; campionato byte-identico con/senza coppe.
- Ogni vincitrice di turno incassa la voce `coppa`; la vincitrice prende il premio
  finale + rep; il club utente in casa incassa il gate.
- Bande career/calibrazione intatte (le coppe non toccano gli stream di lega).
