# MODULE_UI.md — La grafica (visione confermata dall'utente)

> `ui/` è un GUSCIO (stesse regole di `cli/`): importa il motore come libreria, MAI logica
> di gioco. Stack: Vite + React + TS strict + Tailwind, motore **in-browser** (Web Worker),
> salvataggi localStorage + export JSON. Tauri opzionale a fine corsa. Niente server.

## 1. Principio: POCHE informazioni, un LUOGO da esplorare

- **NO pagine dense.** La home è una **dashboard essenziale** tarata sul ruolo scelto.
- Il cuore è la **MAPPA delle strutture** (SVG procedurale, cliccabile): ogni edificio apre
  il SUO dettaglio. I menu esistono ma sono secondari (nav minimale).
- Le **infrastrutture del presidente** (GAME_DESIGN §3.2, future) diventeranno upgrade
  VISIBILI sulla mappa (lo stadio cresce, il centro sportivo si amplia).

## 2. Dashboard per ruolo (solo l'essenziale)

| Ruolo | Card in home |
|---|---|
| Allenatore | prossima partita · posizione · morale squadra · infortunati · ultimo risultato |
| Presidente | cassa+budget · posizione · allerta austerità · contratti in scadenza · allenatore(fit) |
| Procuratore | cassa · reputazione · agganci · mandati in scadenza · occasioni (liberi caldi) |

## 3. La mappa per ruolo (edificio → dettaglio)

**Allenatore (centro sportivo del club):** Stadio (giornata/report/classifica) · Campo
d'allenamento (rosa/formazione/morale) · Palazzina scouting (osservatori/report) · Sede
(proposte al presidente, mercato/bid) · Infermeria (infortunati) · Settore giovanile (U22/lista).

**Presidente (il club intero):** Stadio (biglietteria/capienza) · Uffici (finanze/ledger/
alloca) · Sala trattative (acquisti/cessioni/rinnovi) · Panchina (staff/hire-fire, stile+fit)
· Centro sportivo (rosa) · [lotto vuoto: "strutture future"].

**Procuratore (l'agenzia in città):** Ufficio (clienti/mandati/investimenti) · Sala stampa
(hype/bolle) · Scrivania scouting (liberi/osservatori) · Banca (conti/ledger) · Aeroporto
(piazzamenti nei club).

## 4. Stadi di consegna

UI-0 scaffolding+worker · UI-1 allenatore (mappa+dashboard+giornata) · UI-2 presidente ·
UI-3 procuratore · UI-4 salvataggi+polish(+Tauri). Estetica: dark gestionale, accenti di
stato (morale/pressione/forma), stemmi/kit procedurali (mondo fittizio, zero diritti).
