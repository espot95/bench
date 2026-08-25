# MODULE_CONTRACTS.md — Rinnovi negoziati col procuratore

> Spec di `src/contracts/` (GAME_DESIGN §6.1 esteso). **Niente autorinnovo per il club
> dell'utente**: chi scade e non viene rinnovato se ne va a parametro zero. Il rinnovo è
> una trattativa a più giri con l'agenzia del giocatore (o con lui, se auto-rappresentato),
> nello spirito della macchina M3 (MODULE_MARKET §8): stato puro, RNG iniettato, log
> narrativo, la UI è guscio. Costanti in `RENEWAL` (`contracts/renewal-negotiation.ts`).

## 1. Niente autorinnovo (engine/progression)

`renewOrRelease(world, rng, newYear, skipClubId?)`: per `skipClubId` (il club utente,
threaded da `advanceOffseason` → `closeSeason` in entrambe le shell) ogni contratto
scaduto NON rinnovato → **svincolo certo** (nessun cap, nessuna deriva neutra). Il resto
del mondo resta AI-passivo. Il vecchio `offerRenewal` (rinnovo "d'ufficio" della CLI)
resta come scorciatoia legacy.

## 2. Stance del giocatore (derivata, mai memorizzata)

- **Tifoso**: `isClubFan(player, clubId)` — hash deterministico con
  p = (vivaio del club? `FAN_P_TRAINED`=0.6 : `FAN_P_OTHER`=0.04) + 0.2·(lealtà−0.5).
  Il motore non conosce la geografia: il vivaio È il "nato lì e cresciuto nel club".
  Effetti: richiesta ×(1−`FAN_DISCOUNT`·(0.5+0.5·lealtà)), mood iniziale alto, non lascia
  il tavolo al primo giro.
