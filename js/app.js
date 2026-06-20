/*
 * app.js — Collega logica (Model) e dati (Store) all'interfaccia.
 *
 * Gestisce tutte le azioni dell'interfaccia: aggiungi, modifica, elimina,
 * totali, filtri, cambio vista e generazione del PDF di riepilogo.
 */

const { creaServizio, validaServizio, etichettaTipo, calcolaTotali,
        filtraServizi, costoMensile, costoAnnuale, categorieDa, contaCategorie,
        CATEGORIA_DEFAULT, FREQUENZE, TIPI } = window.Model;
const Store = window.Store;

// Stato dei filtri attualmente attivi nell'interfaccia.
let filtri = { testo: '', categoria: 'tutte', tipo: 'tutti' };

// Dati tenuti in memoria. Vengono RICARICATI dalla fonte (rete) solo quando
// cambiano davvero: salvataggio/eliminazione di un servizio o di una categoria.
// I filtri invece ridisegnano da qui, senza rifare la rete a ogni tasto.
let _servizi = [];
let _categorie = []; // elenco COMPLETO (unione) calcolato con categorieDa

// Formatta un numero come importo in euro (es. 12.5 -> "12,50 €").
function euro(n) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

// Formatta una data 'AAAA-MM-GG' in 'GG/MM/AAAA' (senza fusi orari, solo testo).
function formattaData(iso) {
  if (!iso) return '';
  const [a, m, g] = iso.slice(0, 10).split('-');
  return `${g}/${m}/${a}`;
}

/*
 * Ricarica i dati dalla fonte (rete) e ridisegna tutto.
 * Da chiamare dopo ogni modifica ai DATI: salva/elimina servizio,
 * aggiungi/elimina categoria.
 */
async function ricarica() {
  let listaServizi, categorieSalvate;
  try {
    // I due elenchi si leggono in parallelo per non aspettare due round trip in fila.
    [listaServizi, categorieSalvate] = await Promise.all([Store.tutti(), Store.categorie()]);
  } catch (err) {
    // Errore di rete o di accesso al foglio: avvisa invece di restare in silenzio.
    document.getElementById('lista').innerHTML =
      '<p class="vuoto">⚠️ Non riesco a leggere i dati dal foglio Google.<br>' +
      'Controlla la connessione e la configurazione. (' + escape(err.message) + ')</p>';
    return;
  }
  _servizi = listaServizi;
  _categorie = categorieDa(_servizi, categorieSalvate);
  popolaMenuCategorie(_categorie);
  render();
}

/*
 * Ridisegna la schermata usando SOLO i dati già in memoria (_servizi/_categorie)
 * e i filtri correnti: nessuna chiamata di rete. È quello che usano i filtri.
 */
function render() {
  const visibili = filtraServizi(_servizi, filtri);
  const totali = calcolaTotali(_servizi); // i totali sono sempre sull'INTERO elenco

  document.getElementById('totMensile').textContent = euro(totali.mensile);
  document.getElementById('totAnnuale').textContent = euro(totali.annuale);
  document.getElementById('conteggio').textContent = totali.numeroServizi;

  const lista = document.getElementById('lista');
  lista.innerHTML = '';
  if (visibili.length === 0) {
    lista.innerHTML = '<p class="vuoto">Nessun servizio da mostrare.</p>';
  } else {
    for (const s of visibili) {
      const riga = document.createElement('div');
      riga.className = 'servizio';
      riga.innerHTML = `
        <div class="servizio-info">
          <div class="servizio-riga1">
            <strong>${escape(s.nome)}</strong>
            <span class="tag">${escape(etichettaTipo(s))}</span>
            <span class="tag">${escape(s.categoria)}</span>
            <span class="tag ${s.pagamentoAutomatico ? 'tag-auto' : 'tag-manuale'}">${s.pagamentoAutomatico ? '🔁 Auto' : '✋ Manuale'}</span>
            ${s.dataRinnovo ? `<span class="rinnovo">🗓 ${formattaData(s.dataRinnovo)}</span>` : ''}
            <span class="prezzo">${euro(s.costo)} / ${s.frequenza}</span>
            <em>(${euro(costoMensile(s))}/mese)</em>
          </div>
          ${s.descrizione ? `<p>${escape(s.descrizione)}</p>` : ''}
        </div>
        <div class="servizio-azioni">
          <button data-modifica="${s.id}">Modifica</button>
          <button data-elimina="${s.id}">Elimina</button>
        </div>
      `;
      lista.appendChild(riga);
    }
  }
  renderCategorie();
}

