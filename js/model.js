/*
 * model.js — Modello dati e logica pura dell'Organizer.
 *
 * Qui vive SOLO la "verità" sui dati: com'è fatto un servizio, come si
 * validano i campi e come si calcolano i totali di spesa.
 *
 * REGOLA: questo file non sa nulla di interfaccia (HTML) né di dove i dati
 * vengono salvati (Firebase, locale...). È logica pura e riutilizzabile.
 */

// Valori ammessi per i campi a scelta fissa. Centralizzati qui così l'app
// e l'interfaccia leggono sempre da un'unica fonte.
const FREQUENZE = ['settimanale', 'mensile', 'annuale'];
const CATEGORIE = ['lavoro', 'personale'];
const TIPI = ['AI', 'altro'];

/*
 * Crea un nuovo oggetto "servizio" con valori di default validi.
 * Non lo salva da nessuna parte: restituisce solo l'oggetto in memoria.
 */
function creaServizio(dati = {}) {
  const ora = new Date().toISOString();
  return {
    id: dati.id || generaId(),
    nome: dati.nome || '',
    tipo: dati.tipo || 'altro',          // AI | altro
    tipoAltro: dati.tipoAltro || '',     // testo libero, usato solo se tipo === 'altro'
    categoria: dati.categoria || 'personale', // lavoro | personale
    costo: typeof dati.costo === 'number' ? dati.costo : 0,
    frequenza: dati.frequenza || 'mensile',   // settimanale | mensile | annuale
    descrizione: dati.descrizione || '',
    creatoIl: dati.creatoIl || ora,
    modificatoIl: ora,
  };
}

/*
 * Controlla che un servizio sia valido. Restituisce un array di errori:
 * vuoto = tutto ok. Così l'interfaccia può mostrare messaggi precisi.
 */
function validaServizio(s) {
  const errori = [];
  if (!s.nome || !s.nome.trim()) errori.push('Il nome è obbligatorio.');
  if (typeof s.costo !== 'number' || isNaN(s.costo) || s.costo < 0) {
    errori.push('Il costo deve essere un numero maggiore o uguale a zero.');
  }
  if (!FREQUENZE.includes(s.frequenza)) errori.push('Frequenza non valida.');
  if (!CATEGORIE.includes(s.categoria)) errori.push('Categoria non valida.');
  if (!TIPI.includes(s.tipo)) errori.push('Tipo non valido.');
  return errori;
}

/*
 * Converte il costo di un servizio in costo MENSILE, qualunque sia la sua
 * frequenza. È il mattone su cui si reggono tutti i totali.
 *   settimanale -> 52 settimane l'anno / 12 mesi
 *   mensile     -> già mensile
 *   annuale     -> diviso 12
 */
function costoMensile(s) {
  switch (s.frequenza) {
    case 'settimanale': return (s.costo * 52) / 12;
    case 'annuale':     return s.costo / 12;
    case 'mensile':
    default:            return s.costo;
  }
}

// Costo annuale di un singolo servizio (12 mesi).
function costoAnnuale(s) {
  return costoMensile(s) * 12;
}

/*
 * Dato un elenco di servizi, calcola i totali aggregati.
 * Restituisce un riepilogo pronto da mostrare.
 */
function calcolaTotali(servizi) {
  const mensile = servizi.reduce((somma, s) => somma + costoMensile(s), 0);
  return {
    mensile,
    annuale: mensile * 12,
    numeroServizi: servizi.length,
  };
}

/*
 * Filtra e cerca tra i servizi. Tutti i criteri sono opzionali.
 *   testo     -> cerca in nome e descrizione (non sensibile a maiuscole)
 *   categoria -> 'lavoro' | 'personale' | 'tutte'
 *   tipo      -> 'AI' | 'altro' | 'tutti'
 */
function filtraServizi(servizi, { testo = '', categoria = 'tutte', tipo = 'tutti' } = {}) {
  const q = testo.trim().toLowerCase();
  return servizi.filter((s) => {
    const matchTesto = !q
      || s.nome.toLowerCase().includes(q)
      || s.descrizione.toLowerCase().includes(q)
      || (s.tipoAltro || '').toLowerCase().includes(q);
    const matchCategoria = categoria === 'tutte' || s.categoria === categoria;
    const matchTipo = tipo === 'tutti' || s.tipo === tipo;
    return matchTesto && matchCategoria && matchTipo;
  });
}

/*
 * Etichetta del tipo da mostrare nell'interfaccia.
 * Se il tipo è "altro" e c'è un testo personalizzato, mostra quello;
 * altrimenti mostra il tipo così com'è ("AI" oppure "altro").
 */
function etichettaTipo(s) {
  if (s.tipo === 'altro' && s.tipoAltro && s.tipoAltro.trim()) {
    return s.tipoAltro.trim();
  }
  return s.tipo;
}

// Genera un id semplice e univoco a sufficienza per un uso personale.
function generaId() {
  return 'srv_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Rende disponibili le funzioni agli altri file (store.js, app.js).
window.Model = {
  FREQUENZE, CATEGORIE, TIPI,
  creaServizio, validaServizio, etichettaTipo,
  costoMensile, costoAnnuale, calcolaTotali,
  filtraServizi,
};
