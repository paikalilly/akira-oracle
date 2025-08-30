// Minimal coverflow carousel + flip + keep-out tray + overlay timing
const OVERLAY_DELAY_IMAGE = 1200;
const OVERLAY_DELAY_VIDEO = 1500;

const state = {
  deck: [],           // full deck from JSON
  order: [],          // card ids in carousel order
  center: 0,          // index currently centered
  mode: "replace",    // "replace" | "no-replace"
  drawn: new Set(),   // ids drawn (only used in no-replace)
};

const els = {
  carousel: document.getElementById('carousel'),
  tray: document.getElementById('tray'),
  counter: document.getElementById('counter'),
  refresh: document.getElementById('refreshBtn'),
  modeToggle: document.getElementById('modeToggle'),
  tpl: document.getElementById('cardTpl'),
};

init();

async function init(){
  // load deck
  const res = await fetch('data/deck.json');
  state.deck = await res.json();

  // first setup
  reshuffle();
  buildCarouselDOM();
  attachUI();
  updateCounter();
  centerOn(0);
}

function attachUI(){
  els.refresh.onclick = () => { reshuffle(); renderPositions(); clearTray(); };
  els.modeToggle.onchange = () => {
    state.mode = els.modeToggle.checked ? "no-replace" : "replace";
    els.tray.hidden = state.mode !== "no-replace";
  };
  // keyboard
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') centerOn(state.center + 1);
    if (e.key === 'ArrowLeft') centerOn(state.center - 1);
    if (e.key.toLowerCase() === 'r') { reshuffle(); renderPositions(); clearTray(); }
  });
}

function reshuffle(){
  state.order = shuffle(state.deck.map(c=>c.id));
  state.center = 0;
  state.drawn.clear();
}

function buildCarouselDOM(){
  // container track
  let track = els.carousel.querySelector('.carousel__track');
  if (!track){
    track = document.createElement('div');
    track.className = 'carousel__track';
    els.carousel.appendChild(track);
    enableDrag(track);
  }
  // create card DOM for all items (positioned with transforms)
  track.innerHTML = '';
  for (const id of state.order){
    const cardData = getById(id);
    const node = cardFromTpl(cardData);
    node.dataset.id = id;
    track.appendChild(node);
  }
  renderPositions();
}

function cardFromTpl(card){
  const node = els.tpl.content.firstElementChild.cloneNode(true);
  const front = node.querySelector('.card__face--front');
  const overlay = node.querySelector('.card__overlay');
  const titleEl = node.querySelector('.overlay__title');
  const promptEl = node.querySelector('.overlay__prompt');
  const linkEl = node.querySelector('.overlay__link');

  titleEl.textContent = card.title || '';
  promptEl.textContent = card.prompt || '';
  linkEl.href = card.link || '#';

  if (card.type === 'video'){
    front.dataset.type = 'video';
    const vid = document.createElement('video');
    vid.className = 'card__media';
    vid.setAttribute('playsinline','');
    vid.muted = true;
    vid.preload = 'metadata';
    if (card.poster) vid.poster = card.poster;
    addSource(vid, card.src, 'video/mp4');
    if (card.src_webm) addSource(vid, card.src_webm, 'video/webm');
    front.prepend(vid);
  } else {
    front.dataset.type = 'image';
    const img = document.createElement('img');
    img.className = 'card__media';
    img.loading = 'lazy';
    img.src = card.src;
    img.alt = '';
    front.prepend(img);
  }

  // flip handler
  node.addEventListener('click', (e)=>{
    if (e.target.closest('.overlay__link')) return; // allow link
    handleFlip(node);
  });

  // accessibility
  node.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFlip(node); }
  });

  return node;
}

function addSource(vid, src, type){
  const s = document.createElement('source');
  s.src = src; s.type = type;
  vid.appendChild(s);
}

function getById(id){ return state.deck.find(c => c.id === id); }