/*
 * Riempie i due menù a tendina delle categorie (form e filtro) con l'elenco
 * completo, conservando la scelta corrente quando possibile.
 */
function popolaMenuCategorie(categorie) {
  const opzioni = categorie.map((c) => `<option value="${escape(c)}">${escape(c)}</option>`).join('');

  const selForm = document.querySelector('#form [name="categoria"]');
  const valoreForm = selForm.value;
  selForm.innerHTML = opzioni;
  if (categorie.includes(valoreForm)) selForm.value = valoreForm;
  else if (categorie.includes(CATEGORIA_DEFAULT)) selForm.value = CATEGORIA_DEFAULT;

  const selFiltro = document.getElementById('filtroCategoria');
  const valoreFiltro = selFiltro.value;
  selFiltro.innerHTML = '<option value="tutte">Tutte le categorie</option>' + opzioni;
  selFiltro.value = (valoreFiltro === 'tutte' || categorie.includes(valoreFiltro)) ? valoreFiltro : 'tutte';
}

/*
 * Disegna la lista delle categorie (vista "Categorie"): ordine alfabetico, con
 * il numero di servizi accanto e il pulsante Elimina (tranne per "generale",
 * che è fissa e non eliminabile).
 */
function renderCategorie() {
  const conta = contaCategorie(_servizi);
  const cont = document.getElementById('listaCategorie');
  cont.innerHTML = '';
  if (!_categorie.length) {
    cont.innerHTML = '<p class="vuoto">Nessuna categoria.</p>';
    return;
  }
  for (const nome of _categorie) {
    const n = conta[nome] || 0;
    const riga = document.createElement('div');
    riga.className = 'categoria-riga';
    const azione = nome === CATEGORIA_DEFAULT
      ? '<span class="categoria-fissa">fissa</span>'
      : `<button data-elimina-cat="${escape(nome)}">Elimina</button>`;
    riga.innerHTML = `
      <span class="categoria-nome">${escape(nome)}</span>
      <span class="categoria-conta">${n} ${n === 1 ? 'servizio' : 'servizi'}</span>
      ${azione}
    `;
    cont.appendChild(riga);
  }
}

/*
 * Aggiunge una nuova categoria (pulsante "+"). Chiede il nome, controlla che non
 * sia vuoto né già esistente, la salva e ricarica.
 */
async function aggiungiCategoria() {
  const nome = ((await chiediTesto('Nuova categoria', 'es. Streaming')) || '').trim();
  if (!nome) return;
  if (_categorie.some((c) => c.toLowerCase() === nome.toLowerCase())) {
    await avvisa('Categoria già presente', `Esiste già una categoria chiamata "${nome}".`);
    return;
  }
  try {
    await Store.salvaCategoria(nome);
  } catch (err) {
    await avvisa('Errore', 'Non sono riuscito a salvare la categoria:\n' + err.message);
    return;
  }
  await ricarica();
}

/*
 * Elimina una categoria, chiedendo SEMPRE conferma. Se ha servizi sotto, propone
 * di spostarli in "generale" prima di eliminarla (così non si perde nulla).
 */
