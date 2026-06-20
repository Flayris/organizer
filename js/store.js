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
 *   categorie()              -> Promise<array di nomi>       (categorie salvate)
 *   salvaCategoria(nome)     -> Promise<void>                (aggiunge se non c'è)
 *   eliminaCategoria(nome)   -> Promise<void>                (toglie solo il nome)
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
  constructor(chiave = 'organizer_servizi', chiaveCat = 'organizer_categorie') {
    this.chiave = chiave;
    this.chiaveCat = chiaveCat; // seconda "scatola" per la lista delle categorie
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

  // Legge la lista delle categorie salvate (solo i nomi).
  async categorie() {
    const grezzo = localStorage.getItem(this.chiaveCat);
    if (!grezzo) return [];
    try {
      const lista = JSON.parse(grezzo);
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }

  // Aggiunge una categoria (se non esiste già, confronto senza maiuscole/minuscole).
  async salvaCategoria(nome) {
    nome = String(nome || '').trim();
    if (!nome) return;
    const lista = await this.categorie();
    if (!lista.some((c) => c.toLowerCase() === nome.toLowerCase())) {
      lista.push(nome);
      localStorage.setItem(this.chiaveCat, JSON.stringify(lista));
    }
  }

  // Toglie una categoria dalla lista (NON tocca i servizi).
  async eliminaCategoria(nome) {
    const cerca = String(nome || '').trim().toLowerCase();
    const lista = (await this.categorie()).filter((c) => c.toLowerCase() !== cerca);
    localStorage.setItem(this.chiaveCat, JSON.stringify(lista));
  }

  // Scrittura grezza su localStorage. Privato (per convenzione, con "_").
  _scrivi(lista) {
    localStorage.setItem(this.chiave, JSON.stringify(lista));
  }
}

/*
 * SheetStore — salva i dati nel CLOUD usando un foglio Google.
 * Parla con lo "sportello" (Apps Script) pubblicato sul foglio: stessi metodi
 * di LocalStore (tutti/salva/elimina/sostituisciTutti), così l'app non cambia.
 *
 * I dati vivono nel foglio Google e si sincronizzano su ogni dispositivo.
 */
class SheetStore {
  constructor(url, segreto) {
    this.url = url;
    this.segreto = segreto;
  }

  // Legge tutti i servizi dal foglio (richiesta GET con la parola segreta).
  async tutti() {
    const r = await fetch(this.url + '?token=' + encodeURIComponent(this.segreto));
    const dati = await r.json();
    if (dati.errore) throw new Error(dati.errore);
    return Array.isArray(dati.dati) ? dati.dati : [];
  }

  // Crea o aggiorna un servizio nel foglio.
  async salva(servizio) {
    await this._invia({ azione: 'salva', servizio });
    return servizio;
  }

  // Elimina un servizio dal foglio.
  async elimina(id) {
    await this._invia({ azione: 'elimina', id });
  }

  // Sostituisce TUTTO l'elenco (per import/ripristino backup).
  async sostituisciTutti(lista) {
    await this._invia({ azione: 'sostituisci', lista: Array.isArray(lista) ? lista : [] });
  }

  // Legge le categorie salvate dal foglio (GET, come per i servizi).
  async categorie() {
    const r = await fetch(this.url + '?token=' + encodeURIComponent(this.segreto));
    const dati = await r.json();
    if (dati.errore) throw new Error(dati.errore);
    return Array.isArray(dati.categorie) ? dati.categorie : [];
  }

  // Aggiunge una categoria nel foglio.
  async salvaCategoria(nome) {
    await this._invia({ azione: 'salvaCategoria', nome });
  }

  // Toglie una categoria dal foglio (NON tocca i servizi).
  async eliminaCategoria(nome) {
    await this._invia({ azione: 'eliminaCategoria', nome });
  }

  // Invio grezzo di una scrittura (POST). Privato (per convenzione, con "_").
  async _invia(corpo) {
    const r = await fetch(this.url, {
      method: 'POST',
      // "text/plain" evita il controllo CORS extra che Apps Script non gestisce.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: this.segreto, ...corpo }),
    });
    const risposta = await r.json();
    if (risposta.errore) throw new Error(risposta.errore);
    return risposta;
  }
}

// === CONFIGURAZIONE DEL FOGLIO GOOGLE ===
// url: l'indirizzo "/exec" della tua app web. segreto: la parola scelta nello script.
const CONFIG_SHEET = {
  url: 'https://script.google.com/macros/s/AKfycbwfniMNWa0hQheGN-ECiNl3WuEo6xuzImzXMvVL77rn-vJjGjrG279qrDMHMaJPE8DS/exec',
  segreto: 'organizer_laco_05',
};

// === UNICA RIGA CHE SCEGLIE IL MOTORE DEI DATI ===
// Ora: cloud su foglio Google. (Per tornare al locale: new LocalStore())
const store = new SheetStore(CONFIG_SHEET.url, CONFIG_SHEET.segreto);

window.Store = store;
