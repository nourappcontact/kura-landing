/* ============================================================
   KURA landing — interactivity + Firebase waitlist.

   Firestore model (rules live in the Firebase Console, NOT here):
     /waitlist/{autoId}  -> { email: string, createdAt: serverTimestamp }
         · write requires anonymous auth, shape validated by rules
         · client read is BLOCKED (emails are never read publicly)
     /meta/waitlist      -> { count: number, cap: number }
         · public read (just an aggregate, no emails) — drives the counter
         · count is bumped +1 in the same transaction as each signup

   The "first 100 get the gift" cap is reflected from `count` here, but the
   real source of truth is server-side: gift eligibility is derived from
   createdAt order at export time. The client never writes a position or a
   gift flag — it only mirrors state.
   ============================================================ */

/* Firebase is loaded LAZILY (dynamic import below) so a CDN hiccup never takes
   down the cosmetic board/counter — only the live signup needs the network. */

/* ------------------------------------------------------------
   Firebase web config — PUBLIC by design (safe to ship).
   >>> Pega aquí la config web del proyecto kura-app <<<
   (Firebase Console → Project settings → Your apps → Web app → SDK setup)
   ------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyBy5CPprm_lGGaLZI3T_ePOHwNUBBq-TOg",
  authDomain: "kura-app-5c1ba.firebaseapp.com",
  projectId: "kura-app-5c1ba",
  storageBucket: "kura-app-5c1ba.firebasestorage.app",
  messagingSenderId: "747963930994",
  appId: "1:747963930994:web:e46e3d79ae02e221d0a5eb",
  measurementId: "G-YBLMYT4224"
};

const GIFT_CAP = 100;
const configReady = !firebaseConfig.apiKey.startsWith('PEGA_AQUI');

/* ===================== Mini board (sprite mockup) ===================== */
(function renderBoard() {
  const el = document.getElementById('board');
  if (!el) return;

  // # wall · (space) floor · . goal · $ box · * box-on-goal · @ player
  const layout = [
    '######',
    '#@ . #',
    '# $  #',
    '#  $.#',
    '# .$ #',
    '######',
  ];
  const cols = layout[0].length;
  el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  el.style.gridTemplateRows = `repeat(${layout.length}, 1fr)`;

  const S = 'assets/sprites/';
  const floor = `url(${S}suelo.png)`;
  const tile = {
    '#': { bg: `url(${S}muro.png)` },
    ' ': { bg: floor },
    '.': { bg: `url(${S}objetivo.png)` },
    '$': { bg: floor, sprite: 'caja.png' },
    '*': { bg: floor, sprite: 'caja-colocada.png' },
    '@': { bg: floor, sprite: 'player-clasico-abajo.png' },
  };

  for (const row of layout) {
    for (const ch of row) {
      const t = tile[ch] || { bg: floor };
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.backgroundImage = t.bg;
      if (t.sprite) {
        const img = document.createElement('img');
        img.src = S + t.sprite;
        img.alt = '';
        img.className = 'px';
        img.style.width = '100%';
        img.style.height = '100%';
        cell.appendChild(img);
      }
      el.appendChild(cell);
    }
  }
})();

/* ===================== Counter UI ===================== */
const counterEl = document.getElementById('counter');
const counterNum = document.getElementById('counterNum');
const counterLabel = document.getElementById('counterLabel');
const hookTitle = document.getElementById('hookTitle');
const hookSub = document.getElementById('hookSub');
const submitBtn = document.getElementById('submitBtn');

function paintCounter(count) {
  const remaining = Math.max(0, GIFT_CAP - count);
  if (remaining > 0) {
    counterEl.classList.remove('sold');
    counterNum.textContent = remaining;
    counterLabel.textContent = `de ${GIFT_CAP} plazas de regalo libres`;
    hookTitle.innerHTML =
      'Los primeros 100 desbloquean KURA<br />completo gratis, para siempre.';
    hookSub.textContent =
      'Déjanos tu email. Sin spam, solo el aviso de lanzamiento y tu regalo.';
    submitBtn.textContent = 'Quiero mi regalo';
  } else {
    // Cap reached — form stays open as a normal waitlist.
    counterEl.classList.add('sold');
    counterNum.textContent = '0';
    counterLabel.textContent = 'Plazas de regalo agotadas';
    hookTitle.innerHTML = 'Plazas de regalo agotadas.<br />Pero aún puedes entrar en la lista.';
    hookSub.textContent = 'Apúntate y te avisamos en el lanzamiento.';
    submitBtn.textContent = 'Apuntarme a la lista';
  }
}

/* ===================== Firebase wiring ===================== */
const form = document.getElementById('waitlistForm');
const emailInput = document.getElementById('email');
const formMsg = document.getElementById('formMsg');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function showMsg(text, isError) {
  formMsg.textContent = text;
  formMsg.classList.toggle('error', !!isError);
}

if (!configReady) {
  // Lets the page be previewed before Firebase is wired up.
  counterNum.textContent = '100';
  counterLabel.textContent = `de ${GIFT_CAP} plazas de regalo libres`;
  showMsg('Lista abriéndose muy pronto — vuelve en unos días.', false);
} else {
  initFirebase().catch((e) => {
    console.error('Firebase load error', e);
    showMsg('No se pudo cargar el formulario. Recarga la página.', true);
  });
}

async function initFirebase() {
  const V = '10.12.2';
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const [{ initializeApp }, { getAuth, signInAnonymously }, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const {
    getFirestore,
    doc,
    collection,
    onSnapshot,
    runTransaction,
    serverTimestamp,
  } = fs;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const metaRef = doc(db, 'meta', 'waitlist');

  // Anonymous auth: needed to write, keeps the form gated against open spam.
  const authReady = signInAnonymously(auth).catch((e) => {
    console.error('Auth error', e);
    showMsg('No se pudo conectar. Recarga la página.', true);
  });

  // Live counter from the public aggregate doc (no emails are read).
  onSnapshot(
    metaRef,
    (snap) => paintCounter(snap.exists() ? snap.data().count || 0 : 0),
    (err) => {
      console.error('Counter error', err);
      paintCounter(0);
    },
  );

  let submitting = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;

    const email = emailInput.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      emailInput.classList.add('invalid');
      showMsg('Escribe un email válido, por favor.', true);
      return;
    }
    emailInput.classList.remove('invalid');

    submitting = true;
    submitBtn.disabled = true;
    showMsg('Apuntándote…', false);

    try {
      await authReady;

      // Create the signup and bump the aggregate count atomically.
      const newCount = await runTransaction(db, async (tx) => {
        const metaSnap = await tx.get(metaRef);
        const current = metaSnap.exists() ? metaSnap.data().count || 0 : 0;
        const next = current + 1;

        const waitlistRef = doc(collection(db, 'waitlist'));
        tx.set(waitlistRef, { email, createdAt: serverTimestamp() });
        tx.set(metaRef, { count: next, cap: GIFT_CAP }, { merge: true });
        return next;
      });

      form.reset();
      if (newCount <= GIFT_CAP) {
        showMsg(`¡Hecho! Eres el #${newCount} de 100 — regalo asegurado. 🎁`, false);
      } else {
        showMsg('¡Hecho! Estás en la lista, te avisamos en el lanzamiento.', false);
      }
    } catch (err) {
      console.error('Signup error', err);
      showMsg('Algo falló al apuntarte. Inténtalo de nuevo.', true);
    } finally {
      submitting = false;
      submitBtn.disabled = false;
    }
  });
}
