// Minimal coverflow carousel + wheel/swipe + flip + overlay timing
const IS_PHONE = window.matchMedia('(max-width: 480px)').matches;
const SLOT = IS_PHONE ? 90 : 140;   // px between slots
const MAX_SIDE = 2;                 // show 2 each side of center (5 total)
const HIDE_BEYOND = 3;              // hard-hide beyond ±3 (7 in DOM paint)
const OVERLAY_DELAY_IMAGE = IS_PHONE ? 700 : 1200;

const state = {
  deck: [],            // from JSON
  order: [],           // indexes [0..n-1] in shuffled order
  center: 0           // centered position
};

const els = {
  carousel: document.getElementById('carousel'),
  refresh: document.getElementById('refreshBtn'),
  tpl: document.getElementById('cardTpl')
};

const track = document.querySelector('#carousel .carousel__track');




init();

async function init(){
  const res = await fetch('data/deck.json');
  state.deck = await res.json();

  reshuffle();
  buildCarouselDOM();
  attachUI();
  renderPositions();
}

/* ---------- UI wiring ---------- */

function attachUI(){
  // shuffle
  els.refresh.onclick = () => { reshuffle(); buildCarouselDOM(); };

  // keyboard
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') centerOn(state.center + 1);
    if (e.key === 'ArrowLeft') centerOn(state.center - 1);
    if (e.key.toLowerCase() === 'r') { reshuffle(); buildCarouselDOM(); }
  });

  // wheel: scroll through cards when hovering the deck (desktop)
  els.carousel.addEventListener('wheel', (e)=>{
    if (e.target.closest('.overlay__link')) return; // let link scroll if needed
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
}

function buildCarouselDOM(){
  track.innerHTML = '';
  for (const idx of state.order){
    const node = cardFromTpl(getCard(idx));
    node.dataset.idx = String(idx);
    track.appendChild(node);
  }

  enableSwipe(track);

  // Fallback: treat a plain click on the carousel as a tap
  els.carousel.onclick = (e)=>{
    if (e.target.closest('.overlay__link')) return; // real link click
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const el = hit && hit.closest ? hit.closest('.card') : null;
    if (!el) return;
    const cards = [...track.querySelectorAll('.card')];
    const pos = cards.indexOf(el);
    if (pos !== state.center) {
      centerOn(pos);
      // flip next frame so the recenter transform lands
      requestAnimationFrame(()=> requestAnimationFrame(()=> handleFlip(el)));
    } else {
      handleFlip(el);
    }
  };

  renderPositions();
}

function getCard(idx){ return state.deck[idx]; }

/* ---------- card template & flip ---------- */

function cardFromTpl(card){
  const node = els.tpl.content.firstElementChild.cloneNode(true);
  const front = node.querySelector('.card__face--front');
  const overlay = node.querySelector('.card__overlay');
  const titleEl = node.querySelector('.overlay__title');
  const linkEl = node.querySelector('.overlay__link');

  // content
  titleEl.textContent = card.title || '';
  if (card.link) {
    linkEl.href = card.link;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
  } else {
    linkEl.remove(); // hide icon if no link
  }

  // image media on the FRONT
  const img = document.createElement('img');
  img.className = 'card__media';
  img.loading = 'lazy';
  img.src = card.src;
  img.alt = '';
  front.prepend(img);

  // click: center then flip (single click does both)
  node.addEventListener('click', (e)=>{
    if (e.target.closest('.overlay__link')) return; // don't swallow the link
    const cards = [...track.querySelectorAll('.card')];
    const pos = cards.indexOf(node);

    if (pos !== state.center) {
      centerOn(pos);
      requestAnimationFrame(()=> requestAnimationFrame(()=> handleFlip(node)));
      return;
    }
    handleFlip(node);
  });

  // keyboard flip when focused
  node.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFlip(node); }
  });

  // tap the image to toggle overlay visibility after it has appeared
  front.onclick = (e)=>{
    if (e.target.closest('.overlay__link')) return;
    overlay.classList.toggle('show');
  };

  return node;
}

function handleFlip(cardEl){
  const isFlipped = cardEl.classList.contains('card--flipped');
  if (!isFlipped){
    void cardEl.offsetWidth;                 // force layout so transform commits
    cardEl.classList.add('card--flipped');   // rotates .card__inner via CSS
    showOverlayWithDelay(cardEl);
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
}

function hideOverlay(cardEl){
  const overlay = cardEl.querySelector('.card__overlay');
  clearTimeout(cardEl._overlayTimer);
  overlay.classList.remove('show');
}

/* ---------- layout (5 visible slots) ---------- */

function centerOn(pos){
  state.center = clamp(pos, 0, state.order.length - 1);
  renderPositions();
}

function renderPositions(){
  const nodes = [...track.querySelectorAll('.card')];
  nodes.forEach((node, i)=>{
    const delta = i - state.center;
    const abs = Math.abs(delta);

    // Hard-hide far nodes to save Safari's GPU
    node.style.display = abs > HIDE_BEYOND ? 'none' : 'block';

    // Show up to 2 on each side (5 visible)
    node.classList.toggle('is-outside', abs > MAX_SIDE);

    const x = delta * SLOT;
    const rot = delta * -18;
    const z  = -abs * 80;
    const scaleMap = [1.00, 0.86, 0.72];
    const scale = scaleMap[Math.min(abs, 2)];

    node.style.transform =
      `translate3d(calc(-50% + ${x}px), -50%, ${z}px) rotateY(${rot}deg) scale(${scale})`;

    node.style.zIndex = String(100 - abs);
    node.classList.toggle('is-center', delta === 0);
    node.tabIndex = (delta === 0) ? 0 : -1;
  });
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
    if (moved < 2) return;                       // tiny jitter = still a tap
    const target = Math.round(startCenter - dx / SLOT);
    if (target !== state.center) centerOn(target);
  });

  surface.addEventListener('pointerup', (e)=>{
    if (!dragging) return;
    dragging = false;

    // let real links through
    const linkHit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.overlay__link');
    if (linkHit) return;

    // Tap: very small movement → treat as a click
    if (moved < 6) {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const el = hit && hit.closest ? hit.closest('.card') : null;
      if (el) {
        const cards = [...track.querySelectorAll('.card')];
        const pos = cards.indexOf(el);
        if (pos !== state.center) {
          centerOn(pos);
          requestAnimationFrame(()=> requestAnimationFrame(()=> handleFlip(el)));
        } else {
          handleFlip(el);
        }
      }
    }
  }, { passive: true });

  // iOS pull-to-refresh guard only inside the deck
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

