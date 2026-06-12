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
  appId: "1:747963930994:web:e46e3d79ae02e221d0a5eb"
};

const GIFT_CAP = 100;
const configReady = !firebaseConfig.apiKey.startsWith('PEGA_AQUI');

/* ===================== i18n =====================
   All landing copy lives here (ES / EN). The page is never duplicated:
   data-i18n / data-i18n-ph attributes mark static nodes, and the dynamic
   counter / form strings are pulled from here too. Plain strings are set
   verbatim; functions receive runtime values (count, remaining cap…).
   ------------------------------------------------------------ */
const I18N = {
  es: {
    title: 'KURA — 500 niveles. Cero anuncios.',
    tagline: '500 niveles. Cero anuncios.<br />Paga una vez o no pagues nunca.',
    heroCta: 'Entrar en la lista &#9660;',
    gameTitle: 'El juego',
    skinsNote: 'Desbloquea todas las skins con la compra única.',
    rankingNote: 'Dos rankings por nivel: tiempo y movimientos.',
    movUnit: 'mov',
    whyTitle: 'Por qué KURA es distinto',
    card1Title: 'Cero anuncios',
    card1Body: 'Nunca. Ni banners, ni vídeos, ni interrupciones. El juego y tú, nada más.',
    card2Title: 'Sin suscripción',
    card2Body: 'Paga una vez y juega para siempre. Sin cuotas mensuales escondidas.',
    card3Title: 'Lógica de verdad',
    card3Body: '500 niveles del clásico juego de empujar cajas, con dificultad real. Sin prisas, sin azar: solo tu cabeza.',
    counterLoading: 'cargando plazas…',
    emailPlaceholder: 'tu@email.com',
    footerMeta: 'KURA · puzzle retro · Android primero · ',
    footerFine: 'Empuja cajas. Sin anuncios. Para siempre.',
    privacyLink: 'Política de privacidad',
    termsLink: 'Términos de uso',

    counterOpenLabel: (cap) => `de ${cap} plazas de regalo libres`,
    hookTitleOpen: 'Los primeros 100 desbloquean KURA<br />completo gratis, para siempre.',
    hookSubOpen: 'Déjanos tu email. Sin spam, solo el aviso de lanzamiento y tu regalo.',
    submitOpen: 'Quiero mi regalo',
    soldLabel: 'Plazas de regalo agotadas',
    hookTitleSold: 'Plazas de regalo agotadas.<br />Pero aún puedes entrar en la lista.',
    hookSubSold: 'Apúntate y te avisamos en el lanzamiento.',
    submitSold: 'Apuntarme a la lista',

    msgPreview: 'Lista abriéndose muy pronto — vuelve en unos días.',
    msgInvalid: 'Escribe un email válido, por favor.',
    msgLoadFail: 'No se pudo cargar el formulario. Recarga la página.',
    msgConnFail: 'No se pudo conectar. Recarga la página.',
    msgSubmitting: 'Apuntándote…',
    msgGift: (n) => `¡Hecho! Eres el #${n} de 100 — regalo asegurado. 🎁`,
    msgListed: '¡Hecho! Estás en la lista, te avisamos en el lanzamiento.',
    msgError: 'Algo falló al apuntarte. Inténtalo de nuevo.',
  },
  en: {
    title: 'KURA — 500 levels. Zero ads.',
    tagline: '500 levels. Zero ads.<br />Pay once or never pay.',
    heroCta: 'Join the list &#9660;',
    gameTitle: 'The game',
    skinsNote: 'Unlock every skin with the one-time purchase.',
    rankingNote: 'Two rankings per level: time and moves.',
    movUnit: 'mv',
    whyTitle: 'Why KURA is different',
    card1Title: 'Zero ads',
    card1Body: 'Never. No banners, no videos, no interruptions. Just you and the game.',
    card2Title: 'No subscription',
    card2Body: 'Pay once and play forever. No hidden monthly fees.',
    card3Title: 'Real logic',
    card3Body: '500 levels of the classic box-pushing puzzle, with real difficulty. No rush, no luck: just your brain.',
    counterLoading: 'loading spots…',
    emailPlaceholder: 'you@email.com',
    footerMeta: 'KURA · retro puzzle · Android first · ',
    footerFine: 'Push boxes. No ads. Forever.',
    privacyLink: 'Privacy policy',
    termsLink: 'Terms of use',

    counterOpenLabel: (cap) => `of ${cap} free gift spots left`,
    hookTitleOpen: 'First 100 unlock the full<br />game free, forever.',
    hookSubOpen: 'Drop your email. No spam — just the launch alert and your gift.',
    submitOpen: 'I want my gift',
    soldLabel: 'Gift spots full',
    hookTitleSold: 'Gift spots full.<br />But you can still join the list.',
    hookSubSold: 'Sign up and we’ll alert you at launch.',
    submitSold: 'Join the list',

    msgPreview: 'List opening very soon — check back in a few days.',
    msgInvalid: 'Please enter a valid email.',
    msgLoadFail: 'Couldn’t load the form. Reload the page.',
    msgConnFail: 'Couldn’t connect. Reload the page.',
    msgSubmitting: 'Signing you up…',
    msgGift: (n) => `Done! You’re #${n} of 100 — gift secured. 🎁`,
    msgListed: 'Done! You’re on the list, we’ll alert you at launch.',
    msgError: 'Something went wrong. Please try again.',
  },
  fr: {
    title: 'KURA — 500 niveaux. Zéro pub.',
    tagline: '500 niveaux. Zéro pub.<br />Payez une fois ou jamais.',
    heroCta: 'Rejoindre la liste &#9660;',
    gameTitle: 'Le jeu',
    skinsNote: 'Débloquez tous les skins avec l’achat unique.',
    rankingNote: 'Deux classements par niveau : temps et coups.',
    movUnit: 'cps',
    whyTitle: 'Pourquoi KURA est différent',
    card1Title: 'Zéro pub',
    card1Body: 'Jamais. Ni bannières, ni vidéos, ni interruptions. Rien que vous et le jeu.',
    card2Title: 'Sans abonnement',
    card2Body: 'Payez une fois et jouez pour toujours. Aucun frais mensuel caché.',
    card3Title: 'De la vraie logique',
    card3Body: '500 niveaux du classique jeu de pousser des caisses, avec une vraie difficulté. Sans précipitation, sans hasard : juste votre tête.',
    counterLoading: 'chargement des places…',
    emailPlaceholder: 'vous@email.com',
    footerMeta: 'KURA · puzzle rétro · Android d’abord · ',
    footerFine: 'Poussez des caisses. Sans pub. Pour toujours.',
    privacyLink: 'Politique de confidentialité',
    termsLink: 'Conditions d’utilisation',

    counterOpenLabel: (cap) => `sur ${cap} places cadeau gratuites`,
    hookTitleOpen: 'Les 100 premiers débloquent KURA<br />en entier, gratuit, pour toujours.',
    hookSubOpen: 'Laissez-nous votre email. Sans spam, juste l’annonce du lancement et votre cadeau.',
    submitOpen: 'Je veux mon cadeau',
    soldLabel: 'Places cadeau épuisées',
    hookTitleSold: 'Places cadeau épuisées.<br />Mais vous pouvez encore rejoindre la liste.',
    hookSubSold: 'Inscrivez-vous et on vous prévient au lancement.',
    submitSold: 'Rejoindre la liste',

    msgPreview: 'La liste ouvre très bientôt — revenez dans quelques jours.',
    msgInvalid: 'Saisissez un email valide, s’il vous plaît.',
    msgLoadFail: 'Impossible de charger le formulaire. Rechargez la page.',
    msgConnFail: 'Connexion impossible. Rechargez la page.',
    msgSubmitting: 'Inscription en cours…',
    msgGift: (n) => `C’est fait ! Vous êtes le n°${n} sur 100 — cadeau assuré. 🎁`,
    msgListed: 'C’est fait ! Vous êtes sur la liste, on vous prévient au lancement.',
    msgError: 'Un problème est survenu. Réessayez.',
  },
  pt: {
    title: 'KURA — 500 níveis. Zero anúncios.',
    tagline: '500 níveis. Zero anúncios.<br />Pague uma vez ou nunca pague.',
    heroCta: 'Entrar na lista &#9660;',
    gameTitle: 'O jogo',
    skinsNote: 'Desbloqueie todas as skins com a compra única.',
    rankingNote: 'Dois rankings por nível: tempo e movimentos.',
    movUnit: 'mov',
    whyTitle: 'Por que o KURA é diferente',
    card1Title: 'Zero anúncios',
    card1Body: 'Nunca. Nem banners, nem vídeos, nem interrupções. Só você e o jogo.',
    card2Title: 'Sem assinatura',
    card2Body: 'Pague uma vez e jogue para sempre. Sem mensalidades escondidas.',
    card3Title: 'Lógica de verdade',
    card3Body: '500 níveis do clássico jogo de empurrar caixas, com dificuldade de verdade. Sem pressa, sem sorte: só a sua cabeça.',
    counterLoading: 'carregando vagas…',
    emailPlaceholder: 'voce@email.com',
    footerMeta: 'KURA · puzzle retrô · Android primeiro · ',
    footerFine: 'Empurre caixas. Sem anúncios. Para sempre.',
    privacyLink: 'Política de privacidade',
    termsLink: 'Termos de uso',

    counterOpenLabel: (cap) => `de ${cap} vagas de presente grátis`,
    hookTitleOpen: 'Os primeiros 100 desbloqueiam o KURA<br />completo de graça, para sempre.',
    hookSubOpen: 'Deixe o seu email. Sem spam, só o aviso de lançamento e o seu presente.',
    submitOpen: 'Quero o meu presente',
    soldLabel: 'Vagas de presente esgotadas',
    hookTitleSold: 'Vagas de presente esgotadas.<br />Mas você ainda pode entrar na lista.',
    hookSubSold: 'Inscreva-se e a gente avisa no lançamento.',
    submitSold: 'Entrar na lista',

    msgPreview: 'A lista abre muito em breve — volte daqui a uns dias.',
    msgInvalid: 'Digite um email válido, por favor.',
    msgLoadFail: 'Não foi possível carregar o formulário. Recarregue a página.',
    msgConnFail: 'Não foi possível conectar. Recarregue a página.',
    msgSubmitting: 'Inscrevendo você…',
    msgGift: (n) => `Pronto! Você é o nº${n} de 100 — presente garantido. 🎁`,
    msgListed: 'Pronto! Você está na lista, a gente avisa no lançamento.',
    msgError: 'Algo deu errado. Tente de novo.',
  },
};

