# Build Prompt: AI Revenue Recovery Platform (MERN)

Use this as the master prompt to hand to a coding agent (Claude Code, Cursor, etc.) or to guide your own build. It assumes the PRD (`AI_Revenue_Recovery_PRD.md`) as the source of truth for requirements — this document translates it into an actionable build spec.

---

## PROJECT BRIEF (paste this as the top-level instruction)

> Build a full-stack MERN application called **"Revenue Recovery Agent"** — a simulated Razorpay-style payment platform with an AI-powered recovery agent layered on top. The app has two connected halves:
>
> 1. A **mock checkout/payment system** that behaves like Razorpay (creates orders, processes payments, fires webhook-style events), where the demo operator can deliberately trigger specific failure types (expired card, insufficient balance, OTP/auth failure, fraud false-positive, gateway timeout) to showcase the recovery agent's behavior on demand.
> 2. A **Revenue Recovery Agent** that listens to these events in real time, classifies each failure (using deterministic rules first, and an LLM call only for ambiguous/unclear cases or free-text customer replies), decides the correct recovery action from a 5-level funnel (silent retry → frictionless nudge → in-app prompt → two-way AI conversation → escalation), executes it, enforces stopping/compliance rules, and logs everything to an audit trail.
>
> A live dashboard shows the whole pipeline in action: incoming failure events, diagnosis reasoning, the action taken, and running totals of ₹ recovered vs ₹ at risk — broken down by funnel level, so it's provable that most recovery happens WITHOUT relying on the customer reading a notification.
>
> The system should also handle B2B invoice scenarios: overdue invoices, staged reminder sequences, and promise-to-pay tracking extracted from free-text replies via LLM.
>
> Explicitly separate rule-based logic (🔧, no LLM call) from AI-required logic (🧠, LLM call) in code comments/architecture — this distinction is a core part of the product story and must be visible in the codebase and in the dashboard UI (e.g., a badge showing "Rule-based" vs "AI-diagnosed" per event).

---

## TECH STACK

- **Frontend:** React (Vite), TailwindCSS, Socket.io-client for live updates
- **Backend:** Node.js, Express, Socket.io
- **Database:** MongoDB (Mongoose)
- **AI:** Anthropic API (Claude) — used ONLY for the specific tagged 🧠 use cases below
- **Auth:** Simple session/JWT — not the focus, keep minimal (demo operator login only, no real customer auth needed)

---

## DATA MODELS (MongoDB / Mongoose)

### `Customer`
```
{
  name, email, phone,
  savedPaymentMethods: [{ type, last4, expiryMonth, expiryYear, isPrimary }],
  paymentHistory: [{ transactionId, status, timestamp }],
  contactPreferences: { channel, optedOut: Boolean }
}
```

### `Transaction`
```
{
  customerId, amount, category: enum['checkout','subscription','invoice'],
  status: enum['pending','failed','succeeded','recovered','abandoned','written_off'],
  paymentMethod, errorCode, errorReason,
  createdAt, updatedAt,
  retryCount, maxRetries,
  dueDate (for invoices),
  promiseToPayDate (nullable)
}
```

### `RecoveryEvent` (the audit trail — this is critical for the "bar")
```
{
  transactionId,
  detectedAt,
  diagnosis: {
    bucket: enum['hard_decline','soft_decline','auth_friction','fraud_fp','infra_glitch','ambiguous'],
    method: enum['rule','llm'],
    llmReasoning: String (nullable, only if method === 'llm'),
    confidence
  },
  actionTaken: {
    funnelLevel: 1|2|3|4|5,
    type: enum['silent_retry','alt_payment_method','scheduled_retry','nudge_link',
               'in_app_prompt','ai_conversation','voice_escalation','invoice_reminder'],
    channel: enum['none','whatsapp','sms','email','in_app','voice','human_handoff'],
    messageContent (nullable),
    method: enum['rule','llm']
  },
  outcome: enum['recovered','pending','failed','opted_out','escalated','written_off'],
  amountRecovered,
  timestamp
}
```

### `Invoice` (B2B)
```
{
  customerId (business), amount, dueDate, status: enum['pending','overdue','paid','written_off'],
  reminderStage: 0-4,
  promiseToPayDate,
  replyLog: [{ text, timestamp, extractedIntent, extractedDate }]
}
```

---

## BACKEND MODULES TO BUILD

### 1. Mock Payment Service 🔧
- `POST /api/checkout/create-order` — creates a pending transaction
- `POST /api/checkout/pay` — accepts a `forceFailureType` param (for demo control): `expired_card | insufficient_balance | otp_timeout | fraud_block | gateway_timeout | none`
- On failure, internally fires a webhook-shaped event object matching Razorpay's real payload structure (`payment.failed`, `subscription.charge.failed`, etc.) into an internal event bus (can just be an EventEmitter or direct function call — no need for real message queue infra for a hackathon)
- Also supports simulating: cart abandonment (order created, no payment attempt within X seconds — use a shortened timer for demo, e.g. 30s instead of hours), subscription renewal failures, invoice overdue triggers

