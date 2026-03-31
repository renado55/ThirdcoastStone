require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Pricing data (single source of truth, shared with frontend via /api/pricing) ──

const MATERIALS = {
  white_quartz:     { label: 'White Quartz',          pricePerSqFt: 85,  hex: '#F5F5F0' },
  calacatta_white:  { label: 'Calacatta White Quartz', pricePerSqFt: 95,  hex: '#EFEFEA' },
  carrara_marble:   { label: 'Carrara Marble Look',    pricePerSqFt: 100, hex: '#E8E8E2' },
  black_galaxy:     { label: 'Black Galaxy Granite',   pricePerSqFt: 80,  hex: '#1A1A1A' },
  concrete_gray:    { label: 'Concrete Gray Quartz',   pricePerSqFt: 75,  hex: '#8A8A85' },
  emerald_pearl:    { label: 'Emerald Pearl Granite',  pricePerSqFt: 90,  hex: '#3D4A3A' },
};

const EDGE_PROFILES = {
  eased:       { label: 'Eased (Standard)',  pricePerLinFt: 0,  description: 'Clean, slightly softened 90° edge' },
  beveled:     { label: 'Beveled',           pricePerLinFt: 8,  description: '45° decorative bevel cut' },
  bullnose:    { label: 'Bullnose',          pricePerLinFt: 12, description: 'Fully rounded, smooth edge' },
  ogee:        { label: 'Ogee',              pricePerLinFt: 18, description: 'Classic S-curve profile' },
  double_ogee: { label: 'Double Ogee',       pricePerLinFt: 22, description: 'Elegant double S-curve profile' },
};

const SINK_CUTOUTS = {
  none:              { label: 'No Cutout',              price: 0,   description: 'Solid top, no sink opening' },
  single_undermount: { label: 'Single Undermount Sink', price: 75,  description: 'Single bowl undermount cutout' },
  double_undermount: { label: 'Double Undermount Sink', price: 150, description: 'Double bowl undermount cutout' },
  vessel:            { label: 'Vessel Sink',            price: 50,  description: 'Small round/square cutout for vessel sink' },
};

const BACKSPLASH = {
  none:   { label: 'No Backsplash',    pricePerLinFt: 0  },
  four_in: { label: '4" Backsplash',   pricePerLinFt: 15 },
};

const FAUCET_HOLES = {
  none:    { label: 'No Faucet Holes', price: 0  },
  one:     { label: '1 Hole',          price: 25 },
  three:   { label: '3 Holes',         price: 50 },
};

// ── Price calculator ──

function calculatePrice(config) {
  const { widthIn, depthIn, material, edgeProfile, sinkCutout, backsplash, faucetHoles } = config;

  const widthFt = widthIn / 12;
  const depthFt = depthIn / 12;

  const sqFt       = widthFt * depthFt;
  const exposedLinFt = widthFt + 2 * depthFt; // front + two sides

  const materialCost    = sqFt * (MATERIALS[material]?.pricePerSqFt ?? 0);
  const edgeCost        = exposedLinFt * (EDGE_PROFILES[edgeProfile]?.pricePerLinFt ?? 0);
  const sinkCost        = SINK_CUTOUTS[sinkCutout]?.price ?? 0;
  const backsplashCost  = widthFt * (BACKSPLASH[backsplash]?.pricePerLinFt ?? 0);
  const faucetCost      = FAUCET_HOLES[faucetHoles]?.price ?? 0;

  const subtotal = materialCost + edgeCost + sinkCost + backsplashCost + faucetCost;
  const tax      = subtotal * 0.07;
  const total    = subtotal + tax;

  return {
    sqFt:           +sqFt.toFixed(2),
    exposedLinFt:   +exposedLinFt.toFixed(2),
    materialCost:   +materialCost.toFixed(2),
    edgeCost:       +edgeCost.toFixed(2),
    sinkCost:       +sinkCost.toFixed(2),
    backsplashCost: +backsplashCost.toFixed(2),
    faucetCost:     +faucetCost.toFixed(2),
    subtotal:       +subtotal.toFixed(2),
    tax:            +tax.toFixed(2),
    total:          +total.toFixed(2),
  };
}

// ── API Routes ──

// Return all pricing/option data to the frontend
app.get('/api/pricing', (req, res) => {
  res.json({ MATERIALS, EDGE_PROFILES, SINK_CUTOUTS, BACKSPLASH, FAUCET_HOLES });
});

// Calculate price on the fly
app.post('/api/calculate', (req, res) => {
  const config = req.body;
  if (!config.widthIn || !config.depthIn || !config.material) {
    return res.status(400).json({ error: 'Missing required fields: widthIn, depthIn, material' });
  }
  res.json(calculatePrice(config));
});

// Create Stripe Checkout session
app.post('/api/checkout', async (req, res) => {
  const config = req.body;

  // Validate
  const required = ['widthIn','depthIn','material','edgeProfile','sinkCutout','backsplash','faucetHoles','customerName','customerEmail'];
  for (const field of required) {
    if (!config[field]) return res.status(400).json({ error: `Missing field: ${field}` });
  }

  const price    = calculatePrice(config);
  const mat      = MATERIALS[config.material];
  const edge     = EDGE_PROFILES[config.edgeProfile];
  const sink     = SINK_CUTOUTS[config.sinkCutout];
  const bs       = BACKSPLASH[config.backsplash];
  const faucet   = FAUCET_HOLES[config.faucetHoles];

  const description = [
    `${config.widthIn}" × ${config.depthIn}" ${mat.label}`,
    `Edge: ${edge.label}`,
    `Sink: ${sink.label}`,
    bs.label !== 'No Backsplash' ? `Backsplash: ${bs.label}` : null,
    faucet.label !== 'No Faucet Holes' ? `Faucet: ${faucet.label}` : null,
  ].filter(Boolean).join(' | ');

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: config.customerEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Custom Vanity Top',
              description,
              images: [],
            },
            unit_amount: Math.round(price.total * 100), // cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        customerName:  config.customerName,
        widthIn:       String(config.widthIn),
        depthIn:       String(config.depthIn),
        material:      config.material,
        edgeProfile:   config.edgeProfile,
        sinkCutout:    config.sinkCutout,
        backsplash:    config.backsplash,
        faucetHoles:   config.faucetHoles,
        subtotal:      String(price.subtotal),
        tax:           String(price.tax),
        total:         String(price.total),
      },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/?cancelled=true`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// Retrieve order confirmation details
app.get('/api/order/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed.' });
    }
    res.json({
      customerName:  session.metadata.customerName,
      customerEmail: session.customer_email,
      total:         session.metadata.total,
      widthIn:       session.metadata.widthIn,
      depthIn:       session.metadata.depthIn,
      material:      session.metadata.material,
      edgeProfile:   session.metadata.edgeProfile,
      sinkCutout:    session.metadata.sinkCutout,
      backsplash:    session.metadata.backsplash,
      faucetHoles:   session.metadata.faucetHoles,
    });
  } catch (err) {
    console.error('Order lookup error:', err.message);
    res.status(500).json({ error: 'Could not retrieve order.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Third Coast Stone running at http://localhost:${PORT}`));
