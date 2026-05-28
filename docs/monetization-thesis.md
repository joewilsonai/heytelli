# Monetization Thesis

> **Status:** Strategy artifact — viability assessment, research synthesis, and a defensible monetization hypothesis with numbers.
> **Audience:** Founder + future contributors (human + agent). Treat as a memo, not a feature spec.
> **Updates:** When WTP survey data lands, when pricing materially changes, or when a load-bearing assumption is invalidated.

This doc combines three things deliberately:
1. **A business-viability read** on HeyTelli as a venture, not just a product.
2. **A fact-checked research synthesis** of dating-safety monetization (5 parallel research agents, 2024–2025 data).
3. **A defensible monetization hypothesis** with concrete next-step deliverables.

## How this relates to other planning docs

- [`docs/heytelli-prd.md`](./heytelli-prd.md) — product positioning, non-negotiables, ethos. Every monetization choice below is constrained by this.
- [`docs/safety-roadmap.md`](./safety-roadmap.md) — feature build order. The Free-vs-Pro split below references its phases.
- [`docs/specs/wtp-survey-kit.md`](./specs/wtp-survey-kit.md) — the deployable validation kit to convert this hypothesis into evidence.
- [`landing/founding-member.html`](../landing/founding-member.html) — the deployable founding-member reservation surface for cold visitors.
- [`../upcoming_features.md`](../upcoming_features.md) — feature scope; relevant for which features land in free vs. Pro.

---

# Part 1 — Business viability assessment

## TL;DR

**Yes, conditionally.** Well-timed, well-positioned around a freshly-vacated market, technically credible founder execution. Three open questions decide whether it's a *business* vs. a great *product*: **monetization** (this doc), **distribution** (Date Cards viral loop, paid acquisition), and an **unresolved schema-vs-ethos contradiction** (the legacy `sexPotential / conversionAbility / chemistry` fields in `matches` — addressed by safety-roadmap Phase 0).

## Why "yes"

**1. Timing is unusually good.**
The single biggest women's-safety consumer app — **Tea** — collapsed catastrophically in **July 2025** (72K verification IDs + 1.1M private DMs leaked to 4chan, class actions pending; Apple pulled it October 2025). AWDTSG Facebook groups face defamation suits. Garbo wound down **August 2023**, leaving Tinder's flagship background-check gap. There is an **active vacuum** in "privacy-first women's dating safety," and the trust requirements are higher than they were six months ago. HeyTelli was designed for this constraint from day one.