async function eliminaCategoriaUI(nome) {
  const n = contaCategorie(_servizi)[nome] || 0;
  try {
    if (n > 0) {
      const ok = await chiediConferma('Eliminare la categoria?',
        `La categoria "${nome}" ha ${n} ${n === 1 ? 'servizio' : 'servizi'}.\n` +
        `Vuoi spostarli in "${CATEGORIA_DEFAULT}" ed eliminare la categoria?`);
      if (!ok) return;
      // Sposta in "generale" i servizi interessati e riscrive l'elenco in un colpo solo.
      const aggiornati = _servizi.map((s) =>
        s.categoria === nome ? { ...s, categoria: CATEGORIA_DEFAULT } : s);
      await Store.sostituisciTutti(aggiornati);
      await Store.eliminaCategoria(nome);
    } else {
      const ok = await chiediConferma('Eliminare la categoria?',
        `Sei sicuro di voler eliminare la categoria "${nome}"?`);
      if (!ok) return;
      await Store.eliminaCategoria(nome);
    }
  } catch (err) {
    await avvisa('Errore', 'Errore durante l\'eliminazione:\n' + err.message);
    return;
  }
  await ricarica();
}

/*
 * Mostra il campo "Specifica tipo" solo quando nel menu Tipo è scelto "altro".
 * Quando lo nasconde, svuota anche il testo per non lasciare dati orfani.
 */
function aggiornaCampoTipoAltro() {
  const f = document.getElementById('form');
  // La VISIBILITÀ del campo è gestita dalla CSS (regola :has), non da qui.
  // Questa funzione serve solo a svuotare il testo quando il tipo non è
  // "altro", così non salviamo un valore "orfano".
  if (f.tipo.value !== 'altro') f.tipoAltro.value = '';
}

