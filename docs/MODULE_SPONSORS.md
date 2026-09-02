# MODULE_SPONSORS.md — F2: gli sponsor come contratti veri

> Owner: `finances/sponsors.ts` (+ libreria `finances/sponsor-brands.ts`, ~200 aziende).
> Solo per il CLUB UTENTE (`Club.sponsors`, core additivo): i club AI restano alla riga
> sponsor aggregata (bande salve). Decisioni utente registrate: scommesse solo per club
> facoltosi/di massa con costo reputazione + malus tifosi; sponsor benefico (zero soldi,
> reputazione e tifosi felici); il soddisfatto può rinnovare ALLA STESSA CIFRA
> ("progetto" a lungo termine che alza piano); nomi ispirati al reale ma DISTORTI.

## 1. I 4 slot e il contratto

`maglia` (main) · `tecnico` (kit maker) · `stadio` (naming+cartelloni) · `allenamento`.
`SponsorContract { slot, brandId, brandName, annualValue, startYear, endYear,
expectation (posizione-obiettivo), satisfaction [0,1], clause? }` su `Club.sponsors`.
Alla partenza carriera 4 contratti iniziali (hash, no RNG) con somma ≈ la vecchia riga
sponsor (quote 45/30/15/10) e scadenze SFALSATE (2-4 anni): equilibrio al via, poi
divergi con le tue scelte.

## 2. La libreria brand (200, `sponsor-brands.ts`)

5 taglie — `micro · piccola · media · grande · multinazionale` — tutti i settori
(aviolinee, tech, auto, energia, banche/assicurazioni, telco, food/beverage, moda,
retail, logistica, gomme, orologi, gaming, streaming, turismo, farmaceutica, birre,
caffè, e-commerce, edilizia, agroalimentare locale…), kit maker dedicati (slots
tecnico/allenamento), **scommesse** e **benefiche**. Nomi distorti in chiave parodica
(mai identici ai reali). Carattere: `esigente` (aspettative alte, paga di più) ·
`paziente` (aspettative morbide) · `progetto` (rinnova alla stessa cifra e alza ~5%
a rinnovo). `clauseNation` (dal pool nazionalità del mondo) abilita la clausola merch.

## 3. Il mercato delle offerte

A slot scaduto/vuoto: **2-4 offerte** (`sponsorOffers`, RNG iniettato dal guscio) da
brand di taglia compatibile col club (rep: ≥82 multinazionale, ≥68 grande, ≥55 media,
≥45 piccola, sotto micro; ±1 di tolleranza). Valore = quota-slot × riga-sponsor del club
× moltiplicatore taglia (×1.5/1/0.55/0.3/0.12) × rumore; scommesse ×1.35; benefico 0.
Aspettativa dal carattere (esigente: attesa−3 o top-4; paziente: attesa+3; progetto:
attesa+1). L'**incumbent** soddisfatto rientra tra le offerte come RINNOVO: `progetto`
×1.05, contento (≥0.7) ×1.12, altrimenti STESSA CIFRA; sotto 0.35 **non rinnova**
(headline "L'AZIENDA SCARICA IL CLUB").

## 4. Clausole e speciali

- **nazionalità** (`merch`): con ≥1 giocatore in rosa della nazione del brand a fine
  stagione → bonus voce `merch` = 15-25% del valore annuo.
- **vetrina**: multinazionali esigenti — premio una tantum (20% annuo) se centri
  l'obiettivo dichiarato.
- **scommesse**: eleggibile SOLO se reputazione ≥70 O capienza ≥40k; paga ×1.35 ma alla
  firma reputazione −1 e, finché attivo, **botteghino −4%** (boicottaggio strisciante).
- **benefico**: `annualValue = 0`; finché attivo botteghino +3% (tifosi orgogliosi) e a
  ogni conguaglio reputazione +1 (cap 99). Sempre eleggibile.

## 5. Flussi e conguaglio (innesto nel tesoro, MODULE_FINANCES §5)

Con `Club.sponsors` presente: il tick paga i contratti in 2 tranche (g.1 e metà, nota
"slot: Brand") al posto della riga sponsor-base; i modificatori gate (±) si applicano al
botteghino del tick. Il conguaglio (`settleSponsors` dentro `settleUserSeason`):
soddisfazione ±(0.2/−0.25) su obiettivo centrato/mancato, bonus clausole (merch/vetrina),
benefico (+1 rep), scadenze → il guscio genera le offerte per gli slot vuoti
(`SessionExtras.sponsorOffers`) e le headline entrano nel riepilogo
(`OffseasonSummary.sponsorNews`). Slot lasciato vuoto = zero incassi finché non firmi.

## 6. Validazione

- Iniziali ≈ vecchia riga sponsor (±10%), scadenze sfalsate; grandi club → offerte da
  multinazionali, piccoli → micro/piccole; scommesse ineleggibile per il piccolo club.
- Scommesse: rep −1 alla firma e gate ridotto nel tick; benefico: gate aumentato e rep
  +1 al conguaglio. Clausola merch paga solo con la nazionalità in rosa.
- Obiettivo mancato → satisfaction giù → a scadenza niente rinnovo dall'incumbent.
- Bande AI intatte; determinismo pieno (offerte da RNG derivato dal seed).
