# Product Requirements Document
## AI Revenue Recovery Agent — Razorpay Track 03

**Version:** 1.0
**Date:** August 23, 2026
**Status:** Draft for Hackathon Build

---

## 1. Problem Statement

Revenue leaks out of the Razorpay payment pipeline at multiple points — failed payments, abandoned checkouts, failed subscription renewals, and overdue B2B invoices. Today, recovery is either:

- **Fully manual** (B2B invoice chasing — a human has to remember, follow up, track promises)
- **Basic and generic** (Razorpay's existing Failed Payment Recovery sends the same templated message via WhatsApp/SMS/Email regardless of *why* the payment failed)
- **Single-layer** (subscription retries happen once, on a fixed schedule, regardless of failure reason)

Industry data shows the size of the gap:
- 20–25% of payments fail for avoidable reasons; half of those customers won't return without a nudge
- 70% of customers abandon after a single payment failure
- Indian SaaS on Razorpay sees 8–15% monthly subscription failure rates; RBI e-mandate authentication pushes failures to 20–40% on payments above ₹5,000
- Median companies recover only 30–45% of failed payments using default retries; top-quartile companies recover 65–75% by running multiple recovery layers simultaneously — not by retrying harder, but smarter

**The opportunity:** build an agent that diagnoses *why* revenue is at risk, picks the *right* intervention per case (not a generic retry), executes it with minimal reliance on the customer noticing a notification, and proves it works with real recovered-₹ numbers.

---

## 2. Goals

### Primary Goal
Build a working agent that processes a batch of at-risk revenue events (failed payments, abandoned checkouts, failed subscriptions, overdue invoices), diagnoses root cause, executes a bounded recovery action, and reports measured ₹ recovered with a full audit trail.

### Business Goals (for Razorpay, not just the merchant)
- Increase successful transaction volume → more transaction fee revenue
- Create a new revenue line via a success-fee recovery product
- Surface cross-sell signals for lending products (RazorpayX Capital) from repeated failure/overdue patterns
- Strengthen platform stickiness through better merchant outcomes

### Non-Goals (for this build)
- Not building a full replacement for Razorpay's existing Optimizer/smart-routing infra (already solved well)
- Not building a general-purpose CRM or support inbox
- Not handling disputes/chargebacks end-to-end (only flagging them for human handoff)

---

## 3. Design Principle: Rules First, AI Where It's Actually Needed

A core requirement of this PRD is **not overusing AI**. Every capability below is explicitly tagged as either:

- 🔧 **Rules/Automation** — deterministic logic, no LLM required, cheap and reliable
- 🧠 **AI/LLM required** — genuinely needs language understanding or judgment that rules cannot handle

This split is a first-class part of the product story, not an implementation detail.

---

## 4. Scope: The Four Revenue Leak Categories

| Category | Description |
|---|---|
| A. Checkout payment failures | Card/UPI/netbanking payment fails at time of purchase |
| B. Checkout abandonment | Cart created, payment never attempted or abandoned mid-flow |
| C. Subscription/mandate failures | Recurring auto-debit (card/eNACH/UPI Autopay) fails |
| D. B2B receivables | Invoice goes unpaid past due date |

---

## 5. Functional Requirements

### 5.1 Detection Layer 🔧

| Requirement | Detail |
|---|---|
| FR-1.1 | Ingest Razorpay webhook events: `payment.failed`, `order.created` (no payment attempted), `subscription.charge.failed`, `invoice.overdue` |
| FR-1.2 | Parse and store structured failure metadata: error code, error reason, payment method, amount, customer ID, timestamp |
| FR-1.3 | Track card expiry dates against upcoming renewal dates for proactive detection (not reactive-only) |
| FR-1.4 | Track invoice due dates and flag on breach |

### 5.2 Diagnosis Layer (Hybrid)

| Requirement | Detail | Type |
|---|---|---|
| FR-2.1 | Classify failure into buckets using known error codes: hard decline, soft decline, auth/OTP friction, fraud false-positive, infra/gateway issue | 🔧 Rules |
| FR-2.2 | For failures that don't map cleanly to a known bucket (ambiguous/combined signals), use LLM reasoning over error context + customer payment history to infer likely cause | 🧠 AI |
| FR-2.3 | Classify customer free-text/voice replies (e.g., "already paid," "pay by Friday," "wrongly charged") into intents: dispute, promise-to-pay, confusion, refusal, confirmation | 🧠 AI |
| FR-2.4 | Extract structured data from unstructured replies (promised date, disputed amount) | 🧠 AI |

### 5.3 Action Layer (Recovery Funnel — Ordered by Priority)

**Level 1 — Silent recovery (no customer contact)** 🔧
| Requirement | Detail |
|---|---|
| FR-3.1 | If customer has a secondary saved payment method, auto-retry with it before any notification |
| FR-3.2 | For soft declines (insufficient balance), schedule retry near likely salary dates (1st–7th) instead of fixed +1 day |
| FR-3.3 | For infra/gateway-flagged failures, defer to existing smart-routing reroute (no customer-facing action) |

**Level 2 — Frictionless nudge** 🔧
| Requirement | Detail |
|---|---|
| FR-3.4 | Send pre-filled, one-tap payment link (no login/re-entry) via WhatsApp/SMS/Email for abandoned checkouts and hard-decline subscriptions |
| FR-3.5 | Send pre-expiry card update prompts 30 days before renewal for cards expiring soon |

**Level 3 — In-context prompt** 🔧
| Requirement | Detail |
|---|---|
| FR-3.6 | Surface an in-app soft-paywall/banner on next login for unresolved subscription failures |

**Level 4 — Two-way conversation (high-value or unresponsive cases)** 🧠
| Requirement | Detail |
|---|---|
| FR-3.7 | Personalize message tone/content based on failure reason, customer history, and case value | 🧠 AI |
| FR-3.8 | Handle inbound WhatsApp/chat replies conversationally, route based on classified intent (FR-2.3) | 🧠 AI |
| FR-3.9 | Hinglish voice call agent for high-value overdue invoices or repeatedly unresponsive cases — conducts a natural conversation, attempts to secure a payment commitment | 🧠 AI |

**Level 5 — B2B staged escalation** 🔧 (+ 🧠 for reply handling)
| Requirement | Detail |
|---|---|
| FR-3.10 | Staged reminder sequence for overdue invoices: pre-due, on-due, +3 days, +7 days, escalate | 🔧 |
| FR-3.11 | Track promise-to-pay dates extracted from replies (FR-2.4); suppress reminders until promised date, auto-follow-up if broken | 🔧 scheduling + 🧠 extraction |

### 5.4 Governance Layer 🔧

| Requirement | Detail |
|---|---|
| FR-4.1 | Enforce max retry/contact caps per case (e.g., 3 payment retries, 5 invoice reminders over 21 days) |
| FR-4.2 | Respect opt-outs; suppress further contact immediately on request |
| FR-4.3 | Comply with RBI pre-debit notification rules for recurring mandate retries — no silent re-attempt without required notice |
| FR-4.4 | Auto-stop and flag for human handoff on dispute/chargeback signals — no further automated recovery action |
| FR-4.5 | Full audit log per case: detection event → diagnosis → action taken → channel → outcome → ₹ recovered |

### 5.5 Reporting Layer 🔧

| Requirement | Detail |
|---|---|
| FR-5.1 | Batch-level dashboard: total ₹ at risk, ₹ recovered, recovery rate by category (A/B/C/D) |
| FR-5.2 | Breakdown of recovery by funnel level (silent / nudge / in-context / conversation / escalation) to prove silent-first recovery isn't just "we sent a text" |
| FR-5.3 | Estimated incremental Razorpay transaction-fee revenue from recovered payments |

---

## 6. Business Model Layer (Beyond the Core Agent)

| Idea | Mechanism | Revenue Impact |
|---|---|---|
| Success-fee pricing | Razorpay takes a small % only of amounts actually recovered | New revenue line, zero merchant risk |
| Lending cross-sell | Repeated failure/overdue patterns flagged as signal for RazorpayX Capital working-capital offers | New revenue line (interest/fees) |
| Tiered product | Basic rules-based recovery free; AI-personalized/voice recovery as paid add-on | New SaaS revenue line |
| Aggregated insights | Anonymized platform-wide failure trends sold as benchmarking/analytics product | New analytics revenue line |

*(Not required for MVP demo, but should be referenced in pitch as the "why Razorpay should build this" story.)*

---

## 7. System Architecture (High Level)

```
Razorpay Webhooks (payment.failed, subscription.charge.failed,
                     order.created, invoice.overdue)
        │
        ▼
┌─────────────────────┐
│  Detection Layer      │  🔧 rules: parse events, track expiry/due dates
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  Diagnosis Layer      │  🔧 rules for known error codes
│                       │  🧠 LLM for ambiguous cases + reply understanding
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  Decision Engine       │  🔧 maps diagnosis → funnel level (1–5)
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  Action Layer          │  🔧 silent retry, scheduled retry, link generation
│                       │  🧠 personalized message gen, chat handling, voice agent
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  Governance Layer      │  🔧 caps, opt-outs, compliance checks, dispute halt
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  Audit Log + Dashboard │  🔧 every step logged; ₹ recovered reported
└─────────────────────┘
```

---

## 8. Success Metrics (for Hackathon Demo)

| Metric | Target for Demo |
|---|---|
| Batch size processed | 100+ simulated at-risk events across all 4 categories |
| Overall recovery rate | Show measurable ₹ recovered / ₹ at risk |
| % recovered silently (Level 1–2, no live conversation needed) | Report explicitly — proves it's not "just notifications" |
| Diagnosis accuracy on ambiguous cases | Show LLM reasoning output vs. rule-only baseline |
| Stopping rule compliance | 0 cases exceeding contact caps |
| Audit trail completeness | 100% of cases traceable end-to-end |

---

## 9. Out of Scope for MVP

- Real production Razorpay account integration (use sandbox/simulated webhook data)
- Real voice telephony infra (can simulate/demo the conversation logic via chat interface if voice stack is too heavy for hackathon timeline)
- Legal/collections agency marketplace (Idea 7 from business brainstorm) — mention only as future roadmap
- Full lending underwriting logic — only the *signal/flag* for cross-sell, not the actual loan decision

---

## 10. Open Questions

1. Do we build the voice (Hinglish) agent as a real speech pipeline or a scripted chat-based simulation, given hackathon time constraints?
2. What's the data source for the demo batch — synthetic data modeled on published failure-rate statistics, or a mock Razorpay sandbox integration?
3. Should promise-to-pay tracking support partial payments, or binary paid/unpaid only for MVP?

---

## 11. Appendix: Failure → Fix → Benefit Reference Table

| Failure | Fix | Type | Benefit |
|---|---|---|---|
| Bank/gateway glitch | Silent reroute | 🔧 | Recovered sale, no customer friction |
| Card fails, backup saved | Auto-try 2nd card silently | 🔧 | Highest-converting, zero-friction recovery |
| Customer abandons after failure | One-tap pre-filled payment link | 🔧 | Converts abandoned sales |
| Subscription fails (low balance) | Retry near salary date | 🔧 | Higher retry success rate |
| Subscription fails (expired card) | Pre-expiry warning | 🔧 | Prevents failure before it happens |
| Notifications ignored | In-app soft paywall | 🔧 | Converts without depending on message being read |
| High-value stuck payment/invoice | Escalate to Hinglish voice/human | 🧠 | Recovers large amounts, higher response rate than text |
| Broken promise-to-pay | Auto follow-up on missed date | 🔧 scheduling + 🧠 extraction | Prevents silent write-offs |
| Ambiguous failure reason | LLM diagnosis over context | 🧠 | Correct action instead of default fallback |
| Free-text customer reply | LLM intent classification | 🧠 | Correct routing (stop, escalate, log promise) instead of breaking |
| Repeated cash-flow failure pattern | Flag for working-capital offer | 🔧 | New lending revenue for Razorpay |

---

**End of PRD**
