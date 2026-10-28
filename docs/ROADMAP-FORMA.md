# FORMA — revisione esperienza fitness

## Obiettivo
Tema chiaro fisso, identità atletica lime/nero, illustrazioni SVG locali, registrazione di un esercizio per volta. Pochi testi, azioni esplicite, storico e dati precedenti preservati.

## Piano di implementazione
1. Identità e struttura: FORMA maiuscolo senza punto, tipografia sans, controlli coerenti, navigazione compatta, chiaro fisso anche per chi aveva il tema scuro
2. Sessione guidata: un esercizio visibile, stepper con stato delle serie, navigazione libera e riordino, salvataggio immediato e ripresa sullo stesso esercizio
3. Recupero fra serie: timer automatico persistente su deadline, proposta motivata da indicazioni scheda e storico realmente misurato, possibilità di saltare o aggiungere tempo
4. Carico muscolare recente: mappa SVG anteriore/posteriore e modello deterministico con serie confermate, contributi secondari, decadimento temporale e riferimento personale; nessuna promessa fisiologica o percentuale di prontezza
5. Home fitness e grafici: illustrazioni locali, stato allenamento e carico recente, schede consultabili
6. Verifica: test algoritmo, migrazione e API, flussi browser mobile/desktop, timer, riordino, aggiornamento PWA, verifica dati produzione e deploy

## Criteri di accettazione
- Nessuna perdita di carichi o storico e nessun trasferimento fra varianti non equivalenti
- Navigare o saltare un esercizio non conferma serie
- Timer resistente a reload e background, recupero muscolare presentato come stima del carico recente
- Dati mancanti espliciti; non inferire sonno, dolore, RPE o recupero completo
- SVG e asset interamente locali, nessuna dipendenza da AI o servizi esterni
- Nessun overflow a 360/390/768/1440 px; target tattili comodi; focus tastiera e riduzione movimento
- Pubblicazione solo dopo controlli con dati veri in lettura e test su database separato

## Completamento
- Identità FORMA e tema chiaro fisso: completati
- Illustrazioni originali per esercizi e mappa muscolare: completate, incluse varianti per gli attrezzi della scheda
- Sessione a esercizio singolo, stepper, riordino e ripresa: completati
- Timer persistente e raccomandazione da scheda/storico confrontabile: completati
- Visualizzazione trasparente del carico muscolare recente: completata
- Verifica: 25 test dati/algoritmo/API e 16 test browser superati; 20 layout a 360/390/768/1440 px senza overflow
- Regressione mobile del pulsante Successivo dopo digitazione: individuata e risolta mantenendo stabile la barra al blur
- Pubblicazione: frontend container aggiornato sul sito reale; backup SQLite creato prima del deploy
