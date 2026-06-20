/*
 * invia-notifiche.mjs — Il "mittente" delle notifiche push di Organizer.
 *
 * Gira su GitHub Actions una volta al giorno (vedi .github/workflows/notifiche-rinnovi.yml).
 * Cosa fa:
 *   1) legge i servizi dal foglio Google (via Apps Script);
 *   2) trova quelli che rinnovano ESATTAMENTE tra 15 / 5 / 1 / 0 giorni
 *      (soglie discrete, così non manda notifiche tutti i giorni);
 *   3) legge le iscrizioni (i dispositivi che hanno attivato le notifiche);
 *   4) invia a ciascuno una push con la libreria standard `web-push` (VAPID).
 *
 * Niente Firebase: è Web Push standard. I segreti arrivano dalle "GitHub Secrets".
 */
import webpush from 'web-push';

// --- Valori PUBBLICI (possono stare in chiaro) ---
const URL = 'https://script.google.com/macros/s/AKfycbyfyz7USG4Hwjspbava37AZl7hNKGlzijxIxKi1qWLh138WElq5p33-ML-vnnrwFMes/exec';
const VAPID_PUBLIC = 'BDNj-qiqXigBFooqUSfL4bVMISEEg6e7NiV3ChaYeycmqVgIB_9VNl3yMcGkJsBzU8A_Mmro0eGU1R2OvOGEXq8';
const VAPID_SUBJECT = 'mailto:0ics.srl@gmail.com';
const SOGLIE = [15, 5, 1, 0]; // giorni al rinnovo per cui inviare la notifica

// --- Segreti (dalle GitHub Secrets, via variabili d'ambiente) ---
const TOKEN = process.env.APPS_SCRIPT_TOKEN;     // token normale dell'app (legge i servizi)
const SEGRETO_PUSH = process.env.SEGRETO_PUSH;   // secondo segreto (legge/elimina iscrizioni)
const VAPID_PRIVATE = process.env.VAPID_PRIVATE; // chiave privata VAPID (firma le push)

if (!TOKEN || !SEGRETO_PUSH || !VAPID_PRIVATE) {
  console.error('Mancano dei segreti (APPS_SCRIPT_TOKEN / SEGRETO_PUSH / VAPID_PRIVATE).');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Giorni da oggi al rinnovo (uguale a Model.giorniAlRinnovo dell'app). null se senza data.
function giorniAlRinnovo(dataRinnovo, oggi = new Date()) {
  if (!dataRinnovo) return null;
  const p = String(dataRinnovo).slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || p.some(Number.isNaN)) return null;
  const rinnovo = new Date(p[0], p[1] - 1, p[2]);
  const base = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return Math.round((rinnovo - base) / 86400000);
}

// Chiamata POST all'Apps Script (text/plain per evitare il preflight CORS).
async function postAppsScript(corpo) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (j.errore) throw new Error(j.errore);
  return j;
}

function quando(g) { return g === 0 ? 'oggi' : (g === 1 ? 'domani' : `tra ${g} giorni`); }

async function main() {
  // 1) Servizi dal foglio.
  const risposta = await fetch(`${URL}?token=${encodeURIComponent(TOKEN)}`);
  const dati = await risposta.json();
  if (dati.errore) throw new Error(dati.errore);
  const servizi = Array.isArray(dati.dati) ? dati.dati : [];

  // 2) Quelli alle soglie (15/5/1/0 giorni).
  const imminenti = servizi
    .map((s) => ({ s, g: giorniAlRinnovo(s.dataRinnovo) }))
    .filter((x) => x.g !== null && SOGLIE.includes(x.g))
    .sort((a, b) => a.g - b.g);

  if (!imminenti.length) {
    console.log('Nessun rinnovo alle soglie oggi. Niente da inviare.');
    return;
  }

  // 3) Testo della notifica.
  let titolo, corpo;
  if (imminenti.length === 1) {
    const { s, g } = imminenti[0];
    titolo = `Rinnovo: ${s.nome}`;
    corpo = `${s.pagamentoAutomatico ? 'Automatico' : 'Manuale'} · rinnova ${quando(g)}`;
  } else {
    titolo = `${imminenti.length} rinnovi in arrivo`;
    corpo = imminenti.map(({ s, g }) => `${s.nome} (${quando(g)})`).join(', ');
  }
  const payload = JSON.stringify({ titolo, corpo });
  console.log('Invio:', titolo, '—', corpo);

  // 4) Iscrizioni + invio.
  const ris = await postAppsScript({ token: SEGRETO_PUSH, azione: 'iscrizioni' });
  const iscrizioni = Array.isArray(ris.iscrizioni) ? ris.iscrizioni : [];
  console.log(`Iscrizioni trovate: ${iscrizioni.length}`);

  let ok = 0, rimosse = 0, errori = 0;
  for (const sub of iscrizioni) {
    try {
      await webpush.sendNotification(sub, payload);
      ok++;
    } catch (err) {
      // 404/410 = iscrizione non più valida: la togliamo dal foglio.
      if (err.statusCode === 404 || err.statusCode === 410) {
        try { await postAppsScript({ token: SEGRETO_PUSH, azione: 'eliminaIscrizione', endpoint: sub.endpoint }); rimosse++; }
        catch { /* ignora */ }
      } else {
        errori++;
        console.warn('Errore invio:', err.statusCode || '', err.body || err.message);
      }
    }
  }
  console.log(`Fatto. Inviate: ${ok}, iscrizioni rimosse: ${rimosse}, errori: ${errori}`);
}

main().catch((err) => { console.error('Errore:', err); process.exit(1); });
