# Organizer Servizi

App per tenere organizzati tutti i servizi a pagamento (abbonamenti AI, app di
lavoro, uso personale): nome, costo, frequenza, categoria, tipo e descrizione.

## Stato attuale: SCHELETRO funzionante (solo PC, salvataggio locale)

Questa è la fase 1: fondamenta solide prima della grafica.
- ✅ Modello dati + logica (costi, totali mese/anno)
- ✅ Aggiungi / modifica / elimina
- ✅ Filtri + ricerca
- ✅ Esporta / importa backup (.json)
- ⬜ Cloud + login (Firebase) — fase successiva
- ⬜ Interfaccia "bella e tech" — dopo
- ⬜ PWA installabile + mobile — alla fine

## Come provarlo
Apri `index.html` nel browser (doppio click). Funziona offline; i dati sono
salvati nel browser di **questo** PC finché non aggiungeremo il cloud.

## Architettura (pensata per restare flessibili)

Separazione netta in 3 strati, così cambiare il "motore dei dati" in futuro
(da locale a Firebase, o ad altro) tocca **un solo file**:

```
index.html ─ interfaccia (non sa nulla di dove sono i dati)
   │
   ├─ js/model.js  → logica pura: cos'è un servizio, validazione, calcolo totali
   ├─ js/store.js  → STRATO DATI sostituibile (oggi: LocalStore / domani: FirebaseStore)
   └─ js/app.js    → collega interfaccia + logica + dati
```

- **Sostituire il motore dati** = riscrivere solo `store.js` rispettando il
  "contratto": `tutti()`, `salva()`, `elimina()`, `sostituisciTutti()`.
- **I dati sono sempre tuoi**: il pulsante Esporta produce un `.json` portabile.

## Decisioni prese
- Forma finale: **PWA** (installabile su desktop e mobile, accesso da ovunque).
- Sync futura: **Firebase** (login con Google), scelto perché gratis e senza
  server da gestire — ma isolato in `store.js` per poterlo sostituire.
- Ordine di lavoro: scheletro PC → cloud → grafica → mobile/PWA.
