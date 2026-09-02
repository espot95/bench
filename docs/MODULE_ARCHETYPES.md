# MODULE_ARCHETYPES.md — Archetipi di ruolo, heatmap e RosterPack

> La conoscenza calcistica messa per iscritto: **forme di gioco, non persone**. Gli
> archetipi vivono nel core (`core/archetypes.ts`, dato condiviso puro), le heatmap sono
> funzioni parametriche, il RosterPack è contenuto OPZIONALE (GAME_DESIGN §9.2, decisione
> utente). Regola §1.2: l'archetipo di un giocatore è **DERIVATO, mai memorizzato**.

## 1. La libreria (`ARCHETYPES`, 17 tipi)

| Reparto | Archetipi |
|---|---|
| GK | portiere di linea · portiere-libero |
| DF | marcatore · centrale d'impostazione · terzino a tutta fascia · terzino bloccato |
| MF | regista basso · mediano di rottura · mezzala d'inserimento · tuttocampista · trequartista |
| FW | punta d'area · centravanti boa · seconda punta · falso nove · ala invertita · ala di fascia |

Ogni archetipo: `label` italiana, `position`, descrizione da report, **lobi di heatmap**
(1-3 gaussiane su campo normalizzato: x 0=propria porta→1 attacco, y 0=fascia sinistra→1
destra, autore = piede DESTRO), flag `mirrorByFoot` (terzini/ali/mezzali: il mancino
specchia — l'ala invertita è disegnata sul lato debole del piede), e `bias` sugli
attributi (-1..1) usato sia per derivare sia per generare.

## 2. Derivazione (`playerArchetype(player)`)

Puro e deterministico: tra gli archetipi del ruolo vince il punteggio
`Σ bias·(attr−50)/50` + un tiebreak hash(playerId, archetypeId)·0.15 (varietà stabile,
nessun RNG di simulazione). Mai persistito — coerente con l'overall derivato.

## 3. Heatmap (`archetypeHeatmap(archetype, foot, w=12, h=8)`)

Matrice normalizzata [0..1]: somma dei lobi gaussiani, specchiata sul piede se
`mirrorByFoot`. È la **verità** del giocatore; lo scouting la mostrerà con rumore che si
affina con le osservazioni (capitolo heatmap-nei-report, a seguire). Taratura futura:
`tools/statsbomb-archetypes.mjs` sugli eventi Serie A/PL 2015/16 (Open Data, con
attribuzione) → SOLO aggregati anonimi versionati in `docs/calibration/`.

## 4. RosterPack (contenuto opzionale, uso personale)

`generation/roster-pack.ts` (puro): il pack VESTE giocatori già generati — ne sovrascrive
nome/età/nazionalità/piede/attributi/tratti/potenziale, conservando id, contratti,
agenzie e popolazione (zero migrazioni, zero buchi). Va applicato PRIMA di `createSeason`
(liste ed Elo si formano dopo).

```ts
PackPlayer { name (INVENTATO), age, nationality, position, foot, archetype, level (1-100),
             potential?, standouts?: Record<attr, valore>, traits?: Partial<Personality>,
             trainedHere?: boolean, confidence?: 'alta'|'media'|'bassa' }
RosterPack { city, kitPrimary (hex del kit in identity.CITY_KITS), clubName?, players[] }
```

- `attributesForArchetype(position, archetype, level, seedKey)`: attributi pieni da
  livello + bias·12 + rumore hash ±3 (clamp 25-99), `standouts` sovrascrivono.
- `applyRosterPack(world, clubId, players)`: vestizione per reparto (i migliori generati
  prendono i profili di livello più alto); ritorna applicati/saltati.
- Mappatura club: la fa il GUSCIO (solo lui conosce `identity`): città + `kitPrimary`
  → clubId. I pack vivono in `ui/src/packs/` con nota "contenuto personale, non
  distribuire"; i profili sono a fasce di **confidenza dichiarate** (i `bassa` si
  rivedono con l'utente). Conoscenza ferma a inizio 2026.

## 5. Validazione

- Derivazione deterministica; ogni ruolo copre ≥3 archetipi su un mondo generato; le
  heatmap sono normalizzate, diverse tra archetipi, e il mancino specchia.
- Vestizione: popolazione invariata, contratti/agenzie intatti, l'inferenza restituisce
  l'archetipo autorato per ≥80% dei profili del pack (gli attributi generati dal bias
  devono "somigliare" all'intenzione).
- Calibrazione motore INTATTA: assegnazione via hash (nessun draw RNG in worldgen).