// Piccola protezione: evita che testo inserito rompa l'HTML.
function escape(t) {
  return String(t).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

/*
 * === FINESTRA DI DIALOGO DELL'APP ===
 * Sostituisce i popup di sistema (alert/confirm/prompt) con una finestra in tema.
 * Restituisce una Promise: si risolve quando l'utente conferma o annulla.
 *   - con input:  Conferma -> testo scritto (anche ''), Annulla -> null
 *   - senza input: Conferma -> true, Annulla -> false
 */
function apriModale({ titolo, messaggio = '', input = false, placeholder = '',
                     testoConferma = 'Conferma', mostraAnnulla = true }) {
  return new Promise((resolve) => {
    const mod = document.getElementById('modale');
    const elTit = document.getElementById('modaleTitolo');
    const elMsg = document.getElementById('modaleMessaggio');
    const elInp = document.getElementById('modaleInput');
    const btnOk = document.getElementById('modaleConferma');
    const btnNo = document.getElementById('modaleAnnulla');

    elTit.textContent = titolo || '';
    elMsg.textContent = messaggio;
    elMsg.style.display = messaggio ? 'block' : 'none';
    elInp.style.display = input ? 'block' : 'none';
    elInp.value = '';
    elInp.placeholder = placeholder;
    btnOk.textContent = testoConferma;
    btnNo.style.display = mostraAnnulla ? 'inline-flex' : 'none';

    mod.classList.add('aperto');
    if (input) setTimeout(() => elInp.focus(), 30);

    function chiudi(valore) {
      mod.classList.remove('aperto');
      btnOk.removeEventListener('click', ok);
      btnNo.removeEventListener('click', no);
      mod.removeEventListener('click', sfondo);
      elInp.removeEventListener('keydown', tasto);
      document.removeEventListener('keydown', esc);
      resolve(valore);
    }
    const ok = () => chiudi(input ? elInp.value.trim() : true);
    const no = () => chiudi(input ? null : false);
    const sfondo = (e) => { if (e.target === mod) no(); };        // click fuori = annulla
    const tasto = (e) => { if (e.key === 'Enter') ok(); };         // Invio nel campo = conferma
    const esc = (e) => { if (e.key === 'Escape') no(); };          // Esc = annulla

    btnOk.addEventListener('click', ok);
    btnNo.addEventListener('click', no);
    mod.addEventListener('click', sfondo);
    if (input) elInp.addEventListener('keydown', tasto);
    document.addEventListener('keydown', esc);
  });
}

// Scorciatoie comode (al posto di prompt/confirm/alert).
const chiediTesto = (titolo, placeholder) =>
  apriModale({ titolo, input: true, placeholder, testoConferma: 'Aggiungi' });
const chiediConferma = (titolo, messaggio) =>
  apriModale({ titolo, messaggio, testoConferma: 'Sì, procedi' });
const avvisa = (titolo, messaggio) =>
  apriModale({ titolo, messaggio, mostraAnnulla: false, testoConferma: 'OK' });

/*
 * Legge i campi del form, costruisce il servizio, lo valida e lo salva.
 * Se l'id è presente significa che stiamo MODIFICANDO uno esistente.
 */
async function salvaDalForm(e) {
  e.preventDefault();
  const f = e.target;
  const servizio = creaServizio({
    id: f.id.value || undefined,
    nome: f.nome.value,
    tipo: f.tipo.value,
    // Salviamo il testo personalizzato solo se il tipo è "altro".
    tipoAltro: f.tipo.value === 'altro' ? f.tipoAltro.value : '',
    categoria: f.categoria.value,
    costo: parseFloat(f.costo.value),
    frequenza: f.frequenza.value,
    pagamentoAutomatico: f.pagamentoAutomatico.checked,
    dataRinnovo: f.dataRinnovo.value,
    descrizione: f.descrizione.value,
  });

  const errori = validaServizio(servizio);
  if (errori.length) { await avvisa('Controlla i dati', errori.join('\n')); return; }

  const btn = f.querySelector('button[type="submit"]');
  const testoBtn = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvataggio...'; // feedback durante la rete
  try {
    await Store.salva(servizio);
  } catch (err) {
    await avvisa('Errore', 'Non sono riuscito a salvare sul foglio Google:\n' + err.message);
    return;
  } finally {
    btn.disabled = false; btn.textContent = testoBtn;
  }
  f.reset();
  f.id.value = '';
  aggiornaCampoTipoAltro(); // dopo il reset, ripulisce il campo se serve
  await ricarica();
  mostraVista('servizi'); // mostra la lista così vedi subito il servizio salvato
}

// Carica un servizio nel form per modificarlo.
async function modifica(id) {
  const s = _servizi.find((x) => x.id === id);
  if (!s) return;
  const f = document.getElementById('form');
  f.id.value = s.id;
  f.nome.value = s.nome;
  f.tipo.value = s.tipo;
  f.tipoAltro.value = s.tipoAltro || '';
  aggiornaCampoTipoAltro(); // mostra il campo se il tipo caricato è "altro"
  f.categoria.value = s.categoria;
  f.costo.value = s.costo;
  f.frequenza.value = s.frequenza;
  f.pagamentoAutomatico.checked = !!s.pagamentoAutomatico;
  f.dataRinnovo.value = s.dataRinnovo || '';
  f.descrizione.value = s.descrizione;
}

/*
 * Costruisce l'HTML del documento PDF: titolo, data, tabella dei servizi col
 * costo nel periodo scelto (mensile o annuale) e il totale.
 */
function costruisciReport(servizi, periodo) {
  const annuale = periodo === 'annuale';
  const etichetta = annuale ? 'annuale' : 'mensile';
  const costoPeriodo = (s) => (annuale ? costoAnnuale(s) : costoMensile(s));
  const totale = servizi.reduce((t, s) => t + costoPeriodo(s), 0);
  const oggi = new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const righe = servizi.map((s) => `
    <tr>
      <td>${escape(s.nome)}</td>
      <td>${escape(etichettaTipo(s))}</td>
      <td>${escape(s.categoria)}</td>
      <td>${s.dataRinnovo ? formattaData(s.dataRinnovo) : '—'}</td>
      <td>${s.pagamentoAutomatico ? 'Automatico' : 'Manuale'}</td>
      <td class="num">${euro(costoPeriodo(s))}</td>
    </tr>`).join('');

  return `
    <h1>Riepilogo pagamenti — ${annuale ? 'Annuale' : 'Mensile'}</h1>
    <p class="meta">Generato il ${oggi} · ${servizi.length} servizi</p>
    <table>
      <thead>
        <tr>
          <th>Servizio</th><th>Tipo</th><th>Categoria</th>
          <th>Rinnovo</th><th>Pagamento</th>
          <th class="num">Costo ${etichetta}</th>
        </tr>
      </thead>
      <tbody>${righe || '<tr><td colspan="6">Nessun servizio inserito.</td></tr>'}</tbody>
      <tfoot>
        <tr><td colspan="5">Totale ${etichetta}</td><td class="num">${euro(totale)}</td></tr>
      </tfoot>
    </table>`;
}

/*
 * Prepara il documento e apre la stampa del browser (da cui si sceglie
 * "Salva come PDF"). Funziona su PC, iPhone e iPad.
 */
async function scaricaPdf() {
  const periodo = document.getElementById('periodoPdf').value; // mensile | annuale
  document.getElementById('reportStampa').innerHTML = costruisciReport(_servizi, periodo);

  // Imposta un nome di file sensato (la stampa usa il titolo della pagina).
  const titoloOrig = document.title;
  document.title = 'Riepilogo pagamenti ' + periodo;
  window.addEventListener('afterprint', () => { document.title = titoloOrig; }, { once: true });

  window.print();
}

/*
 * Mostra una delle due schermate ("servizi" o "gestione") e nasconde l'altra,
 * evidenziando la scheda corrispondente nella barra in alto.
 */
/*
 * Cambia schermata "via codice" (per i salti automatici: dopo il salvataggio
 * o quando si preme Modifica). Il cambio manuale con le schede invece è in pura
 * CSS e non passa di qui. Qui basta selezionare l'interruttore radio giusto.
 */
function mostraVista(nome) {
  // Mappa il nome logico della vista al rispettivo interruttore radio.
  const id = {
    servizi: 'tab-servizi',
    categorie: 'tab-categorie',
    nuovo: 'tab-nuovo',
    backup: 'tab-backup',
  }[nome] || 'tab-servizi';
  const radio = document.getElementById(id);
  if (radio) radio.checked = true;
}

// Collega tutti i pulsanti e i campi quando la pagina è pronta.
function inizializza() {
  document.getElementById('form').addEventListener('submit', salvaDalForm);
  // Mostra/nasconde il campo "Specifica tipo" al cambio del menu Tipo.
  document.querySelector('#form [name="tipo"]').addEventListener('change', aggiornaCampoTipoAltro);
  aggiornaCampoTipoAltro(); // stato iniziale corretto al caricamento
  document.getElementById('scaricaPdf').addEventListener('click', scaricaPdf);

  // Filtri (ridisegnano dai dati in memoria, senza rete).
  document.getElementById('cerca').addEventListener('input', (e) => {
    filtri.testo = e.target.value; render();
  });
  document.getElementById('filtroCategoria').addEventListener('change', (e) => {
    filtri.categoria = e.target.value; render();
  });
  document.getElementById('filtroTipo').addEventListener('change', (e) => {
    filtri.tipo = e.target.value; render();
  });

  // Click su Modifica/Elimina (delegato, vale anche per le righe future).
  document.getElementById('lista').addEventListener('click', async (e) => {
    const idMod = e.target.getAttribute('data-modifica');
    const idDel = e.target.getAttribute('data-elimina');
    if (idMod) { modifica(idMod); mostraVista('nuovo'); }
    if (idDel && await chiediConferma('Eliminare il servizio?', 'Vuoi eliminare questo servizio?')) {
      await Store.elimina(idDel); await ricarica();
    }
  });

  // Categorie: pulsante "+" e click su "Elimina" (delegato).
  document.getElementById('aggiungiCategoria').addEventListener('click', aggiungiCategoria);
  document.getElementById('listaCategorie').addEventListener('click', (e) => {
    const nome = e.target.getAttribute('data-elimina-cat');
    if (nome) eliminaCategoriaUI(nome);
  });

  ricarica();
}

document.addEventListener('DOMContentLoaded', inizializza);
