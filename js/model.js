/*
 * model.js — Modello dati e logica pura dell'Organizer.
 *
 * Qui vive SOLO la "verità" sui dati: com'è fatto un servizio, come si
 * validano i campi e come si calcolano i totali di spesa.
 *
 * REGOLA: questo file non sa nulla di interfaccia (HTML) né di dove i dati
 * vengono salvati (cloud, locale...). È logica pura e riutilizzabile.
 *
 * NOTA TECNICA: tutto è racchiuso in una funzione "scatola" (IIFE) così le
 * funzioni interne NON finiscono nello spazio globale condiviso con gli altri
 * script. Verso l'esterno espone solo `window.Model`. Questo evita conflitti
 * di nomi con app.js (che legge queste funzioni da window.Model).
 */
(function () {
  // Valori ammessi per i campi a scelta fissa. Centralizzati qui così l'app
  // e l'interfaccia leggono sempre da un'unica fonte.
  const FREQUENZE = ['settimanale', 'mensile', 'annuale'];
  const TIPI = ['AI', 'altro'];

  // Le categorie ora sono DATI gestibili dall'utente (foglio "Categorie"), non
  // più una lista fissa. Resta solo questa categoria speciale, sempre presente e
  // non eliminabile: è la "casa" dei servizi rimasti senza categoria.
  const CATEGORIA_DEFAULT = 'generale';

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
      categoria: dati.categoria || CATEGORIA_DEFAULT, // nome libero (vedi foglio Categorie)
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
    // La categoria è libera: basta che non sia vuota.
    if (!s.categoria || !String(s.categoria).trim()) errori.push('La categoria è obbligatoria.');
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
   *   testo     -> cerca in nome, descrizione e tipo personalizzato
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

  /*
   * Elenco COMPLETO delle categorie da mostrare, in ordine alfabetico:
   * unione di quelle salvate (foglio Categorie), di quelle effettivamente usate
   * dai servizi e della categoria fissa "generale". Così, anche senza migrazione,
   * le vecchie categorie (es. lavoro/personale) restano visibili finché sono in uso.
   */
  function categorieDa(servizi = [], salvate = []) {
    const insieme = new Set([CATEGORIA_DEFAULT]);
    const aggiungi = (c) => { if (c && String(c).trim()) insieme.add(String(c).trim()); };
    (salvate || []).forEach(aggiungi);
    (servizi || []).forEach((s) => aggiungi(s.categoria));
    return [...insieme].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  }

  /*
   * Conta quanti servizi ci sono sotto ciascuna categoria.
   * Restituisce una mappa { nomeCategoria: numero }.
   */
  function contaCategorie(servizi = []) {
    const conta = {};
    (servizi || []).forEach((s) => {
      const c = (s.categoria && String(s.categoria).trim()) || CATEGORIA_DEFAULT;
      conta[c] = (conta[c] || 0) + 1;
    });
    return conta;
  }

  // Genera un id semplice e univoco a sufficienza per un uso personale.
  function generaId() {
    return 'srv_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // UNICA cosa esposta all'esterno: l'interfaccia pubblica del modello.
  window.Model = {
    FREQUENZE, TIPI, CATEGORIA_DEFAULT,
    creaServizio, validaServizio, etichettaTipo,
    costoMensile, costoAnnuale, calcolaTotali,
    filtraServizi, categorieDa, contaCategorie,
  };
})();