**2. Demand signal is unambiguous.**
- Tea hit ~6–11M users before it broke.
- "Are We Dating The Same Guy?" Facebook chapters: 200+ cities, NYC alone with 110K+ members.
- 85% of women say apps should verify ID/photo recency/location ([TransUnion 2025](https://newsroom.transunion.com/more-than-eight-out-of-ten-dating-app-users-want-platforms-to-verify-age-recency-of-photos-and-location/)).
- >75% willing to undergo background checks ([YouGov](https://today.yougov.com/society/articles/36301-dating-apps-background-checks-safety-poll)).
- The "dating spreadsheet" category exists as a product category (Notion templates, the *Spread* iOS app) — the REMEMBER job, fully unowned.

**3. Category structure favors a new entrant.**
- **Vertical incumbents** (Tinder, Bumble, Hinge) own table-stakes safety inside their walled gardens but can't credibly cross over to "we don't rate people" — they *are* the rating model.
- **Horizontal incumbents** (Noonlight, bSafe, Life360) own panic/SOS but don't know dating context.
- **Niche players** (Tea, AWDTSG, Garbo) all imploded for different but instructive reasons.
- The intersection — *private, dating-context, women-first, equipping-not-judging* — is unowned.

**4. Founder execution is real.**
Demonstrated velocity through landing page, custom domain, app redesign work, Codex orchestration, Higgsfield/Vercel/Railway integration, beta auth schema, EAS-configured TestFlight pipeline, and an autonomous improvement worker hardening privacy in the background. Solo or near-solo founders rarely ship this stack this fast.

**5. Strategic moats are durable even if individual features are copyable.**
- **Privacy-first architecture** is hard to retrofit. Bumble cannot become "we don't rate people."
- **Her accumulated data** (her own patterns, her debrief history, her claim ledger) creates real lock-in over time.
- **"Not Tea, not AWDTSG" brand positioning** is currently a moat. In 18 months it'll be the category standard, but right now it's a wedge.

## Why caution

**1. Monetization is undefined and harder than it looks.** Addressed by Parts 2–4 of this doc.

**2. CAC isn't easy in this category.** Trust-sensitive products skew higher than typical lifestyle CAC. **Date Cards as the built-in viral surface** is the answer; lean into it before bolting paid acquisition on top.

**3. Apple risk is real.** Apple ships Find My + Check In. iOS 19/20 could extend toward "Dating Mode" — HeyTelli's iOS layer thins. CallKit policy could shift. Normal iOS-first risk, but worth pricing into runway.

**4. The schema contradiction is now a strategic problem.** The legacy score fields in `matches` directly contradict the brand promise on the landing page ("we never rate or judge anyone"). If a journalist, beta tester, or competitor surfaces this, the privacy moat dissolves overnight. **Phase 0 of the safety roadmap is reputation insurance, not engineering hygiene.**

**5. Solo-founder concentration risk.** Velocity is real but bus factor is one.

**6. Retention is the unsolved category problem.** Safety apps have historically been "downloaded for one date, forgotten until the next scary thing." HeyTelli's REMEMBER bet (cross-match pattern memory, voice debriefs, timeline) is a credible answer — turning safety into ongoing memory rather than one-off panic — but it's a bet, not a proven mechanic.

## The 4 highest-leverage de-risking moves

1. **Ship Phase 0 (schema deprecation) before any more marketing.** The contradiction is a public liability now.
2. **Validate WTP with the survey kit** (Part 4 below) before scaling beta.
3. **Wire viral acquisition into Date Cards immediately** — not later. Date Cards stay in free tier permanently.
4. **Lean hard on the "not Tea, not AWDTSG" position publicly.** Add an explicit "what happened with Tea and what we've done differently" page.

## Verdict

**HeyTelli is a good business idea conditional on (a) closing the schema contradiction fast, (b) cracking monetization with a clear hypothesis [this doc], and (c) finding one viral channel that doesn't require traditional CAC [Date Cards].** Market real, timing exceptional, founder execution credible, positioning both ethically clean and competitively differentiated.

It is **not** a good idea if (a) the goal is venture-scale growth without a clear path off-iOS, (b) the schema contradiction sits unfixed long enough to be flagged publicly, or (c) monetization gets pushed past 12 months without a hypothesis.

---

# Part 2 — Research findings

Five parallel research agents covered: dating-safety product pricing; affiliate + B2B partnership economics; safety-as-luxury monetization patterns; freemium + iOS subscription benchmarks; pre-launch WTP methodology. Citations inline.

## 2.1 Dating-safety product pricing landscape

**Tea (whisper network, *cautionary tale*).** Free download with verification gate, **~$15/mo** paid tier for phone lookups, background checks, reverse-image search. Peak reach 6–11M users, **ARR $1.6–2.4M**, $91K single-day record Aug 2025. Implied conversion ~**0.1–0.2%** of users. Apple-pulled Oct 2025 after the breach. *Free was the trap: thin revenue → underinvested infra → catastrophic failure.* ([Wikipedia](https://en.wikipedia.org/wiki/Tea_(app)), [Appfigures](https://appfigures.com/resources/insights/20250808), [NPR](https://www.npr.org/2025/08/02/nx-s1-5483886/tea-app-breach-hacked-whisper-networks))

**Noonlight.** Free safety button; **Instant Access $4.99/mo**; **Total Protection $9.99/mo**. Estimated ~$40K/mo revenue, ~6K downloads/mo — single-feature paywall doesn't pull conversion. B2B via Match Group equity investment Jan 2020 (not per-query SaaS). ([Noonlight pricing](https://help.noonlight.com/en/articles/3270559-how-much-does-noonlight-cost), [TechCrunch](https://techcrunch.com/2020/01/23/match-group-invests-in-noonlight-to-power-new-safety-features-in-tinder-and-other-dating-apps/))

**Garbo (wound down Aug 2023).** Charged **$2.50 + processing fee per search**. Tinder subsidized 2 free per user capped at 500K total. Match Group invested $1.5M in 2021. Partnership collapsed Aug 2023; CEO cited "internal disagreements with Match Group" and inability to extract enough platform compensation. Now operates as volunteer 501(c)(3). ([Tinder press, 2022](https://www.tinderpressroom.com/2022-03-09-Garbo-Launches-Background-Check-Platform-To-Public-and-On-Tinder), [TechCrunch wind-down](https://techcrunch.com/2023/08/17/match-groups-background-check-partner-garbo-ends-its-partnership/)) **Lesson: B2B2C with the risk-creating platform is structurally unstable.**

**PimEyes (face search).** Free tier: 5 daily blurred searches. Paid: **OPEN-PLUS $29.99**, **PROtect $39.99**, **PROtect Plus $79.98**, **PROtect Pro $139.99**, **Advanced $299.99/mo**. Opt-out is bundled in PROtect tiers. ([PimEyes pricing](https://pimeyes.com/en/premium))

**FaceCheck.ID.** Credit packs (not subscription): $6 / 12 searches → $597 / 3,333 searches. Switched to crypto-only payments late 2024 — **signals payment-processor risk** in the category. ([FaceCheck.ID](https://facecheck.id/))

**People-search aggregators (monthly subs):**
| Service | Price | Notes |
|---|---|---|
| BeenVerified | $32.89/mo | Unlimited reports |
| Spokeo | $13.95/mo ($7.95 quarterly) | Cheapest unlimited |
| TruthFinder | $23.28/mo | |
| Intelius | $19.95/mo or $0.95–$49.95/report | À-la-carte option |
| Social Catfish | $27.48/mo | + $397 single PI report option |

**Bumble / Tinder verification: free, table-stakes.** Tinder Face Check became **mandatory** for new US users in CA + 7 countries on Oct 22, 2025. Verification is no longer a revenue line.

**Trust ceiling: ~$30/mo for sub-style; users walk above.** Crisis-spend one-time options ($397 PI report) exist as a separate category. **Bundled / free verification path is winning** in the dating apps themselves.

## 2.2 Affiliate + B2B partnership economics

**NightCap affiliate.** Live via [FlexOffers](https://www.flexoffers.com/affiliate-programs/nightcap-scrunchie-affiliate-program/) and [direct](https://nightcapit.com/pages/affiliates). Published rate not retrievable without partner login. Sister DTC drink-safety brands typically pay **10–20% on $15–30 AOV** — roughly $1.50–6 per conversion.

**Amazon Associates** — Health & Personal Care **cut to 1%** April 2024 ([SEL](https://searchengineland.com/amazon-affiliate-commission-rates-cut-332966)). Routing safety SKUs through Amazon yields ~$0.15–0.30/unit — economically irrelevant.

**ShareASale / Refersion category averages** — health & fitness 15.9% (vs. 10.1% all-cat); women's-wellness DTC clusters 10–30%; Routine probiotics pays 40% on $68 AOV.

**B2B precedents:**
- **Tinder x Garbo:** $1.5M Match Group investment, $2.50/search, capped subsidy, ended Aug 2023.
- **POF x Noonlight:** equity + integration deal, not per-seat. Match Group took board seat Jan 2020.
- **Bumble:** builds, doesn't partner. Private Detector + Deception Detector both in-house; Private Detector open-sourced Oct 2022.
- **Match Group x RAINN:** advisory/consulting, not commercial; estimated low six figures grant + consulting fees.
- **Apple Check In:** **no third-party SDK** — Apple-only feature for iOS 17+ users. **Pure deep-link integration possible; no commercial path.**

**Net implication:** Direct-to-consumer subscription is the only structurally durable revenue path in dating safety. B2B as the *anchor* monetization is the Garbo graveyard. Affiliate is interesting marketing but not load-bearing revenue. **There is no commercial integration path with Apple Check In** — wrap it for free, monetize elsewhere.

## 2.3 Safety-as-luxury monetization — who got it right, who didn't

**Got it right:**
- **Proton** — freemium tiered, $3.99 → $9.99 → $23.99 family, bundled 5 products, **$97.5M ARR / 100M accounts** 2024. ([Proton pricing](https://proton.me/pricing))
- **1Password** — subscription-only, no free tier, $2.99–7.99/mo, **$400M+ ARR** late 2025, 75% B2B mix. Productivity framing dodges "safety should be free." ([CNBC](https://www.cnbc.com/2025/11/06/ryan-reynolds-backed-1password-tops-400-million-in-arr.html))
- **Bark** — parental safety **$14/mo or $99/yr**. Parents pay more for kids than for themselves.
- **Life360** — public; **$371M FY24 revenue**, ~2.3M paying Circles, **$7.99 / $14.99 / $24.99 triple-tier** drove +53% ARPPC in UK rollout. Cleanest category proof: **tiered pricing with a household-shared payer raises the ceiling dramatically.** ([SEC 10-K](https://www.sec.gov/Archives/edgar/data/0001581760/000158176025000008/lifx-20241231.htm))
- **Aura** — identity protection $12–32/mo with household bundling, ~50% YoY revenue growth 2024.

**Got it wrong:**
- **Citizen Protect** — $19.99/mo individual is **above the ceiling**, anxiety-driven funnel produced brand damage. ([Vice](https://www.vice.com/en/article/inside-crime-app-citizen-vigilante/))
- **Noonlight** — ~$40K/mo. Single-feature paywall fails.
- **Garbo** — wound down; B2B2C with platforms unwilling to pay.
- **Tea** — free trap → infrastructure under-investment → breach.
- **Signal** — donations only; $25.8M 2024 revenue vs ~$50M annual cost. Pure donations unsustainable below WhatsApp-founder scale.

**Six implications:**
1. Subscription > one-time. Every winner is recurring.
2. **Bundle past a single primitive.** Single-utility safety has a low ceiling, always.
3. Individual ceiling **~$10–15/mo**. Household ceiling **$25–32/mo**.
4. Free tier OK; ads are not.
5. Avoid fear marketing.
6. B2B2C with the risk-creating platform is structurally unstable.

## 2.4 Freemium + iOS subscription benchmarks

**Named-app conversion rates 2024:**
| App | Category | Conversion |
|---|---|---|
| Flo | Women's health | **~7.1% of MAU** |
| Bumble | Dating | ~4.6% of MAU, ARPPU $21.23 |
| Hinge | Dating | ~5.1%, RPP $28.96 |
| Tinder | Dating | 9.9M payers, RPP $16.68 |
| Life360 | Family safety | ~2.8% of MAU (Circles ≠ users) |

**RevenueCat 2025/26 benchmarks:**
- **Freemium Day-35 conversion: 2.1% median, 4.5% top quartile, range 0.3–8.2%**
- **Trial-to-paid: 37.3% median (2024), top quartile >60%**
- **Health & Fitness specifically: 39.9% trial-to-paid median, 68.3% top decile**
- **23% of conversions happen 6+ weeks post-install** — late converters matter
- **Revenue per install Day 60: freemium $0.38 vs hard paywall $3.09** — 8× gap

**Price elasticity:**
- **Median monthly subscription clusters at $9.99** across categories.
- Health & Fitness annual median **$39.94** (2026 data), drifted up from $29.65 in 2025 read.
- **Bumble Premium iOS: $24.99 → $39.99/mo by early 2026** (+12% YoY) — top of dating tolerates steep elasticity.
- **Hinge X: $49.99/mo** since 2023, payers +31% YoY — premium tiers work for high-intent slices.
- **$4.99 → $7.99 → $9.99 sweep:** lower wins +7pp conversion, higher wins **+10% ARPU and +12pp 90-day retention**. **Optimize retained revenue, not signup conversion.**
- **Stardust case study:** adding a free trial at a $24.99/yr anchor lifted paying-sub rate +252%, ARPU +408%. **Trial structure dominates headline price.**

## 2.5 WTP methodology — what works at n=50–200

**Van Westendorp PSM is the gold standard at low N.**

The four canonical questions (use verbatim — deviations bias the curves):
1. So expensive you would not consider buying it?
2. Expensive, but you'd still consider buying it?
3. A bargain — great value for the money?
4. So cheap you'd question its quality?

**Sample size:** 50 = directional only, 100+ = defensible, 200+ = academic-grade. Tools: Conjoint.ly, Qualtrics PSM block, SurveyMonkey PSM template; or Google Forms + R's `pricesensitivitymeter` package.

**Smoke test / fake pricing page** (Buffer pattern): live page with three tiers, real "Start free trial" CTA, ending in "we're launching soon — reserve your spot." Drive 500–2K visits at target ICP. **>10% click = strong demand; <5% = repricing or repositioning needed.**

**Direct WTP questions inflate by 30–300%** vs. real purchase behavior. De-biasing patches:
- **Cheap-talk preamble:** "Past studies show people overstate what they'd pay by ~2x. Knowing that, what would *you* actually pay?"
- **Commitment capture:** "Reserve your $X/mo founding-member plan — card on file, no charge until launch." **The card-capture rate is the only un-inflateable signal.**

---

# Part 3 — Recommended monetization hypothesis

## The bet, in one line

**$9.99/mo individual subscription (or $79.99/yr at ~33% discount), 7-day free trial, freemium with a thoughtfully-bounded free tier that always includes Date Cards. Target 3–5% Day-35 conversion. Stack a $24.99/mo Circle Plan as a Phase-2 household variant after individual pricing proves.**

## Why $9.99/mo — six independent anchors

| Source | Anchor | Implication |
|---|---|---|
| RevenueCat 2026 cross-category | Median monthly sub **$9.99** | Category floor for "this is a real product" |
| Health & Fitness category | Median annual **$39.94 / monthly $9.99** | Direct comparator |
| Life360 Gold | **$14.99/mo** sits in the safety ceiling | $14.99 is *household*; individual lower |
| Citizen Protect | $19.99/mo individual = **brand damage** | Above individual ceiling |
| Bark | **$14/mo or $99/yr** parental safety | Safety-as-membership works at this band |
| RevenueCat A/B sweep | $9.99 wins **+10% ARPU and +12pp retention** vs. $4.99 | Optimize retained revenue |

**$9.99 is the disciplined choice.** $7.99 would land more signups and less retained revenue. $14.99 would be above the individual-safety ceiling unless framed as Circle/household.

## The bundle is already the moat

The starkest finding: **every sustainable safety/privacy subscription bundles 2–3+ primitives. Every single-utility product died or stalled.**

Proton (5 products), 1Password (vault + 2FA + travel mode + fill), Life360 (location + crash + SOS + breach monitoring), Bark (monitoring + screen time + alerts + reports), Aura (identity + VPN + monitoring + family).

Noonlight (just panic), Citizen (just alerts), Garbo (just checks) — all died or stalled.

**HeyTelli already bundles: memory + clarity + safety + (planned) vetting + reflection chat + Date Cards.** That's unusually well-shaped from day one — an unfair head start.

---

# Part 4 — Free tier vs Pro tier design

The hardest design decision. Tea's failure mode was thin free-driven revenue → underinvested infra → breach. **Don't replicate it.** But too-strict free chokes the Date Card viral loop. The split below threads that needle.

## Free tier — must include

- **Date Cards** (always free — the viral surface dies behind a paywall, and charging women for safety info is brand-suicide)
- **One active connection** with full features (must feel the product work)
- **Trusted Circle local storage** (it's local-only; free is consistent with the privacy promise)
- **Apple Check In deep-link prompt** (free iOS primitive — wrapping it is free)
- **Basic match timeline + voice debrief** (the "smart friend who remembers" promise has to work in free to convert)

## Free tier — limits at

- Beyond 1 active connection → soft paywall
- Vet Packet runs limited to **1 free per connection** (reverse image, AI detection — real per-call API cost $0.05–0.20)
- **Cross-match pattern detector → Pro-only** (the more matches she's logged, the more value Pro delivers — natural conversion arc)
- **Story Check / Green Flags → free for first 30 days, then Pro** (LLM extraction = real per-call cost)
- Voice debrief storage beyond 30 days → Pro

## Pro tier — $9.99/mo or $79.99/yr

- Unlimited connections
- Unlimited Vet Packet runs
- Cross-match pattern detector
- Full Story Check + Green Flag detection across history
- Voice debrief permanent storage
- Apple Watch + Back Tap rescue-call triggers (Phase 4.12)
- Auto-escalating check-in (Phase 4.13)
- Panic / SOS (Phase 4.14)

## Circle Plan — $24.99/mo or $199/yr (Phase 2)

- Up to 5 individuals in a household / chosen-circle billing umbrella
- Mom / sister / best friend get their own HeyTelli accounts under one bill
- **Maintains PRD:** no shared *data*, just shared *billing*. Each person's matches/data still private to them.
- Modeled on Life360's family-shared-payer mechanic that drove +53% ARPPC

## Free vs Pro shape rationale

**The highest-friction-to-monetize features (Date Cards, Apple Check In) are free** — they're the acquisition engine. **The features with real per-call API costs** (Vet Packet, cross-match, Story Check, debrief storage) are gated. Free still solves the day-one safety/clarity need; **Pro becomes the obvious upgrade for anyone running 2+ matches concurrently or anyone wanting verification.**

## Alternatives considered and rejected

- **Free trial only, no free tier.** Rejected — kills viral Date Card mechanic immediately.
- **All-features-free, ad-supported.** Rejected — Tea's failure mode. Privacy product cannot be ad-funded.
- **Per-Vet-Packet pricing ($1–2/run).** Rejected — Garbo graveyard. User-pays metered safety doesn't sustain.
- **B2B partnership as anchor.** Rejected — Garbo + Match lesson. Opportunistic only.
- **Donation-based (Signal-style).** Rejected — Signal under-funds itself at $25.8M/yr; not viable below WhatsApp-founder scale.

---

# Part 5 — The 5 graveyard moves to avoid

Every one a real precedent:

1. **Per-query / metered pricing.** Garbo died at $2.50/search.
2. **Above-ceiling individual pricing ($19.99+).** Citizen brand-damaged itself.
3. **Single-feature paywalls.** Noonlight at $40K/mo monthly revenue is the warning.
4. **B2B2C with dating platforms as anchor revenue.** Match invested in Garbo + let it die. Bumble builds in-house. **Direct-to-consumer is the only durable path. Tinder/Bumble integration is opportunistic *only*.**
5. **Ad-supported / "free is the trap."** Tea's $200K/mo on 11M users meant infrastructure couldn't be funded; the breach was downstream. **A privacy-first product cannot be ad-funded.**

---

# Part 6 — Forecast (back-of-envelope)

Combining 4% Day-35 conversion (mid-pack, not heroic), $9.99/mo ARPU, blended 80% monthly retention (RevenueCat Health & Fitness median), k=0.3 Date Card viral factor.

| Period | Active free | Paid | MRR | ARR | Notes |
|---|---|---|---|---|---|
| End Y1 | 5,000 | 200 | $2K | ~$24K | Solo founder bootstrap |
| End Y2 | 20,000 | 800 | $8K | ~$96K | Date Card viral compounds |
| End Y3 | 80,000 | 3,200 | $32K | ~$384K | Approaching Tea's *floor* of revenue |

**Three observations:**

1. **Y1 ARR ($24K) is not enough to live on.** Plan runway accordingly, or raise strategic capital before Y1 end. The "right" capital here is angel from women-led VC + safety-aware founders, not generalist VC chasing growth metrics that this category can't deliver in Y1.

2. **The Date Card viral mechanic does the heavy lifting Y1→Y2.** If k=0.3 holds, growth is mostly self-funding by Y2. If k drops to 0.1, paid acquisition needs CAC ≤ $20 for 12-month payback at $9.99 ARPU net of Apple's 15%.

3. **You're not racing Tea's $1.6–2.4M peak.** Even Tea's peak meant 0.1–0.2% conversion. **Your bet is 4% × patient growth > 0.2% × viral growth.** The data supports this — the difference between a real subscription business and a breach-waiting-to-happen.

## Sensitivity analysis (what kills the forecast)

| Risk | Impact | Mitigation |
|---|---|---|
| Conversion < 2% Day-35 | ARR halves | Diagnose: onboarding, paywall placement, or product-market mismatch |
| Trial-to-paid < 30% | Funnel broken | Product problem, not pricing — investigate before repricing |
| Date Card k drops to 0.1 | CAC doubles | Need a second viral mechanism or higher paid CAC tolerance |
| Apple's CallKit policy shifts | Phase 4.12 cut | Don't make rescue call the *single* Pro value prop |
| Schema contradiction goes public | Brand damage, churn spike | Ship Phase 0 *now* |

---

# Part 7 — Risks specific to this monetization shape

- **Apple IAP take.** Apple takes 30% Y1, 15% Y2+ for subscriptions. Net ARPU at $9.99 is $6.99 Y1, $8.49 Y2+. The 12-month payback math above already reflects this.
- **"Should be free" objection on safety.** Mitigate by selling **memory + clarity** (the bundle) rather than safety alone. "HeyTelli is the smartest friend who remembers everything" lands differently than "HeyTelli's safety features cost $10/mo."
- **App Store review on CallKit rescue call.** Position as safety/extraction, not deception. Multiple safety-positioned fake-call apps live today — precedent exists.
- **Late converters need a re-engagement loop.** 23% of freemium conversions happen 6+ weeks post-install. Email or push at the 6-week mark surfacing cross-match insights from her logged data is the natural mechanic.

---

# Part 8 — Date Card viral mechanic integration

From the earlier Date Card analysis (k≈0.2–0.4 base case):

- Per active user/month: ~3 Date Cards sent, ~1 recipient each, 90% open rate, 8–15% recipient → signup conversion.
- **k=0.3 base case.** Effective blended CAC: $10 → ~$7.
- Y1 LTV at 80% monthly retention: ~$35. **LTV/CAC ~5×. Healthy.**
- **The math only works if Date Cards stay free.** Paywalling them collapses k toward 0, doubles CAC, kills the ratio. **Free Date Cards is not a charity decision — it is the most important pricing decision.**

---

# Part 9 — Next moves (concrete, ordered)

1. **Run the 3-question WTP survey** ([`docs/specs/wtp-survey-kit.md`](./specs/wtp-survey-kit.md)) on the existing beta cohort this week. 1 day to build, 7 days to collect.
2. **Deploy the founding-member reservation page** ([`landing/founding-member.html`](../landing/founding-member.html)) for cold visitors. Drive a small Meta/TikTok ad spend at the target ICP to measure cold-traffic intent.
3. **Ship safety-roadmap Phase 0 (schema deprecation) before any paywall design.** The ethos cleanup precedes the paywall conversation publicly.
4. **Design the paywall UX** with the "after 1st connection" gate, not feature-by-feature paywalls. Feature-by-feature is the Noonlight failure mode.
5. **Hold off on Circle Plan ($24.99) until 500+ paid users on Pro.** Premature household pricing is a distraction.

---

# Part 10 — Open alternatives (in case the hypothesis breaks)

If the survey says the hypothesis is wrong, here are the alternative paths in priority order:

**Alternative A — $7.99 individual / $59.99 annual.** If median Q1 (PSM "expensive but worth it") clusters under $9 and card-capture at $7.99 hits ≥8%, ship lower and aim for top-quartile conversion (4.5%+) to compensate.

**Alternative B — Productivity framing, no free tier (1Password model).** If "safety should be free" is the dominant objection in the survey, reposition to **memory/clarity ("the smartest friend who remembers")** and drop the free tier entirely. $7.99/mo, 14-day free trial only. Higher trial-to-paid expected (Bumble pattern), lower top-of-funnel.

**Alternative C — Household-first.** If individual conversion stalls but family/circle interest is strong, lead with the $24.99 Circle Plan as the *primary* SKU. Life360's revenue base proves the lever; the founder skill ceiling is whether HeyTelli can credibly serve families (likely yes given Trusted Circle exists).

**Alternative D — Lifetime-deal founding-member.** $149 lifetime for first 1,000 users. Sustainable only if cohort cap is real and ARPU ≥ avg LTV; useful as runway-financing if cash is tight. Headspace and Calm both used founding-member anchors historically.

**What never to do** — even if WTP data suggests it:
- Per-query pricing (Garbo grave)
- Ad-funded free tier (Tea grave)
- Removing Date Cards from free (kills the viral loop)
- B2B with Match Group / Bumble as anchor revenue (Garbo grave)

---

# Source list

Compiled across 5 parallel research agents, 2024–2025 data. Detailed citations inline throughout Parts 2–4.

Key primary sources:
- RevenueCat State of Subscription Apps 2025 + 2026 reports
- Match Group SEC filings (8-K Nov 2024)
- Life360 SEC filings (10-K FY 2024)
- Bumble investor reports
- TechCrunch coverage of Tea breach, Garbo wind-down, Match-Noonlight investment
- NPR + TechPolicy.Press coverage of Tea breach
- Vercel App Store data via Appfigures, Sensor Tower
- Conjointly + 5 Circles + SurveyKing on PSM methodology
- Apple Developer documentation on TestFlight IAP testing
- ScienceDirect + Springer meta-analyses on stated-vs-revealed WTP

Full agent transcripts available in session artifacts.