### 2. Detection Layer 🔧
- Listens to internal event bus
- Normalizes event into `Transaction` + creates initial `RecoveryEvent` record with `detectedAt`
- Emits Socket.io event `event:detected` to frontend dashboard immediately (so it appears live)

### 3. Diagnosis Engine (Hybrid) 🔧 + 🧠
- `classifyFailure(errorCode)` — rule-based lookup table mapping known error codes to buckets (hard_decline, soft_decline, auth_friction, fraud_fp, infra_glitch). This covers ~80% of cases.
- `classifyAmbiguous(transaction, customerHistory)` — 🧠 LLM call, ONLY invoked when error code doesn't map cleanly (simulate this by having a subset of `forceFailureType` map to "unclear" codes on purpose, e.g. 15-20% of triggerable failure types). Prompt should return structured JSON: `{ bucket, reasoning, confidence }`.
- `classifyReplyIntent(replyText)` — 🧠 LLM call for any free-text customer reply (used in chat simulation and invoice reply simulation). Returns `{ intent: 'dispute'|'promise_to_pay'|'confusion'|'confirmation'|'refusal', extractedDate, extractedAmount }`.

### 4. Decision Engine 🔧
Maps diagnosis bucket → funnel level:
```
hard_decline        → Level 2 (nudge: update payment method)
soft_decline         → Level 1 (silent scheduled retry near salary date)
auth_friction        → Level 2 (nudge: complete verification)
fraud_fp             → Level 3 (flag + in-app prompt, do not auto-block)
infra_glitch         → Level 1 (silent reroute, no customer contact)
ambiguous (post-LLM) → route based on LLM-returned bucket
```
Also applies: if `customer.savedPaymentMethods.length > 1` → try Level 1 (auto-try alt method) before anything else, regardless of bucket.

Escalation rule: if `retryCount >= 2` AND `amount > threshold` → escalate to Level 4/5 (AI conversation / voice).

### 5. Action Layer 🔧 + 🧠
- `executeSilentRetry(transactionId)` 🔧 — simulate retry, randomly weighted success based on bucket (for demo realism)
- `executeAltPaymentMethod(transactionId)` 🔧
- `generateNudgeMessage(transaction, diagnosis)` 🧠 — LLM call to write a short, personalized recovery message (tone varies by failure reason + case value + retry count). Store output in `messageContent`.
- `handleCustomerReply(transactionId, replyText)` 🧠 — uses `classifyReplyIntent`, then routes: stop/escalate/log promise per intent
- `triggerVoiceEscalation(transactionId)` 🧠 — for demo purposes, this can be a simulated chat-based "voice transcript" UI rather than a real telephony integration (note this explicitly as a demo simplification) — still uses LLM to conduct the conversation turn-by-turn
- `sendInvoiceReminder(invoiceId, stage)` 🔧 — staged template by reminder stage
- `extractPromiseToPay(replyText)` 🧠 — part of `classifyReplyIntent`, stores `promiseToPayDate` and suppresses further reminders until that date

### 6. Governance Layer 🔧
- `checkStoppingRules(transactionId)` — enforce `maxRetries`, opt-out status, dispute flag (auto-halt on `dispute` intent), RBI notice requirement flag for mandate retries (simulate as a boolean compliance check before any silent recurring retry)
- All governance checks run BEFORE any action executes, and are logged as part of the `RecoveryEvent` even when they block an action (e.g., outcome: `blocked_stopping_rule`)

### 7. Audit + Metrics API 🔧
- `GET /api/dashboard/summary` — total at risk, total recovered, recovery rate by category, breakdown by funnel level (this last one is important — it's your proof that recovery isn't just "we sent a notification")
- `GET /api/dashboard/events` — paginated/live feed of all `RecoveryEvent` records with full diagnosis + action detail for the audit trail view
- `GET /api/dashboard/live` — Socket.io stream for real-time dashboard updates

---

## FRONTEND SCREENS TO BUILD

### Screen 1: Mock Checkout (demo control panel)
- Simple product/checkout UI
- Dropdown/buttons to force a specific failure type on submit (this is your "stage control" during the demo)
- Also: buttons to simulate "customer replies" (pick from a few example free-text replies, or a text input) so you can show the LLM reply-classification live
- Buttons to simulate subscription renewal cycles and invoice due-date breaches (fast-forward simulation, not real waiting)

### Screen 2: Recovery Dashboard (the main event)
- **Live event feed** (Socket.io) — each incoming failure appears as a card: amount, customer, error reason, then updates in place as diagnosis → action → outcome resolve, each showing a 🔧 or 🧠 badge
- **Summary metrics bar**: ₹ at risk, ₹ recovered, recovery rate %
- **Funnel breakdown chart**: how much was recovered at each level (1 silent → 5 escalation) — this is your strongest visual proof point
- **Audit trail table**: filterable/searchable log of every event with full diagnosis reasoning (including LLM reasoning text when applicable) and action taken

