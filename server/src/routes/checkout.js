const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const RecoveryEvent = require('../models/RecoveryEvent');
const eventBus = require('../eventBus');
const { emitLive } = require('../services/detectionService');

// ─── Razorpay SDK init (graceful fallback if keys not set) ───────────────────
let razorpay = null;
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RZP_LIVE = RZP_KEY_ID && RZP_KEY_ID !== 'rzp_test_placeholder';

if (RZP_LIVE) {
  const Razorpay = require('razorpay');
  razorpay = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });
  console.log('[Razorpay] SDK initialized with key:', RZP_KEY_ID);
} else {
  console.log('[Razorpay] No real keys — using mock order mode 🔧');
}

const PRODUCTS = [
  { id: 'prod_001', name: 'Razorpay Pro Plan',    amount: 2999,  category: 'subscription', description: 'Monthly subscription · Pro tier · Unlimited API calls' },
  { id: 'prod_002', name: 'Cloud Storage 100 GB', amount: 499,   category: 'checkout',     description: 'One-time top-up · 100 GB cloud storage' },
  { id: 'prod_003', name: 'API Access — Annual',  amount: 12000, category: 'checkout',     description: 'Annual plan · Unlimited API access · Priority support' },
  { id: 'prod_004', name: 'Team Seats (5 users)', amount: 7500,  category: 'subscription', description: 'Monthly subscription · 5 seats · Admin panel included' }
];