- **Mercenario**: ambizione ≥0.65 ∧ lealtà ≤0.35 ∧ overall ≥ media rosa+2 → richiesta
  ×(1+0.15..0.30 con l'ambizione), sconta i bonus al 50% (vuole il fisso), preferisce
  contratti corti, e dal 2° giro può **prendere tempo** (p=0.4): stallo di 3-5 giornate
  "per sentire altre offerte", al ritorno richiesta ×1.08; se il progetto non convince,
  al ritorno **annuncia l'addio** a scadenza.
- **Pensa in grande**: ambizione ≥0.7 → guarda il **progetto**: `projectOk` = posizione
  attuale ≤4 oppure ≤ rank di reputazione del club nella lega ("lotta dove deve o meglio").
  Se il progetto NON convince, i soldi non bastano: servono **garanzie** — bonus
  trofeo+top-4 ≥ richiesta×26 settimane, oppure una **promessa di rinforzi** — altrimenti
  rifiuta ("non è questione di soldi").
- Modulatori: scadenza nell'anno → +10% di leva; **tradito** (promessa non mantenuta) →
  +20% e mood iniziale basso; temperamento → il tavolo può saltare su offerte insulto;
  compostezza → concessioni più lente.

## 3. Il pacchetto e il suo valore

Offerta = { ingaggio settimanale, anni, bonus, promessa? }. L'agente valuta il PACCHETTO:

```
valore = ingaggio + EV(bonus)/52 + (promessa ? richiesta×PROMISE_VALUE(0.08) : 0)
EV(bonus) = perGoal·EVG[pos]·q + perAssist·EVA[pos]·q + trophy·pTitolo + topFinish·pTop4
          + survival·pSalvezza          (q = clamp(overall/85, 0.4, 1.1))
  EVG = {GK 0, DF 1.5, MF 5, FW 12} gol/stagione · EVA = {GK 0, DF 2, MF 7, FW 5}
  pTitolo/pTop4/pSalvezza dal rank di reputazione del club nella sua lega
  mercenario: EV×0.5 · pensa-in-grande: trofeo/top-4 ×1.3
anni: scarto dagli anni desiderati (giovane lungo, vecchio corto, mercenario corto) →
  valore ×(1−0.04·|scarto|)
```

Offrire bonus **abbassa il fisso** accettato: trade-off vero, perché i bonus SI PAGANO (§5).

## 4. La macchina (`openRenewal` → `offerRenewalTerms` → esito)

Stati: `terms → done | failed | stalled | leaving`. Come M3: `MAX_ROUNDS`=4, mood 0..1,
insulto < richiesta×`INSULT`(0.7) → mood a picco, sotto `WALKOUT_MOOD` il tavolo salta
(cooldown `COOLDOWN`=6 giornate); controproposta = punto tra valore e richiesta che scende
con mood/giri/compostezza, mai sotto il **floor privato** (richiesta ×0.86-0.93, tifoso più
morbido); all'ultimo giro accetta ≥floor "a malincuore". Vincolo macchina SEMPRE: il nuovo
ingaggio deve stare nel monte (`wageBudgetStatus`), i bonus no (si pagano a consuntivo).
Accettazione = mutazione del contratto (wage/startYear/endYear/bonuses) — stesso owner di
`offerRenewal`. `resumeRenewal(state, round)` riapre gli stalli. Ogni battuta → log
narrativo {who: agente|tu|sistema}.

## 5. I bonus si PAGANO (`finances/bonus-settlement.ts`)

A fine stagione, per ogni lega chiusa (`closeSeason`): per ogni contratto CON bonus,
`settleContractBonuses(world, leagueId, stats, standings, year)` liquida
gol/assist (dai match events, passati come mappa piatta dall'engine — finances resta
core-only), trofeo (1°), top-4 (`ContractBonuses.topFinish`, campo NUOVO additivo),
salvezza (fuori dalle ultime 3, solo se la lega HA retrocessione). `perAppearance` non si
liquida in v1 (presenze non tracciate) e non si negozia in UI. Cassa −= totale, voce ledger
`other` "bonus contrattuali". Oggi solo i contratti dell'utente hanno bonus → bande
`finance-health` intatte.

## 6. Promesse di mercato (v1: "rinforzo di reparto")

Su accettazione con promessa il guscio registra {reparto, soglia = media reparto,
scadenza = ultima giornata della PROSSIMA finestra (`promiseDeadline`; se non ce n'è più
in stagione, la finestra estiva successiva)}. **Mantenuta** se arriva un acquisto di quel
reparto con overall ≥ soglia entro la scadenza. **Tradita** → `moraleShock(player,
−0.10−0.10·ambizione)` (helper del modulo morale, owner engine) + stance `betrayed` nei
rinnovi futuri + riga in gazzetta. Persistita nel salvataggio (`SessionExtras.promises`).

## 7. UI (Sede → tab Contratti)

Rosa con ingaggio/scadenza/agenzia, badge rosso "in scadenza", note di stato (stallo con
giornate residue / tavolo saltato / **addio annunciato**); "📠 Tratta" apre il tavolo chat
(stile NegotiationTable: bolle, mood, rilanci limitati) con ingaggio in k/sett, anni 1-5,
chip bonus (gol/assist/titolo/top-4/salvezza), promessa di reparto. Ticker hub:
"⚠ N contratti in scadenza". OffseasonScreen: i non rinnovati escono come svincolati
("se ne va a parametro zero") + riga "bonus pagati" nel bilancio.

## 8. Validazione

- Tifoso ≪ mercenario nelle richieste a parità di giocatore (stessi attributi, tratti
  diversi); il pensa-in-grande rifiuta nel club che non lotta e firma con la garanzia.
- Determinismo riga-per-riga (stesso seed → stesso dialogo); monte ingaggi MAI violato.
- Bonus liquidati = eventi reali (gol/assist contati dai fixtures; trofeo solo al 1°).
- Promessa tradita → morale giù e richiesta successiva più alta.
- Svincolo certo: club utente con contratto scaduto non rinnovato → giocatore fuori.
