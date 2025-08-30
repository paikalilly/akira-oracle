// Minimal coverflow carousel + wheel/swipe + flip + keep-out tray + overlay timing
const OVERLAY_DELAY_IMAGE = 1200;

const state = {
  deck: [],            // from JSON
  order: [],           // array of indexes [0..n-1] in shuffled order
  center: 0,           // which position is centered
  mode: "replace",     // "replace" | "no-replace"
  drawn: new Set(),    // indexes drawn (only for no-replace)
};

const els = {
  carousel: document.getElementById('carousel'),
  tray: document.getElementById('tray'),
  counter: document.getElementById('counter'),
  refresh: document.getElementById('refreshBtn'),
  modeToggle: document.getElementById('modeToggle'),
  tpl: document.getElementById('cardTpl'),
};

const track = document.querySelector('#carousel .carousel__track');

init();

async function init(){
  const res = await fetch('data/deck.json');
  state.deck = await res.json();

  reshuffle();
  buildCarouselDOM();
  attachUI();
  updateCounter();
  renderPositions();
}

/* ---------- UI wiring ---------- */

function attachUI(){
  els.refresh.onclick = () => { reshuffle(); buildCarouselDOM(); clearTray(); };
  els.modeToggle.onchange = () => {
    state.mode = els.modeToggle.checked ? "no-replace" : "replace";
    els.tray.hidden = state.mode !== "no-replace";
  };

  // arrows via keyboard
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') centerOn(state.center + 1);
    if (e.key === 'ArrowLeft') centerOn(state.center - 1);
    if (e.key.toLowerCase() === 'r') { reshuffle(); buildCarouselDOM(); clearTray(); }
  });

  // wheel scroll when hovering the deck
  els.carousel.addEventListener('wheel', (e)=>{
    e.preventDefault();
    if (Math.abs(e.deltaY) < 2) return;
    centerOn(state.center + (e.deltaY > 0 ? 1 : -1));
  }, { passive:false });
}

/* ---------- deck helpers ---------- */

function reshuffle(){
  const n = state.deck.length;
  state.order = shuffle(Array.from({length:n}, (_, i) => i));
  state.center = 0;
  state.drawn.clear();
}

function buildCarouselDOM(){
  track.innerHTML = '';
  for (const idx of state.order){
    const node = cardFromTpl(getCard(idx));
    node.dataset.idx = String(idx);
    track.appendChild(node);
  }
  enableSwipe(track);
  renderPositions();
}

function getCard(idx){ return state.deck[idx]; }

function updateCounter(){
  els.counter.textContent = `${state.drawn.size}/${state.deck.length}`;
}

/* ---------- card template & flip ---------- */

function cardFromTpl(card){
  const node = els.tpl.content.firstElementChild.cloneNode(true);
  const front = node.querySelector('.card__face--front');
  const overlay = node.querySelector('.card__overlay');
  const titleEl = node.querySelector('.overlay__title');
  const promptEl = node.querySelector('.overlay__prompt');
  const linkEl = node.querySelector('.overlay__link');

  // content
  titleEl.textContent = card.title || '';
  if (promptEl) promptEl.textContent = ''; // you have titles only
  if (card.link) {
    linkEl.href = card.link;
  } else {
    linkEl.remove(); // hide button if no link
  }

  // image media
  front.dataset.type = 'image';
  const img = document.createElement('img');
  img.className = 'card__media';
  img.loading = 'lazy';
  img.src = card.src;
  img.alt = '';
  front.prepend(img);

  // click: center first; if already centered, flip
  node.addEventListener('click', (e)=>{
    const cards = [...track.querySelectorAll('.card')];
    const pos = cards.indexOf(node);

    if (pos !== state.center) {
      centerOn(pos);
      return;
    }

    if (node.classList.contains('is-center') && !e.target.closest('.overlay_link')) {
      handleFlip(node);
    }
  });


  // keyboard flip when focused
  node.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFlip(node); }
  });

  return node;
}

