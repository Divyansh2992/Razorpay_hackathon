# AI Revenue Recovery Agent

**Razorpay Hackathon — Track 03: Recover Revenue Automatically**

Solo submission.

When a payment fails — a declined card, an abandoned checkout, an overdue B2B invoice, or a payment that actually succeeded but the system never found out — that revenue isn't gone, it's just unrecovered. This agent watches for exactly these moments, figures out the real reason using rules and an LLM, and runs a bounded, governed recovery workflow to win the money back automatically. Every number on the dashboard ties back to a real transaction and a real audit-trail entry — nothing is a canned demo number.

## Contents

- [How it works](#how-it-works)
- [The escalation ladder](#the-escalation-ladder)
- [Failure types it handles](#failure-types-it-handles)
- [What's real vs. simulated](#whats-real-vs-simulated)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Running it locally](#running-it-locally)
- [Governance guardrails](#governance-guardrails)

## How it works

Every failure — whatever triggers it — goes through the same five-stage pipeline:

```
Detect → Diagnose → Decide → Govern → Act
```

1. **Detect** — a real event fires the moment something goes wrong: a Razorpay checkout failure, a dismissed payment popup, an overdue invoice, a subscription charge failure. No polling.
2. **Diagnose** — the failure's error code is looked up in a rule table first (covers roughly 80% of real-world cases instantly and deterministically). Anything the rules don't recognize is handed to a Groq LLM, which reasons over the actual error and the customer's recent payment history to classify it.
3. **Decide** — a decision engine maps the diagnosis to a point on the escalation ladder (below), factoring in the customer's payment methods, retry count, and transaction value.
4. **Govern** — before anything is sent, a governance layer checks stopping rules: has this customer already been contacted too many times, have we already retried 3 times, did they opt out, is there an active dispute, does RBI's e-mandate pre-debit notice window still need to elapse. Any violation blocks the action and logs why.
5. **Act** — the chosen action actually runs: a silent retry, a real WhatsApp-style nudge with a working payment link, an in-app verification prompt, a full AI conversation, or an escalation. The outcome is written to a `RecoveryEvent` and pushed live over Socket.io, so the admin dashboard and the customer's own screen update instantly, no refresh.

## The escalation ladder

The ladder always starts as quiet as possible and only climbs if it has to:

| Level | What happens | When | Why |
|---|---|---|---|
| **L1 — Silent** | Fixed in the background; the customer never sees anything | Infra glitches, or a backup payment method exists | No point bothering the customer for something the system can just fix itself |
| **L2 — Nudge** | A real message (WhatsApp-style) with a working payment link | Card declined/expired, cart abandonment, ambiguous failures | The customer has to act, so give them the easiest possible path to act |
| **L3 — In-app verify** | Ask the customer to confirm "was this really you?" | A possible false fraud block | The system itself might be wrong — the customer's own answer is the actual verification |
| **L4 — AI conversation** | A full back-and-forth with the recovery agent | A nudge alone didn't resolve it | Needs more than a link — needs a real conversation to understand what's going on |
| **L5 — Escalation** | Voice call or human handoff | High-value payments with repeated failures | The stakes are high enough that automation alone shouldn't decide |

## Failure types it handles

| Failure | Where it's triggered | Recovery mechanism |
|---|---|---|
| Card declined / expired | Real Razorpay Checkout.js test-mode decline | Diagnosed via rules or LLM → nudge or silent alt-method retry |
| Checkout abandonment | Customer closes the payment popup | LLM writes a personalized WhatsApp-style message, pushed live to the customer's screen |
| OTP timeout / auth friction | Real Razorpay OTP-step failure | Sub-cause classified (not received, expired, wrong number, etc.) and routed to a specific fix |
| Subscription / e-mandate failure | Recurring charge failure | A real retry sequencer — RBI-compliant pre-debit notice, wait window, then a bank-side retry — not a single blind retry |
| Payment succeeded, record never updated | Dropped webhook, closed tab, UPI app-switch | Reconciliation engine calls Razorpay's real API directly, diffs it against the internal record field-by-field, and self-corrects |
| Overdue B2B invoice | Business customer's plain-English reply | Intent classified (promise to pay, dispute, confirmation) — never auto-applied, always queued for admin approval |

## What's real vs. simulated

This was a deliberate rule throughout the build: **never fake an outcome where a real signal is available.**

- Real Razorpay Orders API, real Checkout.js widget, real signature verification — nothing about the payment flow is mocked.
- Real Groq LLM calls for every ambiguous diagnosis, every recovery message, and every conversation turn.
- Fraud-verification "yes/no" comes from the actual customer tapping a button, not a coin flip.
- The e-mandate retry sequencer respects a real 24-hour RBI pre-debit-notice window before attempting an auto-debit retry.
- Reconciliation checks Razorpay's live API as the actual source of truth, instead of trusting a client-side callback that may never arrive.
- The only place probability is intentionally used is for genuinely silent, no-observable-signal background actions — e.g. a bank-side auto-debit retry outcome — where there is no real signal to check in a demo environment.

## Screenshots

### Home
Role selection — Admin, Customer, or B2B — each a genuinely separate view into the same live data.

![Home](images/home%20.png)

### Admin Dashboard
Live recovery funnel (₹ at risk vs. ₹ recovered, by escalation level), event stream, and full audit trail.

![Admin Dashboard](images/admin%20dashboard.png)

### Recovery Live
Launch a real failed transaction and watch the full pipeline — detect, diagnose, decide, govern, act — run live, step by step.

![Recovery Live](images/recovery%20line.png)

### Customer Storefront
The real checkout experience: genuine Razorpay Checkout.js widget, real test-mode declines, and a proactive AI recovery chatbot that knows the customer's actual failure reason.

![Customer Layout](images/customer%20layout.png)

### Reconciliation
Catches payments that genuinely succeeded on Razorpay's side but never got recorded internally. Calls Razorpay's real API and shows the actual field-by-field diff — not a narrative summary.

![Reconciliation](images/reconcillation.png)

### B2B Invoices
Business customers reply in plain English; the AI classifies what they mean, but a human always approves before anything changes.

![B2B Invoices](images/b2b%20invoices.png)

![B2B Portal](images/b2b.png)

## Tech stack

- **Backend**: Node.js, Express, MongoDB (Mongoose), Socket.io for real-time sync
- **Frontend**: React (Vite), Recharts, Socket.io client
- **AI**: Groq (LLaMA 3.3 70B) — diagnosis, recovery messaging, conversational recovery, admin reasoning
- **Payments**: Razorpay — Orders API, Checkout.js widget, signature-verified webhooks/callbacks

## Project structure

```
server/
  src/
    routes/          # Express routes — checkout, recoveryLive, invoice, conversation, mandate, dashboard
    services/
      diagnosisService.js    # Rule table + LLM fallback for failure classification
      decisionEngine.js      # Bucket → escalation-level mapping
      governanceService.js   # Stopping rules: retry/contact caps, opt-outs, disputes, RBI notice
      actionService.js       # Executes the chosen recovery action
      mandateService.js      # Real e-mandate retry sequencer
      detectionService.js    # Event-bus listener that runs the full pipeline
      aiService.js            # All Groq LLM calls
  src/models/          # Transaction, Customer, RecoveryEvent (the audit trail)
client/
  src/pages/
    Dashboard.jsx        # Admin recovery funnel + audit trail
    RecoveryLive.jsx      # Live pipeline trigger + visualizer
    CustomerStore.jsx     # Real storefront + checkout + recovery chatbot
    Reconciliation.jsx    # Real-vs-recorded payment diff tool
    ConversationSim.jsx   # Admin-facing LLM reasoning console
    InvoiceTracker.jsx    # B2B invoice + reply-classification UI
images/                # Screenshots used in this README
```

## Running it locally

**Backend**
```bash
cd server
npm install
npm run seed   # seeds a demo customer + products
npm run dev
```

**Frontend**
```bash
cd client
npm install
npm run dev
```

**Environment** — create `server/.env`:
```
PORT=5000
MONGODB_URI=<your MongoDB connection string>
GROQ_API_KEY=<your Groq API key>
CLIENT_URL=http://localhost:5173
RAZORPAY_KEY_ID=<your Razorpay test-mode key id>
RAZORPAY_KEY_SECRET=<your Razorpay test-mode key secret>
```

Without a Razorpay key configured, checkout falls back to a simulated success/failure prompt so the demo still runs end to end — but the intended experience uses real Razorpay test-mode keys.

## Governance guardrails

- Max 3 retries per transaction
- Max 5 customer contact touches
- Opt-outs are always honored, no exceptions
- RBI's pre-debit notice window is enforced before any e-mandate auto-debit retry
- Any dispute intent auto-halts automated recovery and flags the case for human review
