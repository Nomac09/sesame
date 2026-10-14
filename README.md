# Sesame: ordering site for a delivery kitchen

Direct-ordering website for **Sesame**, a Palestinian delivery-only kitchen in the Lille area. Live at [sesamerestaurant.fr](https://sesamerestaurant.fr).

Customers order and pay online, choose delivery or collection in a time slot, and get confirmation emails; the kitchen manages orders from an admin area. Built to replace delivery-platform commissions with a direct channel.

> This public copy has legal identifiers, the address and contact details replaced with demo values. The production repository is private.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Data and auth | Supabase (Postgres, row-level security, SQL migrations) |
| Payments | Stripe Checkout and webhooks |
| Email | Resend (order confirmation, kitchen notification) |
| Validation | Zod |
| Animation | Framer Motion |
| Tests | Unit tests (tsx), integration tests against Supabase and Stripe test mode, SQL tests, Playwright E2E driven by accessible roles and names |
| Hosting | Vercel |

## What is worth looking at

- **Order lifecycle in the database.** Order status transitions are enforced in Postgres, not only in the UI, and covered by SQL tests (`supabase/tests/`).
- **Row-level security by design.** The browser client only reads what policies allow; the service-role client is confined to server code where no policy applies, and every use is commented with why.
- **Stripe webhooks.** Payment confirmation comes from the signed webhook, not from the redirect, so an order is never marked paid by a customer closing the tab at the right moment.
- **Delivery zones and opening hours as data** (`src/config/zones.ts`): two services a day, postcode-based zones, slot computation tested in `schedule.test.ts`.
- **Pricing and cart logic** tested on their own (`pricing.test.ts`, `cart.test.ts`).
- **French legal pages** (mentions légales, CGV, privacy, allergens) generated from a single typed config, including the VAT-exemption rule: under franchise en base, no VAT line is ever displayed.

## Running it

```bash
npm install
cp .env.local.example .env.local   # Supabase, Stripe test keys, Resend
npm run dev
npm test                           # unit tests
npm run test:e2e                   # Playwright
```

---

*Site de commande en direct pour une cuisine palestinienne en livraison à Bondues : Next.js, Supabase avec RLS, paiement Stripe et webhooks, emails Resend, tests unitaires, d'intégration, SQL et Playwright.*

Built by **Nasim Sawalma** · [GitHub](https://github.com/Nomac09) · [LinkedIn](https://www.linkedin.com/in/nasim-sawalma)