function handleFlip(cardEl){
  const idx = Number(cardEl.dataset.idx);
  const isFlipped = cardEl.classList.contains('card--flipped');

  if (!isFlipped){
    // force a layout read to ensure the next transform is committed
    void cardEl.offsetWidth;

    cardEl.classList.add('card--flipped');   // triggers the flip
    showOverlayWithDelay(cardEl);

    if (state.mode === 'no-replace' && !state.drawn.has(idx)){
      state.drawn.add(idx);
      cardEl.classList.add('card--drawn');
      addToTray(idx);
      updateCounter();
    }
  } else {
    hideOverlay(cardEl);
    cardEl.classList.remove('card--flipped');
  }
}

function showOverlayWithDelay(cardEl){
  const overlay = cardEl.querySelector('.card__overlay');
  overlay.classList.remove('show');
  clearTimeout(cardEl._overlayTimer);
  cardEl._overlayTimer = setTimeout(()=> overlay.classList.add('show'), OVERLAY_DELAY_IMAGE);

  const front = cardEl.querySelector('.card__face--front');
  front.onclick = (e)=>{ if (!e.target.closest('.overlay__link')) overlay.classList.toggle('show'); };
}

function hideOverlay(cardEl){
  const overlay = cardEl.querySelector('.card__overlay');
  clearTimeout(cardEl._overlayTimer);
  overlay.classList.remove('show');
}

function addToTray(idx){
  els.tray.hidden = false;
  const node = cardFromTpl(getCard(idx));
  node.classList.add('card--flipped'); // show front in tray
  node.onclick = () => {
    const pos = state.order.indexOf(idx);
    centerOn(pos);
    const main = findCardDOM(idx);
    if (main && !main.classList.contains('card--flipped')) handleFlip(main);
  };
  els.tray.appendChild(node);
}

function findCardDOM(idx){
  return track.querySelector(`.card[data-idx="${idx}"]`);
}

/* ---------- layout (5 visible slots) ---------- */

function renderPositions(){
  const nodes = [...track.querySelectorAll('.card')];
  nodes.forEach((node, i)=>{
    const delta = i - state.center;        // left negative, right positive
    const abs = Math.abs(delta);

    // show at most 2 on each side → up to 5 visible
    node.classList.toggle('is-outside', abs > 2);

    // spacing & size
    const x = delta * 140;                 // px between slots
    const rot = delta * -18;               // Y tilt
    const z  = -abs * 80;                  // depth
    const scaleMap = [1.00, 0.86, 0.72];   // center, 1-away, 2-away
    const scale = scaleMap[Math.min(abs, 2)];

    node.style.transform =
      `translate3d(calc(-50% + ${x}px), -50%, ${z}px) rotateY(${rot}deg) scale(${scale})`;

    node.style.zIndex = String(100 - abs);
    node.classList.toggle('is-center', delta === 0);
    node.tabIndex = (delta === 0) ? 0 : -1;
  });
}

function centerOn(index){
  const max = state.order.length - 1;
  const next = clamp(index, 0, max);
  if (next === state.center) return;
  state.center = next;
  renderPositions();
}

/* ---------- swipe/drag ---------- */

function enableSwipe(surface){
  let dragging = false, startX = 0, startCenter = 0, moved = 0;

  surface.addEventListener('pointerdown', (e)=>{
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startCenter = state.center;
  });

  surface.addEventListener('pointermove', (e)=>{
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    const target = Math.round(startCenter - dx / 140); // 140px per slot
    if (target !== state.center) centerOn(target);
  });

  surface.addEventListener('pointerup', (e)=>{
    if (!dragging) return;
    dragging = false;

    // Treat tiny movement as a tap
    if (moved < 6) {
      const el = e.target.closest('.card');
      if (el) {
        const cards = [...track.querySelectorAll('.card')];
        const pos = cards.indexOf(el);
        if (pos !== state.center) {
          centerOn(pos);
          // flip after recenter paints
          requestAnimationFrame(()=> requestAnimationFrame(()=> handleFlip(el)));
        } else {
          handleFlip(el);
        }
      }
    }
  });

  // Prevent iOS pull-to-refresh inside the deck
  surface.addEventListener('touchmove', (e)=>{ e.preventDefault(); }, { passive:false });
}


/* ---------- utils ---------- */

function shuffle(a){
  const arr = a.slice();
  for (let i=arr.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
