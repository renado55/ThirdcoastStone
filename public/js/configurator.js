/* ── Third Coast Stone — Vanity Configurator ── */

// Material background gradients for the stone preview
const MATERIAL_GRADIENTS = {
  white_quartz:    'linear-gradient(135deg, #F5F5F0 0%, #E8E8E2 50%, #DCDCD6 100%)',
  calacatta_white: 'linear-gradient(135deg, #EFEFEA 0%, #E2E0DB 40%, #D8D5CE 100%)',
  carrara_marble:  'linear-gradient(135deg, #E8E8E2 0%, #DDDBD5 40%, #CFCDC7 100%)',
  black_galaxy:    'linear-gradient(135deg, #1A1A1A 0%, #111111 50%, #0A0A0A 100%)',
  concrete_gray:   'linear-gradient(135deg, #8A8A85 0%, #7A7A75 50%, #6E6E69 100%)',
  emerald_pearl:   'linear-gradient(135deg, #3D4A3A 0%, #303D2D 50%, #252F23 100%)',
};

// Config state
const state = {
  widthIn:     24,
  depthIn:     22,
  material:    'white_quartz',
  edgeProfile: 'eased',
  sinkCutout:  'none',
  backsplash:  'none',
  faucetHoles: 'none',
};

let pricingData = null;
let currentPrice = null;

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  // Check for cancelled=true param
  if (new URLSearchParams(window.location.search).get('cancelled') === 'true') {
    showCancelledBanner();
    window.history.replaceState({}, '', '/');
  }

  try {
    const res  = await fetch('/api/pricing');
    pricingData = await res.json();
    buildMaterialGrid();
    buildEdgeGrid();
    buildOptionGrid('sinkGrid',      pricingData.SINK_CUTOUTS,  'sinkCutout',  sinkPriceLabel);
    buildOptionGrid('backsplashGrid', pricingData.BACKSPLASH,   'backsplash',  bsPriceLabel);
    buildOptionGrid('faucetGrid',    pricingData.FAUCET_HOLES,  'faucetHoles', faucetPriceLabel);
    bindSizeControls();
    await recalculate();
  } catch (e) {
    console.error('Failed to load pricing data:', e);
  }
}

// ── Price helpers ─────────────────────────────────────────────────────────────

function sinkPriceLabel(key, data) {
  return data.price === 0 ? 'Included' : `+$${data.price}`;
}
function bsPriceLabel(key, data) {
  return data.pricePerLinFt === 0 ? 'Included' : `+$${data.pricePerLinFt}/lin ft`;
}
function faucetPriceLabel(key, data) {
  return data.price === 0 ? 'Included' : `+$${data.price}`;
}

// ── Build UI ──────────────────────────────────────────────────────────────────

function buildMaterialGrid() {
  const grid = document.getElementById('materialGrid');
  grid.innerHTML = '';
  for (const [key, mat] of Object.entries(pricingData.MATERIALS)) {
    const card = document.createElement('div');
    card.className = 'material-card' + (key === state.material ? ' active' : '');
    card.dataset.key = key;
    card.innerHTML = `
      <div class="material-swatch" style="background:${MATERIAL_GRADIENTS[key] || mat.hex}"></div>
      <div class="material-card-body">
        <div class="mat-name">${mat.label}</div>
        <div class="mat-price">$${mat.pricePerSqFt}/sq ft</div>
      </div>`;
    card.addEventListener('click', () => selectOption('material', key, card, grid));
    grid.appendChild(card);
  }
}

function buildEdgeGrid() {
  const grid = document.getElementById('edgeGrid');
  grid.innerHTML = '';
  for (const [key, edge] of Object.entries(pricingData.EDGE_PROFILES)) {
    const card = document.createElement('div');
    card.className = 'edge-card' + (key === state.edgeProfile ? ' active' : '');
    card.dataset.key = key;
    card.innerHTML = `
      <div>
        <div class="edge-name">${edge.label}</div>
        <div class="edge-desc">${edge.description}</div>
      </div>
      <div class="edge-price">${edge.pricePerLinFt === 0 ? 'Standard' : '+$' + edge.pricePerLinFt + '/lin ft'}</div>`;
    card.addEventListener('click', () => selectOption('edgeProfile', key, card, grid));
    grid.appendChild(card);
  }
}

function buildOptionGrid(gridId, dataObj, stateKey, labelFn) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  for (const [key, item] of Object.entries(dataObj)) {
    const card = document.createElement('div');
    card.className = 'option-card' + (key === state[stateKey] ? ' active' : '');
    card.dataset.key = key;
    card.innerHTML = `
      <div class="opt-name">${item.label}</div>
      ${item.description ? `<div class="opt-desc">${item.description}</div>` : ''}
      <div class="opt-price">${labelFn(key, item)}</div>`;
    card.addEventListener('click', () => selectOption(stateKey, key, card, grid));
    grid.appendChild(card);
  }
}

function selectOption(stateKey, value, clickedCard, grid) {
  state[stateKey] = value;
  grid.querySelectorAll('[data-key]').forEach(c => c.classList.remove('active'));
  clickedCard.classList.add('active');
  recalculate();
}

// ── Size controls ─────────────────────────────────────────────────────────────