### Screen 3: Conversation Simulator
- A chat-style UI showing the AI handling a customer reply live — type in a message like "I'll pay by Friday" or "already paid, check again" and watch the agent classify it and respond appropriately
- A separate tab/mode simulating the Hinglish voice conversation as a scripted back-and-forth transcript (clearly labeled as a simulation of the voice flow, not live telephony)

### Screen 4: B2B Invoice Tracker
- List of invoices with status, reminder stage, promise-to-pay date if any
- Timeline view per invoice showing the staged reminder sequence and any replies

---

## AI PROMPT TEMPLATES (for the 🧠 functions — use these as system prompts)

### Ambiguous failure diagnosis
```
You are a payment failure diagnosis assistant for a fintech recovery system.
Given the failure context below, classify it into exactly one bucket:
hard_decline, soft_decline, auth_friction, fraud_fp, or infra_glitch.
Return ONLY valid JSON: {"bucket": "...", "reasoning": "...", "confidence": 0-1}

Context:
- Error code: {errorCode}
- Error message: {errorMessage}
- Payment method: {method}
- Customer's past 5 transactions: {history}
- Time of failure: {timestamp}
```

### Reply intent classification
```
You are classifying a customer's reply to a payment recovery message.
Return ONLY valid JSON:
{"intent": "dispute|promise_to_pay|confusion|confirmation|refusal",
 "extractedDate": "YYYY-MM-DD or null",
 "extractedAmount": number or null,
 "summary": "one line"}

Customer reply: "{replyText}"
Original context: this was a follow-up on a {amount} {category} that was {status}.
```

### Personalized nudge message generation
```
Write a short (under 40 words) recovery message to a customer whose payment failed.
Tone should match: {toneGuidance based on retryCount/value/failure type}.
Include their name and a clear, single call to action. Do not use ALL CAPS or excessive urgency.

Customer name: {name}
Failure reason: {reason}
Amount: {amount}
Retry count so far: {retryCount}
```

### Voice conversation turn (simulated)
```
You are a polite recovery agent speaking in Hinglish (mixed Hindi-English, natural code-switching)
to a customer about an overdue payment of {amount}, overdue by {daysOverdue} days.
Respond to the customer's last message naturally, try to get a commitment on a payment date,
stay respectful, and stop pushing if they express financial difficulty — offer a longer date instead.

Conversation so far: {conversationHistory}
Customer just said: "{lastMessage}"
```

---

## BUILD ORDER (recommended sequence)

1. MongoDB schema + Express boilerplate + Socket.io setup
2. Mock Payment Service with forced-failure triggers (get this working and testable via Postman/curl first)
3. Detection layer wired to event bus → confirm events land in DB and emit over socket
4. Rule-based diagnosis + decision engine (get the 🔧 path fully working end-to-end before touching AI)
5. Wire in the 3 LLM functions (ambiguous diagnosis, reply intent, message generation) — test each in isolation
6. Governance layer (stopping rules, compliance checks) — wrap around the action layer
7. Frontend dashboard (live feed + metrics) — connect to what's already working in backend
8. Frontend checkout/control panel — the "trigger" side
9. Conversation simulator screen
10. Invoice tracker screen
11. Polish: funnel breakdown visualization, audit trail table, seed a few pre-loaded "history" transactions so the dashboard doesn't look empty on first load

---

## DEMO SCRIPT (what to show judges, in order)

1. Show the dashboard empty/baseline
2. Go to mock checkout, trigger a `gateway_timeout` failure → show it silently recover (Level 1) — **no message sent, dashboard updates instantly**
3. Trigger an `expired_card` failure → show a personalized 🧠-generated nudge message appear, click "customer completes payment" → show it recover at Level 2
4. Trigger an "unclear/ambiguous" failure type → show the LLM diagnosis reasoning text appear in the audit log — explain this is where rules alone would've failed
5. Go to Conversation Simulator, type a reply like "I already paid, stop messaging me" → show correct intent classification and the system auto-stopping further contact
6. Go to Invoice Tracker, show an overdue invoice, simulate a reply "I'll pay by Friday" → show promise-to-pay extracted and reminder suppressed until then
7. Return to dashboard, show final summary: ₹ at risk vs ₹ recovered, and the **funnel-level breakdown** proving most recovery happened without the customer even seeing a notification
8. Close with the business model slide (success-fee model, lending cross-sell) — referencing the PRD

---

## KEY THINGS NOT TO GET WRONG

- Every LLM call must have a clear reason it couldn't be a simple rule — if a judge asks "couldn't this just be an if-else," you need a confident answer for each 🧠 tagged function
- The audit trail must be real and inspectable, not just a claimed number — judges should be able to click into any recovered transaction and see the full reasoning chain
- Don't fake the "silent recovery" number — make sure Level 1/2 recoveries are visibly the majority in your funnel breakdown, since that's your core differentiator argument
- Keep the compliance/stopping-rule logic visibly enforced (e.g., show one case actually getting blocked/halted in the demo, not just successes)

---

**Pair this document with `AI_Revenue_Recovery_PRD.md` when briefing a coding agent — the PRD is the "why," this is the "how to build it."**
