/*
 * store.js — STRATO DATI (il "traduttore" sostituibile).
 *
 * Questo è il file che rende l'app indipendente da DOVE i dati sono salvati.
 * Tutto il resto dell'app parla SOLO con i metodi qui sotto e non sa né deve
 * sapere se dietro c'è il browser, Firebase, un file o un server.
 *
 * "CONTRATTO" che ogni store deve rispettare (stessi nomi, stesso comportamento):
 *   tutti()                  -> Promise<array di servizi>
 *   salva(servizio)          -> Promise<servizio salvato>   (crea o aggiorna)
 *   elimina(id)              -> Promise<void>
 *   sostituisciTutti(lista)  -> Promise<void>                (per import/restore)
 *
 * Oggi usiamo LocalStore (salva nel browser di questo PC).
 * Domani basterà scrivere FirebaseStore con gli STESSI metodi e cambiare
 * una sola riga in fondo a questo file. Nient'altro nell'app cambia.
 */

/*
 * LocalStore — salva i dati nel browser di questo computer (localStorage).
 * Perfetto per lo scheletro: funziona subito, offline, senza account.
 * I dati restano su questo PC finché non aggiungiamo il cloud.
 */
class LocalStore {
  constructor(chiave = 'organizer_servizi') {
    this.chiave = chiave;
  }

  // Legge l'intero elenco dal browser. Se non c'è nulla, lista vuota.
  async tutti() {
    const grezzo = localStorage.getItem(this.chiave);
    if (!grezzo) return [];
    try {
      const lista = JSON.parse(grezzo);
      return Array.isArray(lista) ? lista : [];
    } catch {
      // Dato corrotto: meglio ripartire vuoti che far esplodere l'app.
      console.warn('Dati locali illeggibili, riparto da lista vuota.');
      return [];
    }
  }

  // Crea o aggiorna un servizio (riconosciuto dal suo id).
  async salva(servizio) {
    const lista = await this.tutti();
    const i = lista.findIndex((s) => s.id === servizio.id);
    if (i >= 0) lista[i] = servizio;   // esiste -> aggiorna
    else lista.push(servizio);         // nuovo  -> aggiungi
    this._scrivi(lista);
    return servizio;
  }

  // Elimina un servizio dato il suo id.
  async elimina(id) {
    const lista = (await this.tutti()).filter((s) => s.id !== id);
    this._scrivi(lista);
  }

  // Sostituisce TUTTO l'elenco in un colpo solo (serve all'import/ripristino).
  async sostituisciTutti(lista) {
    this._scrivi(Array.isArray(lista) ? lista : []);
  }

  // Scrittura grezza su localStorage. Privato (per convenzione, con "_").
  _scrivi(lista) {
    localStorage.setItem(this.chiave, JSON.stringify(lista));
  }
}

/*
 * SEGNAPOSTO per il futuro — quando aggiungeremo il cloud, qui nascerà:
 *
 *   class FirebaseStore {
 *     async tutti() { ... legge da Firestore ... }
 *     async salva(servizio) { ... scrive su Firestore ... }
 *     async elimina(id) { ... }
 *     async sostituisciTutti(lista) { ... }
 *   }
 *
 * Stessi metodi -> l'app non si accorge della differenza.
 */

// === UNICA RIGA DA CAMBIARE PER SCAMBIARE IL MOTORE DEI DATI ===
// Oggi: locale. Domani: new FirebaseStore(...).
const store = new LocalStore();

window.Store = store;
