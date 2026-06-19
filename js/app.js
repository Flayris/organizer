/*
 * app.js — Collega logica (Model) e dati (Store) all'interfaccia.
 *
 * Gestisce tutte le azioni dell'interfaccia: aggiungi, modifica, elimina,
 * totali, filtri, cambio vista e generazione del PDF di riepilogo.
 */

const { creaServizio, validaServizio, etichettaTipo, calcolaTotali,
        filtraServizi, costoMensile, FREQUENZE, CATEGORIE, TIPI } = window.Model;
const Store = window.Store;

// Stato dei filtri attualmente attivi nell'interfaccia.
let filtri = { testo: '', categoria: 'tutte', tipo: 'tutti' };

// Formatta un numero come importo in euro (es. 12.5 -> "12,50 €").
function euro(n) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

/*
 * Ridisegna l'intera schermata a partire dai dati salvati.
 * È la funzione che chiamiamo dopo ogni modifica: legge dallo Store,
 * applica i filtri, calcola i totali e aggiorna la pagina.
 */
async function aggiorna() {
  let tutti;
  try {
    tutti = await Store.tutti();
  } catch (err) {
    // Errore di rete o di accesso al foglio: avvisa invece di restare in silenzio.
    document.getElementById('lista').innerHTML =
      '<p class="vuoto">⚠️ Non riesco a leggere i dati dal foglio Google.<br>' +
      'Controlla la connessione e la configurazione. (' + escape(err.message) + ')</p>';
    return;
  }
  const visibili = filtraServizi(tutti, filtri);
  const totali = calcolaTotali(tutti); // i totali sono sempre sull'INTERO elenco

  document.getElementById('totMensile').textContent = euro(totali.mensile);
  document.getElementById('totAnnuale').textContent = euro(totali.annuale);
  document.getElementById('conteggio').textContent = totali.numeroServizi;

  const lista = document.getElementById('lista');
  lista.innerHTML = '';
  if (visibili.length === 0) {
    lista.innerHTML = '<p class="vuoto">Nessun servizio da mostrare.</p>';
    return;
  }
  for (const s of visibili) {
    const riga = document.createElement('div');
    riga.className = 'servizio';
    riga.innerHTML = `
      <div class="servizio-info">
        <div class="servizio-riga1">
          <strong>${escape(s.nome)}</strong>
          <span class="tag">${escape(etichettaTipo(s))}</span>
          <span class="tag">${s.categoria}</span>
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
    descrizione: f.descrizione.value,
  });

  const errori = validaServizio(servizio);
  if (errori.length) { alert(errori.join('\n')); return; }

  const btn = f.querySelector('button[type="submit"]');
  const testoBtn = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvataggio...'; // feedback durante la rete
  try {
    await Store.salva(servizio);
  } catch (err) {
    alert('Non sono riuscito a salvare sul foglio Google:\n' + err.message);
    return;
  } finally {
    btn.disabled = false; btn.textContent = testoBtn;
  }
  f.reset();
  f.id.value = '';
  aggiornaCampoTipoAltro(); // dopo il reset, ripulisce il campo se serve
  await aggiorna();
  mostraVista('servizi'); // mostra la lista così vedi subito il servizio salvato
}

// Carica un servizio nel form per modificarlo.
async function modifica(id) {
  const s = (await Store.tutti()).find((x) => x.id === id);
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
      <td>${s.categoria}</td>
      <td class="num">${euro(costoPeriodo(s))}</td>
    </tr>`).join('');

  return `
    <h1>Riepilogo pagamenti — ${annuale ? 'Annuale' : 'Mensile'}</h1>
    <p class="meta">Generato il ${oggi} · ${servizi.length} servizi</p>
    <table>
      <thead>
        <tr>
          <th>Servizio</th><th>Tipo</th><th>Categoria</th>
          <th class="num">Costo ${etichetta}</th>
        </tr>
      </thead>
      <tbody>${righe || '<tr><td colspan="4">Nessun servizio inserito.</td></tr>'}</tbody>
      <tfoot>
        <tr><td colspan="3">Totale ${etichetta}</td><td class="num">${euro(totale)}</td></tr>
      </tfoot>
    </table>`;
}

/*
 * Prepara il documento e apre la stampa del browser (da cui si sceglie
 * "Salva come PDF"). Funziona su PC, iPhone e iPad.
 */
async function scaricaPdf() {
  const periodo = document.getElementById('periodoPdf').value; // mensile | annuale
  let servizi;
  try {
    servizi = await Store.tutti();
  } catch (err) {
    alert('Non riesco a leggere i dati per il PDF: ' + err.message);
    return;
  }
  document.getElementById('reportStampa').innerHTML = costruisciReport(servizi, periodo);

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
  const id = nome === 'gestione' ? 'tab-gestione' : 'tab-servizi';
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

  // Filtri
  document.getElementById('cerca').addEventListener('input', (e) => {
    filtri.testo = e.target.value; aggiorna();
  });
  document.getElementById('filtroCategoria').addEventListener('change', (e) => {
    filtri.categoria = e.target.value; aggiorna();
  });
  document.getElementById('filtroTipo').addEventListener('change', (e) => {
    filtri.tipo = e.target.value; aggiorna();
  });

  // Click su Modifica/Elimina (delegato, vale anche per le righe future).
  document.getElementById('lista').addEventListener('click', async (e) => {
    const idMod = e.target.getAttribute('data-modifica');
    const idDel = e.target.getAttribute('data-elimina');
    if (idMod) { modifica(idMod); mostraVista('gestione'); }
    if (idDel && confirm('Eliminare questo servizio?')) {
      await Store.elimina(idDel); await aggiorna();
    }
  });

  aggiorna();
}

document.addEventListener('DOMContentLoaded', inizializza);