// ─── Map Razorpay real error codes → our internal codes ─────────────────────
function mapRazorpayError(rzpErrorCode, rzpDescription) {
  const desc = (rzpDescription || '').toLowerCase();
  const code = (rzpErrorCode || '').toUpperCase();

  if (code === 'BAD_REQUEST_ERROR') {
    if (desc.includes('expired'))           return { errorCode: 'CARD_EXPIRED',         errorReason: 'Card has expired — customer needs to update payment method' };
    if (desc.includes('insufficient'))      return { errorCode: 'INSUFFICIENT_FUNDS',   errorReason: 'Insufficient balance in account at time of payment' };
    if (desc.includes('otp') || desc.includes('auth')) return { errorCode: 'OTP_TIMEOUT', errorReason: 'OTP authentication timed out — customer did not complete verification' };
    if (desc.includes('fraud'))             return { errorCode: 'FRAUD_BLOCK',          errorReason: 'Transaction flagged by fraud detection (possible false positive)' };
    if (desc.includes('limit'))             return { errorCode: 'EXCEED_WITHDRAWAL_LIMIT', errorReason: 'Daily withdrawal limit exceeded' };
    return                                         { errorCode: 'CARD_DECLINED',        errorReason: rzpDescription || 'Card declined by issuing bank' };
  }
  if (code === 'GATEWAY_ERROR')             return { errorCode: 'GATEWAY_TIMEOUT',      errorReason: 'Payment gateway timeout — transient infrastructure issue' };
  if (code === 'SERVER_ERROR')              return { errorCode: 'GATEWAY_TIMEOUT',      errorReason: 'Razorpay server error — retry eligible' };

  // Dismiss / user cancelled
  if (code === 'DISMISSED' || code === 'USER_CANCELLED') return { errorCode: 'ABANDONED', errorReason: 'Customer dismissed the payment modal without completing payment' };

  return { errorCode: 'UNKNOWN_ERROR', errorReason: rzpDescription || 'Unknown payment failure — requires LLM diagnosis' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation — the real fix for "payment captured but order stuck pending".
// A client-side callback (browser closed, network drop, UPI app-switch the customer
// never returned from) is not the source of truth — Razorpay's own records are. This
// asks Razorpay directly whether a "failed"/"pending"/"abandoned" order actually has a
// captured payment against it, and if so, corrects our record — no customer contact
// needed, because the customer already paid; our tracking was just wrong.
// ─────────────────────────────────────────────────────────────────────────────
async function reconcileTransaction(transaction) {
  const customerId = transaction.customerId?._id || transaction.customerId; // handle populated or raw
  const trace = []; // every real step taken, in order — so the UI can show the actual reasoning, not just a verdict
  const apiCall = { method: 'orders.fetchPayments', endpoint: `/v1/orders/${transaction.razorpayOrderId}/payments` };
  const ourRecord = { status: transaction.status, amount: transaction.amount, errorCode: transaction.errorCode || null };

  trace.push({ label: `Calling Razorpay API: GET ${apiCall.endpoint}` });

  if (!razorpay || !transaction.razorpayOrderId) {
    trace.push({ label: 'No real Razorpay order on this transaction — nothing to verify against.', ok: false });
    return { checked: false, mismatch: false, reason: 'No real Razorpay order to verify against', trace, apiCall, ourRecord };
  }
  if (['recovered', 'succeeded'].includes(transaction.status)) {
    trace.push({ label: `Already marked "${transaction.status}" — skipping.`, ok: true });
    return { checked: false, mismatch: false, reason: 'Already marked settled', trace, apiCall, ourRecord };
  }

  let payments;
  try {
    const result = await razorpay.orders.fetchPayments(transaction.razorpayOrderId);
    payments = result.items || [];
    trace.push({ label: `Response: ${payments.length} payment attempt${payments.length !== 1 ? 's' : ''} returned.`, ok: true });
  } catch (err) {
    trace.push({ label: `Request failed: ${err.message}`, ok: false });
    return { checked: true, mismatch: false, reason: `Could not reach Razorpay: ${err.message}`, trace, apiCall, ourRecord };
  }

  const allPayments = payments.map(p => ({ id: p.id, status: p.status, amount: p.amount / 100, method: p.method, created_at: p.created_at }));
  const capturedPayment = payments.find(p => p.status === 'captured' || p.status === 'authorized');

  if (!capturedPayment) {
    const razorpayRecord = { status: 'no successful payment', paymentCount: payments.length };
    trace.push({ label: 'Compared: our status vs. Razorpay\'s payment list — they agree, this genuinely was not paid.', ok: true });
    return { checked: true, mismatch: false, reason: 'Razorpay confirms no successful payment exists for this order', trace, apiCall, ourRecord, razorpayRecord, allPayments };
  }

  // Genuine mismatch — Razorpay says paid, we said otherwise. Auto-correct.
  const previousStatus = transaction.status;
  const razorpayRecord = {
    paymentId: capturedPayment.id, status: capturedPayment.status,
    amount: capturedPayment.amount / 100, method: capturedPayment.method,
    capturedAt: capturedPayment.created_at ? new Date(capturedPayment.created_at * 1000).toLocaleString('en-IN') : null
  };
  trace.push({ label: `Compared field-by-field: status "${previousStatus}" (ours) ≠ "${capturedPayment.status}" (Razorpay's) for the same order.`, ok: false, isMismatch: true });

  await Transaction.findByIdAndUpdate(transaction._id, {
    status: 'recovered',
    razorpayPaymentId: capturedPayment.id,
    errorCode: null,
    errorReason: null
  });

  const messageContent = `Our system had this marked "${previousStatus}", but Razorpay's own records show payment ${capturedPayment.id} was actually ${capturedPayment.status} for ₹${transaction.amount} (via ${capturedPayment.method}) — likely a dropped confirmation callback (browser closed, network drop, or a UPI app-switch the customer never returned from). Auto-reconciled directly against Razorpay; no customer contact needed since they already paid.`;

  const recoveryEvent = await RecoveryEvent.create({
    transactionId: transaction._id,
    customerId,
    category: transaction.category,
    amount: transaction.amount,
    diagnosis: { bucket: 'reconciliation_mismatch', method: 'rule', confidence: 1.0 },
    actionTaken: {
      funnelLevel: 1,
      type: 'reconciliation_auto_fix',
      channel: 'none',
      method: 'rule',
      messageContent
    },
    outcome: 'recovered',
    amountRecovered: transaction.amount
  });

  trace.push({ label: `Wrote correction: Transaction.status "${previousStatus}" → "recovered", razorpayPaymentId set to ${capturedPayment.id}.`, ok: true });
  trace.push({ label: `Recovered ✓ ₹${transaction.amount.toLocaleString('en-IN')} — audit trail written, no customer message sent.`, ok: true, isFinal: true });

  emitLive('event:resolved', {
    recoveryEventId: recoveryEvent._id, transactionId: transaction._id,
    customerId, amount: transaction.amount,
    outcome: 'recovered', amountRecovered: transaction.amount,
    actionTaken: recoveryEvent.actionTaken, diagnosis: recoveryEvent.diagnosis, status: 'resolved'
  });

  return {
    checked: true, mismatch: true, paymentId: capturedPayment.id, amount: transaction.amount,
    method: capturedPayment.method, previousStatus, message: messageContent, trace,
    apiCall, ourRecord, razorpayRecord, allPayments
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/create-order
// Creates a real Razorpay order (or mock if keys not set)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-order', async (req, res) => {
  try {
    const { customerId, productId, amount, category } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const product = PRODUCTS.find(p => p.id === productId);
    const txAmount = amount || product?.amount || 999;
    const txCategory = category || product?.category || 'checkout';
    const description = product?.description || 'Payment';

    // Create our DB transaction record
    const transaction = await Transaction.create({
      customerId: customer._id,
      amount: txAmount,
      category: txCategory,
      status: 'pending',
      paymentMethod: customer.savedPaymentMethods[0]?.type || 'card',
      description: product?.name || 'Custom order'
    });

    let rzpOrderId, rzpOrderData;

    if (razorpay) {
      // Real Razorpay order
      rzpOrderData = await razorpay.orders.create({
        amount: txAmount * 100,  // Razorpay expects paise
        currency: 'INR',
        receipt: transaction._id.toString(),
        notes: {
          customerId: customer._id.toString(),
          transactionId: transaction._id.toString(),
          productName: product?.name || 'Order',
          category: txCategory
        }
      });
      rzpOrderId = rzpOrderData.id;
    } else {
      // Mock order ID for demo without real keys
      rzpOrderId = `order_mock_${uuidv4().slice(0, 14)}`;
    }

    // Save the Razorpay order ID on the transaction
    transaction.razorpayOrderId = rzpOrderId;
    await transaction.save();

    res.json({
      success: true,
      orderId: rzpOrderId,
      internalId: transaction._id,
      amount: txAmount,
      amountPaise: txAmount * 100,
      currency: 'INR',
      isLive: !!razorpay,
      keyId: RZP_KEY_ID || '',
      product: { name: product?.name, description },
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        contact: customer.phone
      }
    });
  } catch (err) {
    console.error('[Checkout] create-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/create-retry-order
// Creates a real Razorpay order for an EXISTING failed transaction (e.g. a customer
// tapping the payment link from a recovery nudge) — reuses the same transaction record
// rather than creating a new one, so completing it resolves the original RecoveryEvent.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-retry-order', async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await Transaction.findById(transactionId).populate('customerId');
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    const customer = transaction.customerId;
    let rzpOrderId;

    if (razorpay) {
      const rzpOrderData = await razorpay.orders.create({
        amount: transaction.amount * 100,
        currency: 'INR',
        receipt: transaction._id.toString(),
        notes: { customerId: customer._id.toString(), transactionId: transaction._id.toString(), retry: 'true' }
      });
      rzpOrderId = rzpOrderData.id;
    } else {
      rzpOrderId = `order_mock_${uuidv4().slice(0, 14)}`;
    }

    transaction.razorpayOrderId = rzpOrderId;
    await transaction.save();

    res.json({
      success: true,
      orderId: rzpOrderId,
      internalId: transaction._id,
      amount: transaction.amount,
      amountPaise: transaction.amount * 100,
      currency: 'INR',
      isLive: !!razorpay,
      keyId: RZP_KEY_ID || '',
      customer: { name: customer.name, email: customer.email, phone: customer.phone, contact: customer.phone }
    });
  } catch (err) {
    console.error('[Checkout] create-retry-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/confirm-identity
// Real fraud-false-positive verification gate: the customer answers "was this you?"
// on their own device. A genuine "yes" is what unblocks the transaction for retry —
// there's no bank/fraud API to call here, so the customer's own confirmation IS the
// verification (mirrors how card issuers actually resolve this: they ask the
// cardholder directly). A genuine "no" escalates it as real suspected fraud instead
// of guessing with a coin flip.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/confirm-identity', async (req, res) => {
  try {
    const { transactionId, confirmed } = req.body;
    const transaction = await Transaction.findById(transactionId).populate('customerId');
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    const recoveryEvent = await RecoveryEvent.findOne({ transactionId, outcome: 'pending' }).sort({ detectedAt: -1 });
    if (!recoveryEvent) return res.status(404).json({ error: 'No pending verification for this transaction' });

    if (confirmed) {
      await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
        'actionTaken.messageContent': `Customer confirmed this was them — cleared to retry payment for ₹${transaction.amount}.`
      });
      emitLive('event:action_started', {
        recoveryEventId: recoveryEvent._id, transactionId: transaction._id,
        customerId: transaction.customerId._id, amount: transaction.amount,
        funnelLevel: 3, actionType: 'in_app_prompt', status: 'verified'
      });
      return res.json({ success: true, verified: true, message: 'Identity confirmed — proceed to payment' });
    }

    // Genuine "no, this wasn't me" — this is real suspected fraud, not a retryable failure
    await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
      outcome: 'escalated',
      'actionTaken.messageContent': 'Customer confirmed this was NOT them — escalated to fraud review, payment blocked.'
    });
    await Transaction.findByIdAndUpdate(transaction._id, { status: 'failed' });

    const updated = await RecoveryEvent.findById(recoveryEvent._id);
    emitLive('event:resolved', {
      recoveryEventId: recoveryEvent._id, transactionId: transaction._id,
      customerId: transaction.customerId._id, amount: transaction.amount,
      outcome: 'escalated', amountRecovered: 0,
      actionTaken: updated.actionTaken, diagnosis: updated.diagnosis, status: 'resolved'
    });

    res.json({ success: true, verified: false, message: 'Reported — this transaction has been blocked and flagged for fraud review' });
  } catch (err) {
    console.error('[Checkout] confirm-identity error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/payment-success
// Called after Razorpay modal success callback — verifies signature
// ─────────────────────────────────────────────────────────────────────────────
router.post('/payment-success', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, internalId } = req.body;

    // Verify signature if we have a real key
    if (razorpay && RZP_KEY_SECRET && razorpay_signature) {
      const expectedSig = crypto
        .createHmac('sha256', RZP_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSig !== razorpay_signature) {
        return res.status(400).json({ error: 'Signature verification failed' });
      }
    }

    // Find and update transaction
    const transaction = await Transaction.findOneAndUpdate(
      { $or: [{ _id: internalId }, { razorpayOrderId: razorpay_order_id }] },
      {
        status: 'succeeded',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature
      },
      { new: true }
    );

    if (transaction) {
      // Emit success event (for stats/dashboard update)
      eventBus.emit('payment.succeeded', {
        event: 'payment.succeeded',
        transactionId: transaction._id.toString(),
        payload: { amount: transaction.amount, razorpay_payment_id }
      });
    }

    res.json({ success: true, status: 'succeeded', paymentId: razorpay_payment_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/payment-failed
// Called after Razorpay modal payment.failed event
// razorpayError: { code, description, source, step, reason, metadata }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/payment-failed', async (req, res) => {
  try {
    const { razorpay_order_id, internalId, razorpayError } = req.body;

    const { errorCode, errorReason } = mapRazorpayError(
      razorpayError?.code || razorpayError?.error?.code,
      razorpayError?.description || razorpayError?.error?.description
    );

    const transaction = await Transaction.findOneAndUpdate(
      { $or: [{ _id: internalId }, { razorpayOrderId: razorpay_order_id }] },
      { status: 'failed', errorCode, errorReason },
      { new: true }
    );

    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    // Fire recovery pipeline
    const webhookEvent = {
      event: 'payment.failed',
      transactionId: transaction._id.toString(),
      payload: {
        id: razorpayError?.metadata?.payment_id || `pay_${uuidv4().slice(0, 8)}`,
        order_id: razorpay_order_id,
        amount: transaction.amount * 100,
        currency: 'INR',
        status: 'failed',
        error_code: errorCode,
        error_description: errorReason,
        razorpay_error: razorpayError
      }
    };

    eventBus.emit('payment.failed', webhookEvent);
    console.log(`[Checkout] payment.failed fired — ${errorCode}: ${errorReason}`);

    res.json({
      success: false,
      status: 'failed',
      errorCode,
      errorReason,
      recoveryActivated: true,
      message: 'Recovery agent activated'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/payment-abandoned
// Called when user dismisses (closes) the Razorpay modal
// ─────────────────────────────────────────────────────────────────────────────
router.post('/payment-abandoned', async (req, res) => {
  try {
    const { razorpay_order_id, internalId } = req.body;

    const found = await Transaction.findOne({ $or: [{ _id: internalId }, { razorpayOrderId: razorpay_order_id }] });
    if (!found) return res.status(404).json({ error: 'Transaction not found' });

    // Before assuming abandonment, check reality: the modal closing is not proof the
    // customer didn't pay — a UPI app-switch they never returned from, or the browser
    // closing right as the widget's success callback was firing, both look identical
    // to a dismiss but can leave a genuinely captured payment behind.
    const reconciliation = await reconcileTransaction(found);
    if (reconciliation.mismatch) {
      console.log(`[Checkout] Dismiss looked like abandonment, but Razorpay confirms payment ${reconciliation.paymentId} was captured — reconciled automatically`);
      return res.json({ success: true, reconciled: true, message: 'Payment was actually already captured — reconciled automatically, no recovery needed' });
    }

    const transaction = await Transaction.findByIdAndUpdate(
      found._id,
      { status: 'abandoned', errorCode: 'ABANDONED', errorReason: 'Customer dismissed the payment popup without completing payment' },
      { new: true }
    );

    eventBus.emit('order.abandoned', {
      event: 'order.abandoned',
      transactionId: transaction._id.toString(),
      payload: { order_id: razorpay_order_id, amount: transaction.amount }
    });

    console.log('[Checkout] order.abandoned fired — modal was dismissed');
    res.json({ success: true, recoveryActivated: true, message: 'Abandonment recovery started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/checkout/reconciliation-candidates
// Transactions that might have a captured-but-untracked payment behind them.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/reconciliation-candidates', async (req, res) => {
  try {
    const candidates = await Transaction.find({ status: { $in: ['pending', 'failed', 'abandoned'] } })
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(candidates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/reconcile — recheck ONE transaction against Razorpay's real records
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reconcile', async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    const result = await reconcileTransaction(transaction);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/reconcile-sweep — recheck every open transaction in one pass,
// the same job a real payments team would run on a schedule.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reconcile-sweep', async (req, res) => {
  try {
    const candidates = await Transaction.find({ status: { $in: ['pending', 'failed', 'abandoned'] } })
      .populate('customerId', 'name')
      .limit(100);
    const results = [];
    for (const tx of candidates) {
      const result = await reconcileTransaction(tx);
      results.push({ transactionId: tx._id, customerName: tx.customerId?.name, amount: tx.amount, ...result });
    }
    const fixed = results.filter(r => r.mismatch);
    res.json({
      checked: candidates.length,
      mismatchesFixed: fixed.length,
      amountRecovered: fixed.reduce((s, r) => s + (r.amount || 0), 0),
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/simulate-subscription-failure  (keeps existing logic)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/simulate-subscription-failure', async (req, res) => {
  try {
    const { customerId, amount, forceFailureType } = req.body;
    const failureType = forceFailureType || 'insufficient_balance';

    const failureMap = {
      expired_card:         { errorCode: 'CARD_EXPIRED',         errorReason: 'Subscription renewal failed — card has expired' },
      insufficient_balance: { errorCode: 'INSUFFICIENT_FUNDS',   errorReason: 'Subscription renewal failed — insufficient balance at mandate execution time' },
      otp_timeout:          { errorCode: 'OTP_TIMEOUT',          errorReason: 'Mandate authentication failed — OTP not completed within 5 minute window' }
    };

    const failure = failureMap[failureType] || failureMap.insufficient_balance;

    const transaction = await Transaction.create({
      customerId,
      amount: amount || 2999,
      category: 'subscription',
      status: 'failed',
      errorCode: failure.errorCode,
      errorReason: failure.errorReason,
      forceFailureType: failureType,
      description: 'Monthly subscription renewal — auto-debit'
    });

    eventBus.emit('subscription.charge.failed', {
      event: 'subscription.charge.failed',
      transactionId: transaction._id.toString(),
      forceFailureType: failureType
    });

    res.json({ success: true, transactionId: transaction._id, errorCode: failure.errorCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/checkout/customers
router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find({}, 'name email phone segment savedPaymentMethods contactPreferences');
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/checkout/products
router.get('/products', async (req, res) => res.json(PRODUCTS));

// GET /api/checkout/config — returns public key for frontend
router.get('/config', (req, res) => {
  res.json({
    keyId: RZP_LIVE ? RZP_KEY_ID : null,
    isLive: RZP_LIVE,
    mode: RZP_LIVE ? 'razorpay_test' : 'mock'
  });
});

// POST /api/checkout/reset — wipe all transactions + recovery events for a clean demo
router.post('/reset', async (req, res) => {
  try {
    const Invoice = require('../models/Invoice');
    const [tx, ev, inv] = await Promise.all([
      Transaction.deleteMany({}),
      RecoveryEvent.deleteMany({}),
      Invoice.updateMany({}, { $set: { status: 'pending', reminderStage: 0, promiseSuppressed: false, promiseToPayDate: null, replyLog: [], approvalRequests: [] } })
    ]);
    console.log(`[Reset] Cleared ${tx.deletedCount} transactions, ${ev.deletedCount} events`);
    res.json({ success: true, deleted: { transactions: tx.deletedCount, events: ev.deletedCount, invoicesReset: inv.modifiedCount } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