function bindSizeControls() {
  const widthInput = document.getElementById('widthInput');
  const depthInput = document.getElementById('depthInput');

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.w !== 'custom') {
        widthInput.value = btn.dataset.w;
        depthInput.value = btn.dataset.d;
        state.widthIn = parseFloat(btn.dataset.w);
        state.depthIn = parseFloat(btn.dataset.d);
        recalculate();
      }
    });
  });

  function onSizeChange() {
    const w = parseFloat(widthInput.value);
    const d = parseFloat(depthInput.value);
    if (w >= 12 && w <= 144) state.widthIn = w;
    if (d >= 14 && d <= 36)  state.depthIn = d;
    // Deselect presets if custom
    const matchPreset = [...document.querySelectorAll('.preset-btn')].find(
      b => b.dataset.w !== 'custom' &&
           parseFloat(b.dataset.w) === state.widthIn &&
           parseFloat(b.dataset.d) === state.depthIn
    );
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    if (matchPreset) matchPreset.classList.add('active');
    recalculate();
  }

  widthInput.addEventListener('input', onSizeChange);
  depthInput.addEventListener('input', onSizeChange);
}

// ── Recalculate & render ──────────────────────────────────────────────────────

async function recalculate() {
  try {
    const res = await fetch('/api/calculate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(state),
    });
    currentPrice = await res.json();
    renderPrice(currentPrice);
    renderPreview();
  } catch (e) {
    console.error('Price calculation failed:', e);
  }
}

function fmt(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderPrice(p) {
  const lines = document.getElementById('priceLines');
  const mat   = pricingData.MATERIALS[state.material];

  const rows = [
    ['Material', `${mat.label} (${p.sqFt} sq ft)`,         fmt(p.materialCost)],
    p.edgeCost  > 0 ? ['Edge Profile',  `${p.exposedLinFt} lin ft`,             fmt(p.edgeCost)]  : null,
    p.sinkCost  > 0 ? ['Sink Cutout',   pricingData.SINK_CUTOUTS[state.sinkCutout].label,  fmt(p.sinkCost)]  : null,
    p.backsplashCost > 0 ? ['Backsplash', `${(state.widthIn/12).toFixed(2)} lin ft`, fmt(p.backsplashCost)] : null,
    p.faucetCost > 0 ? ['Faucet Holes', pricingData.FAUCET_HOLES[state.faucetHoles].label, fmt(p.faucetCost)] : null,
  ].filter(Boolean);

  lines.innerHTML = rows.map(([label, detail, amount]) =>
    `<div class="price-row">
      <span>${label}<span style="font-size:11px;color:#aaa;margin-left:6px">${detail}</span></span>
      <span>${amount}</span>
    </div>`
  ).join('');

  document.getElementById('subtotalDisplay').textContent = fmt(p.subtotal);
  document.getElementById('taxDisplay').textContent      = fmt(p.tax);

  const totalEl = document.getElementById('totalDisplay');
  totalEl.textContent = fmt(p.total);

  document.getElementById('orderBtn').disabled = false;
}

function renderPreview() {
  const preview   = document.getElementById('stonePreview');
  const heroBlock = document.getElementById('heroStoneBlock');

  const grad = MATERIAL_GRADIENTS[state.material] || '#ccc';
  preview.style.background   = grad;
  heroBlock.style.background = grad;

  document.getElementById('previewLabel').textContent        = `${state.widthIn}" × ${state.depthIn}"`;
  document.getElementById('previewMaterialName').textContent = pricingData.MATERIALS[state.material].label;
  document.querySelector('.stone-label').textContent         = pricingData.MATERIALS[state.material].label;
}

// ── Checkout flow ─────────────────────────────────────────────────────────────

document.getElementById('orderBtn').addEventListener('click', () => {
  if (!currentPrice) return;
  populateModal();
  openModal();
});

function populateModal() {
  const mat   = pricingData.MATERIALS[state.material];
  const edge  = pricingData.EDGE_PROFILES[state.edgeProfile];
  const sink  = pricingData.SINK_CUTOUTS[state.sinkCutout];
  const bs    = pricingData.BACKSPLASH[state.backsplash];
  const faucet = pricingData.FAUCET_HOLES[state.faucetHoles];

  const rows = [
    ['Size',           `${state.widthIn}" × ${state.depthIn}"`],
    ['Material',       mat.label],
    ['Edge Profile',   edge.label],
    ['Sink Cutout',    sink.label],
    ['Backsplash',     bs.label],
    ['Faucet Holes',   faucet.label],
  ];

  document.getElementById('modalOrderSummary').innerHTML =
    rows.map(([k,v]) => `<div class="summary-row"><span>${k}</span><span>${v}</span></div>`).join('') +
    `<div class="summary-row summary-total"><span>Total (incl. tax)</span><span>${fmt(currentPrice.total)}</span></div>`;

  document.getElementById('payAmount').textContent = currentPrice.total.toFixed(2);
}

function openModal() {
  document.getElementById('checkoutModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('checkoutModal').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('modalError').hidden = true;
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('checkoutModal').addEventListener('click', e => {
  if (e.target === document.getElementById('checkoutModal')) closeModal();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

document.getElementById('checkoutForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payBtn     = document.getElementById('payBtn');
  const errorEl    = document.getElementById('modalError');
  const name       = document.getElementById('customerName').value.trim();
  const email      = document.getElementById('customerEmail').value.trim();

  if (!name || !email) return;

  payBtn.disabled    = true;
  payBtn.textContent = 'Redirecting to checkout…';
  errorEl.hidden     = true;

  try {
    const res  = await fetch('/api/checkout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...state, customerName: name, customerEmail: email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Checkout failed.');
    window.location.href = data.url;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden      = false;
    payBtn.disabled     = false;
    payBtn.innerHTML    = `Pay $<span id="payAmount">${currentPrice.total.toFixed(2)}</span> Securely`;
  }
});

// ── Cancelled banner ──────────────────────────────────────────────────────────

function showCancelledBanner() {
  const banner = document.createElement('div');
  banner.className = 'cancelled-banner';
  banner.textContent = 'Your order was cancelled. No charge was made. Feel free to adjust your design and try again.';
  const hero = document.querySelector('.hero');
  hero.parentNode.insertBefore(banner, hero);
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