const LANG_KEY = 'kura-lang';

const SUPPORTED = ['es', 'en', 'fr', 'pt'];

function detectLang() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (_) {}
  if (SUPPORTED.includes(saved)) return saved;
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  const code = nav.slice(0, 2);
  return SUPPORTED.includes(code) ? code : 'en';
}

let lang = detectLang();

function t(key, ...args) {
  const dict = I18N[lang] || I18N.en;
  const v = key in dict ? dict[key] : I18N.en[key];
  return typeof v === 'function' ? v(...args) : v;
}

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

// Last count seen from Firestore, so a language switch can repaint in place.
let lastCount = null;

function paintCounter(count) {
  lastCount = count;
  const remaining = Math.max(0, GIFT_CAP - count);
  if (remaining > 0) {
    counterEl.classList.remove('sold');
    counterNum.textContent = remaining;
    counterLabel.textContent = t('counterOpenLabel', GIFT_CAP);
    hookTitle.innerHTML = t('hookTitleOpen');
    hookSub.textContent = t('hookSubOpen');
    submitBtn.textContent = t('submitOpen');
  } else {
    // Cap reached — form stays open as a normal waitlist.
    counterEl.classList.add('sold');
    counterNum.textContent = '0';
    counterLabel.textContent = t('soldLabel');
    hookTitle.innerHTML = t('hookTitleSold');
    hookSub.textContent = t('hookSubSold');
    submitBtn.textContent = t('submitSold');
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

/* ===================== Language switch ===================== */
const langButtons = Array.from(document.querySelectorAll('.lang-switch [data-lang]'));

function applyLang(next) {
  lang = SUPPORTED.includes(next) ? next : 'en';
  try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}

  document.documentElement.lang = lang;
  document.title = t('title');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });

  langButtons.forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));

  // Repaint the live counter/form copy if we already have a count.
  if (lastCount !== null) paintCounter(lastCount);
}

langButtons.forEach((b) =>
  b.addEventListener('click', () => applyLang(b.dataset.lang)),
);

applyLang(lang);

if (!configReady) {
  // Lets the page be previewed before Firebase is wired up.
  paintCounter(0);
  showMsg(t('msgPreview'), false);
} else {
  initFirebase().catch((e) => {
    console.error('Firebase load error', e);
    showMsg(t('msgLoadFail'), true);
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
    showMsg(t('msgConnFail'), true);
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
      showMsg(t('msgInvalid'), true);
      return;
    }
    emailInput.classList.remove('invalid');

    submitting = true;
    submitBtn.disabled = true;
    showMsg(t('msgSubmitting'), false);

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
        showMsg(t('msgGift', newCount), false);
      } else {
        showMsg(t('msgListed'), false);
      }
    } catch (err) {
      console.error('Signup error', err);
      showMsg(t('msgError'), true);
    } finally {
      submitting = false;
      submitBtn.disabled = false;
    }
  });
}
