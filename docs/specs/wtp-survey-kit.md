# WTP Survey Kit

> **Goal:** Validate (or invalidate) the $9.99/mo monetization hypothesis from [`docs/monetization-thesis.md`](../monetization-thesis.md) with the existing beta cohort before launch.
> **Effort:** 1 day to deploy, 7 days to collect, 1 day to analyze.
> **Audience:** Founder, deployable as-is.

## Why this exists

Direct "would you pay $X?" questions inflate stated willingness-to-pay by **30–300%** vs. actual purchase behavior (per ScienceDirect + Springer meta-analyses cited in the monetization thesis). The Van Westendorp Price Sensitivity Meter (PSM) and behavioral-commitment capture are the only methods that hold up at n=50–200 sample sizes.

This kit is the **2-question PSM + behavioral commitment capture** — the stripped-down version that works at solo-founder scale.

## Method

A two-front validation:

1. **The survey** — emailed to existing beta users. Best for warm cohort that already has product context.
2. **The reservation page** — public at [`heytelli.com/founding-member.html`](../../landing/founding-member.html). Best for cold traffic from a small paid ad spend.

Both feed into the same decision rules below.

## Sample size guidance

| n | Reading |
|---|---|
| <50 | Insufficient — directional only, do not ship a launch price off this |
| 50–99 | Directional — adequate to confirm or refute hypothesis order-of-magnitude |
| 100–199 | **Defensible** — adequate to set a launch price |
| 200+ | Academic-grade — beyond this, diminishing returns |

For HeyTelli's pre-launch beta, target **100+ responses** before making a pricing call.

---

## The survey — verbatim copy

**Subject:** Quick 30-second question about HeyTelli pricing

**Body:**

> Hi —
>
> We're getting close to launch and need your honest read on pricing. Three quick questions, takes 30 seconds.
>
> Past research shows people tend to overstate what they'd pay by about 2x. Knowing that, please be as realistic as you can.
>
> **Q1.** Imagine HeyTelli launches next month at a monthly subscription. **At what monthly price would it feel expensive — but you'd still pay** because the value is worth it to you? $\_\_\_\_
>
> **Q2.** **At what monthly price would it be so expensive you'd walk away?** $\_\_\_\_
>
> **Q3.** Would you lock in your founding-member rate at **$7.99/mo** right now? You'd add your card, we charge nothing until launch, and you keep that rate for as long as you're subscribed.
>
> [Yes — reserve my founding-member rate]
>
> Thank you. We'll send your TestFlight invite separately.

**Notes on the wording:**
- **Cheap-talk preamble** ("past research shows...") is the only de-biasing patch validated for low-N samples. Don't skip it.
- **Q1 = PME (Point of Marginal Expensiveness)** — the ceiling she still finds acceptable. This is the price you can defensibly anchor at.
- **Q2 = "too expensive" walk-away.** Used to read headroom (Q2/Q1 ratio).
- **Q3 = behavioral commitment** at a deliberately *lower* price ($7.99) to test if she'll actually transact. **This is the only un-inflateable signal.** The $7.99 anchor is below the hypothesis ($9.99) so capture rate should be higher than launch-day expected conversion.

---

## Decision rules

After 100+ responses:

### Pricing call (combine Q1 + Q3)

| Reading | Meaning | Action |
|---|---|---|
| Median Q1 ≥ $9 + Q3 capture ≥ 8% | Strong intent at the hypothesis price | **Ship $9.99/mo** |
| Median Q1 ∈ [$7, $9) + Q3 capture ≥ 8% | Hypothesis a touch high; intent real | **Ship $7.99/mo** (Alternative A in the thesis doc) |
| Median Q1 < $7 + Q3 capture ≥ 8% | Below ceiling, but intent real | Diagnose: is it cost framing or value perception? Repositioning before repricing |
| Q3 capture < 4% regardless of Q1 | Survey says-vs-pays diverging | Product or onboarding problem, not pricing problem |
| Median Q1 + Q3 capture both top-quartile | Underpriced | Test $11.99 in next cohort or move toward Bundle/Circle framing |

### Headroom diagnostic (Q2 ÷ Q1 ratio)

