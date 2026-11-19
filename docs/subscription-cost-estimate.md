# Subscription model: cost and revenue estimate at scale

_Estimate prepared November 2026. Prices are AWS list prices (us-east-1, on-demand) and store terms as best known at the time. **Verify before relying on them**, in particular Cognito (its pricing was restructured recently), RevenueCat, and the Apple and Google fee programs. Use the AWS Pricing Calculator for a firm number._

## Summary

At **15,000 paying households (50,000 users)** and **$2/month per household**:

| | Per month |
|---|---|
| Gross revenue | $30,000 |
| Net after Apple/Google 15% fee | **~$25,500** |
| Operating cost (AWS + services) | **~$890** (plan for ~$1,200 with contingency) |
| Left before income tax, your time, support and marketing | **~$24,600** |

- The goal "cover operating costs plus 100%" is met at about **100 paying households** (about 330 users).
- Marginal cost of one more household is about **5-6 cents/month** against about **$1.70** net revenue.
- Cognito and RevenueCat are about three quarters of the cost. Compute and database together are under $100/month.
- Operating cost is not the risk. Acquiring, converting and retaining 15,000 paying households is.

## Model

Pricing model: **per household**. The household owner pays; members are free. There are no lists unless you belong to a household.

### Assumptions

| Assumption | Value |
|---|---|
| Users | 50,000 |
| Households (all paying; upper bound) | 15,000 (about 3.3 users each) |
| Daily active users | 20,000 (40%) |
| Monthly active users (MAU) | 37,500 (75%) |
| API requests per active user per day | ~30 (with offline sync and push) |
| API requests per month | ~20 million (the current 5-second polling design would be ~60 million) |
| Price | $2.00 (store price points are likely $1.99; immaterial) |

## Monthly operating cost

| Item | $/month | How it was calculated |
|---|---|---|
| API Gateway (HTTP API) | 20 | 20M requests x ~$1 per million |
| CloudFront | 12 | 20M requests, first 10M free, ~$1 per million after that. Data transfer (~60 GB) is inside the free 1 TB. |
| Lambda (API + authorizer) | 9 | API: 20M x 256 MB x ~50 ms. Authorizer: ~6M calls (results are cached 60 s). |
| DynamoDB (on-demand, PITR) | 18 | ~80M read units x $0.125/M + ~6M write units x $0.625/M + storage (<1 GB), rounded up for headroom |
| **Cognito** | **~410** | (37,500 MAU - 10,000 free) x $0.015 on the default "Essentials" tier. **~150** on "Lite" ($0.0055). |
| Email (SES) | 1 | ~5,000 verification / reset emails x $0.10 per 1,000 |
| Push notifications | 5 | Notifier Lambda, SQS / scheduler, SNS (or Expo push, which is free) |
| Logs and monitoring (CloudWatch) | 25 | ~10 GB log ingestion + metrics and alarms |
| Web application firewall (WAF) | 30 | Recommended once the app is public; optional at first |
| DNS, dev environment, developer accounts, crash tooling | ~85 | Route 53 zones, a small dev AWS account, Apple $99/yr + Google $25 once, error tracking |
| Subtotal | ~615 | |
| **RevenueCat** | **~275** | 1% of tracked revenue above $2,500/month: 1% x ($30,000 - $2,500) |
| **Total** | **~$890** | |

If the current 5-second polling design were kept, add about $110/month (API Gateway, CloudFront, Lambda, DynamoDB all scale with request count).

## Revenue

| | Per month |
|---|---|
| Gross: 15,000 x $2.00 | $30,000 |
| Store fee: 15% (Apple Small Business Program, Google subscriptions) | -$4,500 |
| **Net** | **$25,500** (~$1.70 per household) |

- Apple's 15% rate requires enrolling in the **Small Business Program**; otherwise it is 30% and net falls to about $21,000.
- In countries where displayed prices include VAT, net per household is lower. This is not modelled.
- Web subscriptions through Stripe cost about 2.9% + $0.30 (about 18% of $2) and leave tax handling to you. At $2, an annual plan reduces the fixed-fee share.

## Scenarios

| Scenario | Paying households | Gross | Net of store fee | Operating cost | Net / cost |
|---|---|---|---|---|---|
| Full (above) | 15,000 | $30,000 | $25,500 | ~$890 | ~28x |
| Half paying (rest in trial or lapsed) | 7,500 | $15,000 | $12,750 | ~$650 | ~20x |
| Break-even for "costs + 100%" | ~100 | $200 | $170 | ~$90 | ~2x |

At around 100 households the fixed costs (~$85/month) dominate; Cognito and RevenueCat are still free at that volume.

## Not included

- Your time, customer support and marketing / acquisition (the real cost).
- Trial users who never convert (they cost infrastructure but no revenue; small in absolute dollars).
- Legal, accounting and business setup; refunds and chargebacks; income tax.
- Foreign VAT effects on net revenue.

## Levers to reduce cost

- Cognito "Lite" tier (saves about $260/month at this scale).
- Skip the WAF until there is abuse to block.
- Replace polling with push-triggered sync (already planned for offline support).
- Reduce Lambda log volume.

## Decisions still open

- Free trial or freemium tier, and what happens to a household when payment lapses (read-only? grace period?).
- Whether members of a lapsed household lose access entirely.
- How account deletion interacts with an active subscription and with household ownership.
- Whether to also offer web checkout (Stripe) or sell through the app stores only.
