/*
 * Codice.gs — "Sportello" del foglio Google per l'Organizer Servizi.
 *
 * Questo piccolo programma vive DENTRO il foglio Google (Estensioni > Apps Script)
 * e fa da ponte tra l'app e le righe del foglio: legge, salva, elimina i servizi.
 *
 * I dati restano nel foglio "Servizi" (una riga per servizio). Tu puoi aprirlo
 * e vederli/modificarli a mano quando vuoi: è una normale tabella.
 *
 * --- COSA DEVI FARE TU ---
 * 1) Cambia la parola segreta qui sotto (una frase a tuo piacere).
 * 2) Pubblica come "App web" (Distribuisci > Nuova distribuzione).
 * 3) Dai a Claude il LINK della distribuzione e la stessa parola segreta.
 */

// ⚠️ CAMBIA QUESTA FRASE con una tua (servirà identica anche nell'app).
const SEGRETO = 'cambiami-con-una-frase-segreta';

// Colonne del foglio, in ordine. Corrispondono ai campi di un servizio nell'app.
const INTESTAZIONI = ['id', 'nome', 'tipo', 'tipoAltro', 'categoria',
                      'costo', 'frequenza', 'descrizione', 'creatoIl', 'modificatoIl'];

// Restituisce il foglio "Servizi", creandolo (con le intestazioni) se non esiste.
function foglio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Servizi');
  if (!sh) sh = ss.insertSheet('Servizi');
  if (sh.getLastRow() === 0) sh.appendRow(INTESTAZIONI);
  return sh;
}

// Legge tutte le righe e le trasforma in oggetti "servizio".
function leggiTutti() {
  const sh = foglio();
  const valori = sh.getDataRange().getValues().slice(1); // salta l'intestazione
  return valori.filter((r) => r[0]).map((r) => ({
    id: String(r[0]), nome: r[1], tipo: r[2], tipoAltro: r[3], categoria: r[4],
    costo: Number(r[5]) || 0, frequenza: r[6], descrizione: r[7],
    creatoIl: r[8], modificatoIl: r[9],
  }));
}

// Trova il numero di riga di un servizio dato il suo id (-1 se non c'è).
function trovaRiga(sh, id) {
  const n = Math.max(sh.getLastRow() - 1, 0);
  if (n === 0) return -1;
  const ids = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Crea o aggiorna un servizio (riconosciuto dall'id).
function salva(s) {
  const sh = foglio();
  const riga = [s.id, s.nome, s.tipo, s.tipoAltro, s.categoria,
                s.costo, s.frequenza, s.descrizione, s.creatoIl, s.modificatoIl];
  const r = trovaRiga(sh, s.id);
  if (r > 0) sh.getRange(r, 1, 1, riga.length).setValues([riga]);
  else sh.appendRow(riga);
}

// Elimina un servizio dato l'id.
function elimina(id) {
  const sh = foglio();
  const r = trovaRiga(sh, id);
  if (r > 0) sh.deleteRow(r);
}

// ===================== CATEGORIE =====================
// Le categorie vivono in un secondo foglio "Categorie" (una colonna "nome").
// Puoi aprirlo e modificarle a mano: è una normale tabella.

// Restituisce il foglio "Categorie", creandolo (con l'intestazione) se non esiste.
function foglioCat() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Categorie');
  if (!sh) sh = ss.insertSheet('Categorie');
  if (sh.getLastRow() === 0) sh.appendRow(['nome']);
  return sh;
}

// Legge i nomi delle categorie (salta l'intestazione, ignora le righe vuote).
function leggiCategorie() {
  const sh = foglioCat();
  return sh.getDataRange().getValues().slice(1)
    .map((r) => String(r[0] || '').trim())
    .filter((n) => n);
}

// Aggiunge una categoria (se non esiste già, confronto senza maiuscole/minuscole).
function salvaCategoria(nome) {
  nome = String(nome || '').trim();
  if (!nome) return;
  const esistenti = leggiCategorie();
  if (esistenti.some((c) => c.toLowerCase() === nome.toLowerCase())) return;
  foglioCat().appendRow([nome]);
}

// Toglie una categoria dal foglio (NON tocca i servizi).
function eliminaCategoria(nome) {
  const cerca = String(nome || '').trim().toLowerCase();
  const sh = foglioCat();
  const n = Math.max(sh.getLastRow() - 1, 0);
  if (n === 0) return;
  const valori = sh.getRange(2, 1, n, 1).getValues();
  // Dal basso verso l'alto, così cancellare una riga non sposta le successive.
  for (let i = n - 1; i >= 0; i--) {
    if (String(valori[i][0] || '').trim().toLowerCase() === cerca) sh.deleteRow(i + 2);
  }
}

// Sostituisce TUTTI i servizi (serve all'importazione di un backup).
function sostituisci(lista) {
  const sh = foglio();
  const ultimo = sh.getLastRow();
  if (ultimo > 1) sh.getRange(2, 1, ultimo - 1, INTESTAZIONI.length).clearContent();
  const righe = (lista || []).map((s) => [s.id, s.nome, s.tipo, s.tipoAltro, s.categoria,
                s.costo, s.frequenza, s.descrizione, s.creatoIl, s.modificatoIl]);
  if (righe.length) sh.getRange(2, 1, righe.length, INTESTAZIONI.length).setValues(righe);
}

// Confeziona una risposta in formato JSON.
function rispondi(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lettura (GET): l'app chiede l'elenco dei servizi e delle categorie.
function doGet(e) {
  if ((e.parameter.token || '') !== SEGRETO) return rispondi({ errore: 'non autorizzato' });
  return rispondi({ ok: true, dati: leggiTutti(), categorie: leggiCategorie() });
}

// Scrittura (POST): salva / elimina / sostituisci, in base all'azione richiesta.
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return rispondi({ errore: 'richiesta illeggibile' }); }

  if ((req.token || '') !== SEGRETO) return rispondi({ errore: 'non autorizzato' });

  switch (req.azione) {
    case 'tutti':            return rispondi({ ok: true, dati: leggiTutti() });
    case 'salva':            salva(req.servizio);             return rispondi({ ok: true });
    case 'elimina':          elimina(req.id);                 return rispondi({ ok: true });
    case 'sostituisci':      sostituisci(req.lista);          return rispondi({ ok: true });
    case 'categorie':        return rispondi({ ok: true, categorie: leggiCategorie() });
    case 'salvaCategoria':   salvaCategoria(req.nome);        return rispondi({ ok: true });
    case 'eliminaCategoria': eliminaCategoria(req.nome);      return rispondi({ ok: true });
    default:                 return rispondi({ errore: 'azione sconosciuta' });
  }
}