| Ratio | Meaning | Action |
|---|---|---|
| < 1.5× | Tight price band, low risk | Ship as planned; no headroom to push later |
| 1.5–2.5× | Healthy band | Ship as planned; can test premium tier later |
| > 2.5× | Lots of headroom | Underpriced; investigate raising or adding a premium tier |

### Interquartile range diagnostic (Q1)

| Q1 IQR | Meaning |
|---|---|
| < $5 | Strong consensus on perceived value — ship confidently |
| $5–$10 | Normal spread — ship cautiously |
| > $10 | Audience not aligned on what HeyTelli is worth — value-prop problem, fix before pricing |

---

## How to actually deploy

### Option 1 — Google Forms (free, 30 minutes to set up)

1. Create a new Google Form with the three questions above (Q1, Q2 as short-answer numeric; Q3 as multiple-choice yes/no).
2. Set Form responses to dump to a Google Sheet.
3. For the Q3 "Yes" path, link to **`heytelli.com/founding-member.html`** (the reservation page below) to capture the actual commitment.
4. Email link to beta cohort.
5. After 7 days, export the sheet and run analysis.

### Option 2 — Tally / Typeform (paid, prettier, ~15 minutes)

Same structure. Tally is free up to 100 responses; Typeform is paid.

### Option 3 — Conjoint.ly (paid, automated PSM analysis)

Built-in PSM template. Conjointly.com pricing is per-survey. Worth it if running pricing tests recurrently; overkill for a one-shot validation.

### Free analytical path

Once the responses are in a CSV:

```r
# install.packages("pricesensitivitymeter")
library(pricesensitivitymeter)

df <- read.csv("wtp-responses.csv")
psm <- psm_analysis(
  toocheap = df$too_cheap,    # add Q for full 4-question PSM
  cheap    = df$bargain,       # if you ran them
  expensive = df$expensive,
  tooexpensive = df$walkaway
)
summary(psm)
plot(psm)
```

The R package gives you OPP (Optimal Price Point), IPP (Indifference), and the full curves. Free, takes 10 lines of code. For the 2-question version, just compute Q1 median + IQR and Q2/Q1 ratio manually — no library needed.

---

## Reservation page spec

The HTML page at [`landing/founding-member.html`](../../landing/founding-member.html) is the public face of the Q3 commitment capture. It:

- Frames the founding-member offer at $7.99/mo
- Asks the 3 PSM questions inline
- Captures email + price answers via the GetWaitlist API (waitlist 32856) with `referral_link` carrying a `founding_member` tag for downstream segmentation
- Looks unmistakably HeyTelli (cream + plum + coral; mark; serif headline)

**For the production version (when Stripe is wired):** swap the GetWaitlist submit for a Stripe Checkout session with `mode: 'setup'` and a `metadata.tier = 'founding_member'` field. Card-capture rate then becomes the true behavioral signal. Until then, the GetWaitlist proxy is acceptable for v1 (it captures *strong* intent, but stops short of card commit).

---

## Timeline checklist

- [ ] **Day 0** — write the email (use the verbatim copy above), set up Google Form or deploy the HTML page.
- [ ] **Day 1** — send to beta cohort.
- [ ] **Day 1** — start a small Meta or TikTok ad spend ($50–100) driving cold traffic to `heytelli.com/founding-member.html`. Target: women 25–35 in the US who follow dating-app and women's-safety pages.
- [ ] **Day 1–7** — collect responses; do not act on partial data.
- [ ] **Day 7** — close the survey, export to CSV, run the analysis above.
- [ ] **Day 8** — apply the decision rules. Document the call in `docs/monetization-thesis.md` as a "validation result" appendix.
- [ ] **Day 8+** — if rules say ship $9.99: build the paywall. If rules say repositioning needed: refer to Part 10 (alternatives) of the monetization thesis.

---

## What this is *not*

- Not a substitute for in-product paywall A/B testing post-launch. PSM gives a defensible *anchor*; real conversion data refines it.
- Not statistical at n<100. Treat the 50-user reading as directional only.
- Not the only signal. Combine with qualitative interviews (5–8 beta users on a Zoom each), churn analysis, and the in-app feedback already flowing through Codex's improvement pipeline.
