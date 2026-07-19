# MODULE_PRESIDENT.md — Proposte al presidente (base, Fase 1b)

> Specifica tecnica del canale manager→presidente (GAME_DESIGN §3.1, §3.2, §4) nella sua
> versione base: l'utente-manager propone uno **svincolato**, il presidente **IA** decide con
> budget + carattere e, se approva, il club **firma davvero**. La trattativa completa via
> agenzia (rilanci, pacchetti) resta in Fase 3; qui il presidente chiude "d'ufficio".
> Il codice deve corrispondere a questo documento.

## 1. Flusso

```
manager (utente) --propone--> presidente IA --valuta--> APPROVA -> firma (market/signing)
                                            \-> RIFIUTA (motivazione)
```

- Il pool degli svincolati è quello della finestra (rilasciati dall'AI + prospetti effimeri,
  `generation/free-agents.ts`), ricostruito a ogni stagione nel `manage`.
- Vedere il pool genera **1 osservazione scouting** per giocatore alla prima vista ("il tuo
  staff dà una prima occhiata"): l'utente vede **stime**, mai i numeri veri (MODULE_SCOUTING).
- La firma rimuove il giocatore dal pool; i prospetti effimeri si **materializzano** in
  `world.players` solo alla firma.

## 2. Ingaggio atteso (market/value.ts)

Il presidente valuta col **livello vero** (la dirigenza fa la sua due diligence; l'incertezza
scouting è dell'utente, non del club):

```
expectedWage(overall, age) = round( (BASE_WAGE + WAGE_SPAN · (overall/100)^3) · ageFactor )
  BASE_WAGE=4_000, WAGE_SPAN=180_000
  ageFactor: ≤23 → 0.85 · 24-29 → 1.0 · 30-32 → 0.9 · 33+ → 0.75   (i veterani costano meno)
```

Commissione all'agenzia (se il giocatore ne ha una): `COMMISSION_PCT=0.10` dell'ingaggio
annuale lordo (`wage · 52`), pagata **dalla cassa** alla firma. Auto-rappresentato → 0.
Durata offerta: età <24 → 4 anni · <30 → 3 · <33 → 2 · else 1.

## 3. La decisione del presidente (president/decisions.ts)

Vincoli DURI (mai violati, in quest'ordine — la prima violazione motiva il rifiuto):
1. **Monte ingaggi**: `bill + wage ≤ wageBudget` (`core/finance.ts`). Mai sforato.
2. **Cassa**: `commission ≤ cash`.
3. **Quote liste (§6.5)**: dopo la firma ipotetica il giocatore non deve risultare fuori
   lista (`engine/roster.ts`), e se extra-UE per la nazione (`classifyForNation`) deve
   esserci spazio nel **cap nuovi tesseramenti stagionali** (`nonEuCap`; ENG: ogni straniero).

Giudizio di merito (dopo i vincoli):
- **Qualità**: `playerOverall ≥ squadAvg − QUALITY_MARGIN` dove
  `QUALITY_MARGIN = 8 + 8·ambition − 6·composure` (l'ambizioso scommette, il prudente no).
- **Età**: se `age ≥ 31`, rifiuto se `professionalism > 0.6` e il giocatore non è
  chiaramente sopra la media squadra (i presidenti "aziendalisti" non pagano il declino).
- **Margine prudenziale**: il prudente vuole respiro sul budget:
  `wage ≤ headroom · (1 + 0.35·(ambition−0.5) − 0.35·(composure−0.5))`.
- **Impulsività**: con probabilità `IMPULSE·temperament` (IMPULSE=0.25) la decisione di
  merito si ribalta (il fumantino approva un capriccio o boccia un buon colpo). I vincoli
  duri NON si ribaltano mai.

Esito: `{ approved, reason, wage?, years?, commission? }` con motivazione in italiano
("non rientra nel monte ingaggi", "cap extracomunitari esaurito", "non alza il livello", …).

## 4. Firma (market/signing.ts — unico autorizzato a muovere giocatori, ARCHITECTURE §6)

`signFreeAgent(world, club, player, terms, year)`:
- se effimero → `world.players.set`; `club.playerIds.push`;
- nuovo `Contract` (`ct-fa-<anno>-<seq>`): `wage`, `startYear=anno`, `endYear=anno+durata−1`,
  `agencyId` del giocatore, `agencyCommission`;
- **cassa** −commissione + voce `expenses` (`type:'agency_fees'`) — prima scrittura ledger;
- ritorna il contratto. Nessun'altra mutazione (morale/liste si aggiornano da sole ai
  prossimi eventi; la lista si riconsidera a inizio stagione successiva, il runner corrente
  non ricalcola gli idonei — per questo il vincolo 3 va verificato PRIMA della firma).

## 5. CLI (`manage`)

- `market` — lista svincolati con stime scouting (prima vista = 1 osservazione) e n° cap
  extra-UE residuo.
- `market <n>` — proponi al presidente: stampa verdetto motivato; se approvato, dettagli
  della firma (ingaggio, anni, commissione).
- Tracking per stagione: `nonEuUsed` (reset a ogni stagione), firmati rimossi dal pool.

## 6. Validazione

- **Vincoli mai violati**: su centinaia di proposte simulate, ogni firma approvata rispetta
  monte ingaggi, cassa e cap extra-UE (test property-based su più seed).
- **Il carattere conta**: a parità di finanze, un presidente ambizioso/impulsivo approva più
  di un prudente su casi marginali.
- **Firma corretta**: giocatore in rosa, contratto creato, cassa scalata, voce a ledger,
  prospetti materializzati.
- **Cap ENG vs ITA**: in Inghilterra ogni straniero consuma il cap (se configurato), in
  Italia solo gli extra-UE.

---

## 7. Modalità PRESIDENTE giocabile (Fase 2c)

Scelta del ruolo a inizio carriera (`manage --role manager|presidente|entrambi`, alias
`preside`): **presidente puro** (formazione all'allenatore IA), **presidente+manager** (tutto).

### 7.1 Poteri del presidente-utente
- **Mercato in prima persona**: `market <n>`/`bid <pos> <n> [milioni]` senza il giudizio di
  merito IA (decidi tu), ma i **vincoli duri restano macchina**: monte ingaggi, cassa,
  budget trasferimenti, quote §6.5/`nonEuCap` — mai aggirabili (`checkHardConstraints`).
  Nel `bid` puoi indicare l'offerta in milioni (default 90% della richiesta); le contro-offerte
  entro budget si chiudono.
- **Cessioni** (`sell <n>`): metti in lista un tuo giocatore → offerte IA *passive-responsive*
  (`collectOffers`): compratori = club a cui il giocatore alza il livello, che possono
  permetterselo (LORO budget/cassa, mai violati) e che il giocatore accetta (gap reputazione);
  fee offerta = richiesta × (0.85 + 0.25·ambizione del compratore). Accetti la migliore o rifiuti.
- **Rinnovi** (`renew <n>`): nuovo contratto a `expectedWage` e durata per età; il giocatore
  accetta se l'offerta non è un taglio >10%; vincolo monte ingaggi macchina.
- **Finanze** (`finanze`): cassa, budget, ledger della stagione; `alloca <±milioni>` sposta
  denaro tra budget trasferimenti e monte ingaggi (settimanale = M/52), mai sotto il bill.

### 7.2 Semplificazioni dichiarate (v1)
- I compratori IA non tracciano il proprio cap extra-UE stagionale (usato 0); le altre quote
  liste sì. Si sistema col "mercato IA attivo" (capitolo dedicato).
- Le contro-offerte in acquisto si accettano automaticamente se dentro il budget (la
  negoziazione multi-passo interattiva è Fase 4).