function handleFlip(cardEl){
  const id = cardEl.dataset.id;
  const isFlipped = cardEl.classList.contains('card--flipped');

  if (!isFlipped){
    // flip to front
    cardEl.classList.add('card--flipped');
    showOverlayWithDelay(cardEl);

    // if no-replace, mark drawn + add to tray
    if (state.mode === 'no-replace' && !state.drawn.has(id)){
      state.drawn.add(id);
      cardEl.classList.add('card--drawn');
      addToTray(id);
      updateCounter();
    }
  } else {
    // flip back
    hideOverlay(cardEl);
    cardEl.classList.remove('card--flipped');
  }
}

function showOverlayWithDelay(cardEl){
  const overlay = cardEl.querySelector('.card__overlay');
  const front = cardEl.querySelector('.card__face--front');
  const media = front.querySelector('.card__media');
  overlay.classList.remove('show');

  const delay = front.dataset.type === 'video' ? OVERLAY_DELAY_VIDEO : OVERLAY_DELAY_IMAGE;

  // For video: show after first play or delay fallback
  if (front.dataset.type === 'video' && media instanceof HTMLVideoElement){
    const onFirstPlay = () => { overlay.classList.add('show'); media.removeEventListener('play', onFirstPlay); };
    media.addEventListener('play', onFirstPlay, { once:true });
    cardEl._overlayTimer && clearTimeout(cardEl._overlayTimer);
    cardEl._overlayTimer = setTimeout(()=>overlay.classList.add('show'), delay);
  } else {
    cardEl._overlayTimer && clearTimeout(cardEl._overlayTimer);
    cardEl._overlayTimer = setTimeout(()=>overlay.classList.add('show'), delay);
  }

  // tap front to toggle overlay
  front.onclick = (e)=>{ if (!e.target.closest('.overlay__link')) overlay.classList.toggle('show'); };
}

function hideOverlay(cardEl){
  const overlay = cardEl.querySelector('.card__overlay');
  clearTimeout(cardEl._overlayTimer);
  overlay.classList.remove('show');
}

function addToTray(id){
  els.tray.hidden = false;
  const data = getById(id);
  const node = cardFromTpl(data);
  node.classList.add('card--flipped'); // show front
  // make clicking a tray card recenter carousel on it
  node.onclick = () => {
    const idx = state.order.indexOf(id);
    centerOn(idx);
    // also flip the main card if not flipped already
    const mainCard = findCardDOM(id);
    if (mainCard && !mainCard.classList.contains('card--flipped')) handleFlip(mainCard);
  };
  els.tray.appendChild(node);
}

function clearTray(){ els.tray.innerHTML=''; els.tray.hidden = state.mode !== 'no-replace'; updateCounter(); }

function updateCounter(){
  const total = state.deck.length;
  const drawn = state.drawn.size;
  els.counter.textContent = `${drawn}/${total}`;
}

function findCardDOM(id){
  return els.carousel.querySelector(`.card[data-id="${id}"]`);
}

/* ---------- coverflow positioning & drag ---------- */

function renderPositions(){
  const nodes = [...els.carousel.querySelectorAll('.card')];
  nodes.forEach((node, i)=>{
    const delta = i - state.center;
    const offset = clamp(delta, -5, 5); // limit transforms
    const x = offset * 110;             // px shift
    const rot = offset * -20;           // deg
    const z = -Math.abs(offset) * 60;   // depth
    node.style.transform = `translate3d(calc(-50% + ${x}px), -50%, ${z}px) rotateY(${rot}deg)`;
    node.style.zIndex = String(100 - Math.abs(offset));
    node.tabIndex = (i === state.center) ? 0 : -1;

    // badge if drawn
    const id = state.order[i];
    node.classList.toggle('card--drawn', state.drawn.has(id));
  });
}

function centerOn(index){
  const max = state.order.length - 1;
  state.center = clamp(index, 0, max);
  renderPositions();
}

function enableDrag(track){
  let dragging = false, startX = 0, startCenter = 0;
  track.addEventListener('pointerdown', (e)=>{ dragging = true; startX = e.clientX; startCenter = state.center; track.setPointerCapture(e.pointerId); });
  track.addEventListener('pointermove', (e)=>{
    if (!dragging) return;
    const dx = e.clientX - startX;
    const sensitivity = 1/110; // pixels per index
    const target = Math.round(startCenter - dx * sensitivity);
    if (target !== state.center) centerOn(target);
  });
  window.addEventListener('pointerup', ()=> dragging = false);
}

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
