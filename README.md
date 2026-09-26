# Lifeline

> An undercollateralised credit line for autonomous agents - on Arc and on Sui -
> where every agent's payments read like a heartbeat.

An agent can hold money. Only a human can hold debt.

Lifeline extends a USDC credit line to a human, verified once by World ID, and lets
their agents spend against it. When an agent hits a paywall it cannot afford,
Lifeline pays on its behalf and records what is owed. The agent keeps working; the
human carries the liability, which is the only way undercollateralised credit
can work when agents are free to create.

---

## One line, two rails

**Arc** is an EVM chain where USDC is the native currency. The credit facility
is a Solidity contract; x402 payments settle through Circle Gateway.

**Sui** is a Move chain. The same facility, in Move - plus a repayment the
agent parks *before* the money is spent, built from Sui objects so it can be
collected on its date without anyone having to be trusted to do it.

```
                     World ID  ─── one human, one credit line
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
  ┌───────────────────┐      ┌──────────────────────────┐
  │ Arc testnet       │      │ Sui                      │
  │ LifelineCredit-   │      │ lifeline::facility       │
  │ Facility.sol      │      │ lifeline::obligation     │
  │                   │      │                          │
  │ x402 via Circle   │      │ x402 exact scheme,       │
  │ Gateway batching  │      │ gas sponsored by Lifeline│
  │                   │      │ repayment parked first,  │
  │                   │      │ collected by anyone      │
  └─────────┬─────────┘      └────────────┬─────────────┘
            └──────────── one limit ──────┘
```

Both rails spend the **same** limit. A Sui draw is recorded against the human
in `railDebt` and counted by the same headroom check Arc uses, so the line
cannot be drawn twice - Arc refuses to lend what Sui already drew, and the
reverse.

One key is one agent on both rails: an agent's secp256k1 key is its Arc
address and, unchanged, its Sui address. The agent that borrows is the agent
that signs its own repayment, on either rail.

## On Sui

`sui/lifeline` is `contracts/src/LifelineCreditFacility.sol` in Move, plus the
part of credit that is usually weakest: getting paid back. A promise to repay
"on the 30th" is normally a keeper bot with a hot key, or an allowance the
borrower can revoke the moment the goods arrive. Sui has no scheduled
transactions, so the promise is made of objects instead.

| | Arc (Solidity) | Sui (Move) |
|---|---|---|
| underwriter | `onlyOwner` | `AdminCap` - hold it to underwrite; transfer it to change owner |
| the ledger | profiles, limits, agent auth, batched drawdowns, `repayWithToken`, `markDefault`, `withdraw` | `lifeline::facility`, same rules, same exploit tests |
| a drawdown | records debt; the money moves through Circle Gateway | `obligation::draw` takes coins out of the facility **in the transaction that books the debt** |
| the promise to repay | - | `obligation::park`: the agent signs a dated claim on its `Purse` before it can draw |
| collection | the operator books a repayment | `obligation::collect` is open to anyone once due - no capability, the same outcome for a stranger as for Lifeline |
| a default | - | the purse is short at the due date: `RepaymentDefaulted`, nothing moves, the debt keeps consuming the line |
| many payments | batched into one drawdown row | one obligation is a tranche that **collects what was drawn**, never its ceiling |
| repaying early | `repayWithToken` | `obligation::settle`; also cures a default |
| fees | paid by Lifeline's Gateway balance | Lifeline's operator sponsors every agent transaction |
| earnings | - | while a pledge is outstanding, the purse will not release the coins covering it |

Sui runs nothing on its own, so collection needs a caller. Lifeline's
reconciliation is that caller (`npm run sui:reconcile` for a cron), but the
function needs no permission: if Lifeline disappeared, anyone could still collect.

The pledge lock covers what arrives in the purse. An agent that routes its
earnings elsewhere can still leave its purse short - and it ends the way every
default here does: in plain sight, on chain, for anyone to read.

## Reading the monitor

The dashboard is an instrument, not a report. Each agent is a **lead**; each
x402 payment it makes is a **beat**, placed when it settled, its height the
amount on a log scale. A beat drawn in ink the agent paid for itself; a beat in
red Lifeline lent for. Between payments the line is flat, and an agent that has
never bought anything flatlines. A Sui repayment that fell due and collected
nothing is drawn as **fibrillation** at its due date.

The two rails are two instruments. **Arc** is the printed strip: warm chart
paper with a millimetre grid, ink, the pen resting at "now". **Sui** is the
bedside monitor: the same strip after dark, the trace lit, an erase bar
sweeping it - because Sui's argument is a repayment that waits on chain for its
date with nobody watching.

Type is Newsreader for words, Martian Mono for every figure, Hanken Grotesk for
the rest. Red is reserved for money that was lent; nothing else on the page is
that colour.

## In World App

Lifeline also runs as a World mini app, at `/mini`: the same line, agents and
rails as the dashboard - one state, shared between the two - laid out the way
World's design guidelines ask. A tab bar (Pulse, Owed, Tape, Record), sheets
that rise from the bottom, the purchase anchored above the tabs, the user's
World username instead of an address, and a haptic tap when money moves.

Sign-in follows World's guidance that World ID is not a login:

- **The wallet is the login.** MiniKit's Sign-In with Ethereum, one tap, every
  visit, verified server-side against a nonce this server issued. A linked
  wallet goes straight in.
- **World ID proves uniqueness once, to join.** A World ID 4 uniqueness proof
  can be made once per person per action - that is what makes it proof of one
  human, and no portal setting changes it. Its nullifier becomes the human's
  identity and their one credit line.
- **Sessions bring them back.** In the same sitting a World ID *session* is
  created and saved to the human. Every later sign-in proves that session - as
  often as needed, no action, no limit - with each proof accepted once.

| who | how they get in |
|---|---|
| new, anywhere | uniqueness proof, then a session is saved |
| back, same browser | the browser remembers the account; prove its session |
| back, another browser | "Sign in from World App": scan, approve on the phone |
| joined in a browser, first time in World App | dashboard's "Open in World App" link; the phone proves the saved session and its wallet is linked |
| joined before sessions existed | the dashboard asks, once, to save one |

Code: [`WorldAuthGate.tsx`](web/src/components/WorldAuthGate.tsx),
[`mini/MiniGate.tsx`](web/src/components/mini/MiniGate.tsx),
[`api/auth/world-session`](web/src/app/api/auth/world-session/route.ts),
[`lib/worldSessions.ts`](web/src/lib/worldSessions.ts),
[`api/auth/pair`](web/src/app/api/auth/pair/route.ts).

To try it on a phone, expose the app over HTTPS (`ngrok http 3000`), set the
mini app URL in the World Developer Portal to `https://<tunnel>` (the root
serves the mini app inside World App; `/mini` works too), and open
`https://world.org/mini-app?app_id=<your app id>`. Set `NEXT_PUBLIC_MINIAPP_ID`
if the mini app is a different Developer Portal app from the World ID one.

## The payment flow

1. An agent requests a metered resource and gets `402` with the requirements in
   `PAYMENT-REQUIRED`: amount, asset, `payTo`, network.
2. Its own balance is read. Enough, and it pays for itself and owes nothing.
   **Arc:** either way, nothing is signed until Intercepta has screened it (below).
3. Short, and Lifeline checks the human's remaining headroom across both rails,
   and any mandate cap. Over it, the request is refused before anything moves.
4. **Arc:** the drawdown is booked (batched on chain) and Lifeline's Gateway
   balance settles with the seller.
   **Sui:** if the agent has no open obligation with room, it parks one first.
   Then one sponsored transaction draws the shortfall, tops it up from the
   agent's own coins, and pays the seller. The seller simulates it, checks it
   pays the quoted amount, submits it, and only then serves the resource.
5. The payment is on the trail; the debt is on the human's line.

## Screening with Intercepta (Arc)

Every Arc payment is screened by [Intercepta](https://intercepta.io) before it
is signed, and every payer is screened before a seller settles. Arc is not a
chain Intercepta scores, but an EVM address is the same address on every
chain, so payees and payers are screened against its mainnet data. Arc only;
Sui addresses are not EVM addresses.

**Paying agent** - before the agent (or Lifeline, lending to it) signs:

| check | Intercepta call | where |
|---|---|---|
| the payee (`payTo`) | Deep Scan Address `GET /api/public/v2/extension/account/{address}/toxic-score` | [`web/src/lib/intercepta.ts`](web/src/lib/intercepta.ts) `screenOutgoing` |
| the asset: Arc's USDC, not a lookalike | allowlist; anything else refused, with Scan Token `GET .../token-intelligence/token/{address}/risks` saying what it is | `screenToken` |
| the authorisation itself | Scan Message `POST /api/public/v2/extension/analysis/signature`, sent the exact EIP-712 `TransferWithAuthorization` about to be signed | `screenAuthorization` |

The authorisation is built, screened and signed in one place,
[`web/src/lib/lifelineSigner.ts`](web/src/lib/lifelineSigner.ts)
(`screenAndSign`), so what Intercepta reads is byte for byte what gets signed.
The verdict decides what happens:

| verdict | when | what happens |
|---|---|---|
| **pay** | no known risk, amount within `INTERCEPTA_AUTO_APPROVE_USD` ($2) | signed and settled |
| **cap** | warning signs (mixer or sanctioned-counterparty exposure, a middling score) | paid only up to `INTERCEPTA_ELEVATED_CAP_USD` ($0.25) a payment |
| **hold** | over the cap, or Intercepta did not answer | nothing signed; the human approves or declines ([`api/pay/holds`](web/src/app/api/pay/holds/[holdId]/route.ts)). Approving screens again, and a refusal still refuses |
| **refuse** | sanctions, known scammer, stolen funds, phishing, a lookalike asset, a drainer authorisation | nothing signed, reason shown |

No key, or no answer, is never a pass. Refusals and holds go on the payment
trail with their reasons; the verdict is on every receipt
([`Verdict.tsx`](web/src/components/Verdict.tsx)).

**Paid service** - before settling, the payer named in the authorisation gets
Quick Scan Address (`GET .../account/{address}/quick-scan`, the low-latency
one). A flagged payer is refused with the reason, before Circle is asked to
verify anything:
[`web/src/lib/x402Gateway.ts`](web/src/lib/x402Gateway.ts) `requirePayment`
for the app's sellers, and an `onBeforeVerify` hook in
[`premium-api/server.ts`](premium-api/server.ts) for the Express one.

**Counterparty profiles** - the dashboard's Counterparties panel
([`Counterparties.tsx`](web/src/components/Counterparties.tsx)) lists every
payee with its last verdict, and any payment held for you. Open one, or paste
any address, for the full profile from
[`api/risk/profile`](web/src/app/api/risk/profile/route.ts): deep and quick
scores, each trait with its description, and Summarize Address
(`GET /api/public/v1/extension/security/{address}/overview`) for who it is.

**Seeing it** - `npm run e2e:intercepta`, live against the API and Arc
testnet: a clean seller cleared and paid; the "Unvetted feed" seller, whose
payee is a known scammer's wallet from Intercepta's test list (score 100), refused before
signing; a $5 dossier held and declined; and both sellers turning away a
flagged payer. In the dashboard, buy the Alpha signal, then the Unvetted feed.

**Feedback on the API**

- Time to first call: minutes. One header, and the address scans answered at
  once (the first cold call took ~5s, then 0.4-1.3s).
- What confused us: Scan Message is documented as taking the EIP-712 data as a
  JSON *string*. Sent that way it is not parsed and comes back `riskGroup: Low`
  with nothing read, a silent false negative. Sent as an *object* it reads the
  authorisation and flags the payee `KNOWN_MALICIOUS`, High. We now treat an
  unparsed answer as no answer.
- Also undocumented: `chainId` must be a string (`"8453"`), per-address
  `detectors` are bare codes rather than `{code, description}`, and the scale
  of `toxicScore` and of a trait's `risk` (they look like 0-100).
- What was missing: Arc. Its chain id is not in any enum, so addresses are
  screened on mainnet data and the Gateway authorisation under Base's id. A
  batch address scan would also help a seller screening many payers.

## Repaying by Apple Pay, Google Pay or card (Arc)

Arc debt can be repaid by the agent from its own wallet, or by the human in
dollars - Apple Pay, Google Pay or card, through Stripe. The repay sheet offers
both.

1. The server creates a Stripe payment for what the human owes (never more;
   paying it all rounds up to the cent; Stripe's floor is $0.50) -
   [`api/repay/card`](web/src/app/api/repay/card/route.ts).
2. Apple Pay and Google Pay appear where the device offers them (Stripe's
   Express Checkout Element), a card form always -
   [`CardRepay.tsx`](web/src/components/CardRepay.tsx).
3. Once paid, the server asks Stripe - it does not take the browser's word -
   and books the repayment on the Arc facility with `recordRepayment`, the same
   booking any repayment gets
   ([`lib/cardRepay.ts`](web/src/lib/cardRepay.ts),
   [`lib/repayCore.ts`](web/src/lib/repayCore.ts)). The browser's confirmation
   and Stripe's signed webhook
   ([`api/repay/card/webhook`](web/src/app/api/repay/card/webhook/route.ts))
   can both arrive; each payment is booked once.
4. Anything paid over what is owed by then is refunded to the card.

The money reaches Lifeline as dollars in its Stripe account, not as USDC on
chain; Lifeline books the repayment, and that booking is on chain. This is how
a lender takes card repayments. On a mainnet, an onramp (MoonPay, Coinbase,
Stripe's) could deliver USDC straight to the facility instead - none delivers
testnet USDC.

Test mode: card `4242 4242 4242 4242`, any future date, any CVC. Google Pay
works in Chrome with a saved card; Apple Pay needs Safari and a domain
registered with Stripe (Settings → Payment method domains - add the ngrok
host).

## Layout

```text
contracts/      Foundry: LifelineCreditFacility for Arc, tests, deploy scripts
sui/lifeline/      Move package: facility, obligation, fusd (demo coin), tests
sui/src/        @lifeline/sui: Move client, x402 on Sui, the payer, reconcile
sui/service/    the Sui x402 feed, metered per record
sui/scripts/    deploy, lifecycle (both endings on chain), reconcile
web/            Next.js: dashboard, World ID, agent APIs, both rails
premium-api/    Arc x402 resources, priced $0.01 / $1 / $5
scripts/        operator tools: fund Gateway, read balances on both rails
```

## Setup

```bash
npm install
cp .env.example .env          # World, Arc, Sui, session secrets
cd contracts && forge install foundry-rs/forge-std && cd ..
```

**Arc.** Set `PRIVATE_KEY` to a funded Arc testnet key (claim USDC at
[faucet.circle.com](https://faucet.circle.com)), then either use the facility
already deployed for this repo or deploy your own:

```bash
npm run deploy:arc            # writes the address to stdout
npm run deposit               # fund Lifeline's Circle Gateway balance
```

**Sui.** Needs the [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)
(`brew install sui`) to compile the package.

```bash
SUI_NETWORK=testnet npm run sui:deploy
```

This publishes the package, opens a `Facility<FUSD>` with the operator holding
its `AdminCap`, funds it with 500 demo dollars and writes
`sui/deployments/testnet.json`. With no `SUI_PRIVATE_KEY` it generates one and
prints it; on testnet the operator needs about 1 SUI for gas (from
[faucet.sui.io](https://faucet.sui.io)). For local work, `sui start
--with-faucet --force-regenesis` and `SUI_NETWORK=localnet`.

The facility is generic over its coin: set `SUI_COIN_TYPE` to Circle's testnet
USDC to lend the real thing. The demo dollar exists because testnet USDC comes
from a faucet with a captcha, which no script can pass.

Then run the pieces you need:

```bash
npm run dev                   # app on :3000
npm run premium               # Arc x402 resources on :4402
npm run sui:service           # Sui x402 feed on :4031
```

## Testing

```bash
npm test                      # Foundry, Move, web and Sui library suites
npm run typecheck             # every TypeScript tree
npm run lint

npm run e2e:arc               # the Arc rail through the app, on Arc testnet
npm run e2e:arc-edges         # every way Arc money can go wrong, on Arc testnet
npm run e2e:sui               # the Sui rail through the app
npm run e2e:intercepta        # screening, live: cleared, refused, held, approved
npm run e2e:card              # repaying by card, live: Stripe test mode, booked on Arc
npm run sui:lifecycle         # both endings of a parked repayment, on chain
```

| suite | what it proves |
|---|---|
| `forge test` (23) | the facility's rules, and every exploit it was hardened against |
| `sui move test` (58) | the same suite in Move, plus parking, tranches, collection, default, cure, the pledge lock, and no double collection |
| web tests (58) | signed sessions, forged and expired cookies, query-string identity refused, single-use repayment receipts, Sui debt scoped to its deployment, wallet sign-in and linking, Intercepta's verdict policy (pay, cap, hold, refuse, fail closed) and holds, World ID session sign-in (binding, replay, links, browser pairing), card repayment (who can pay, amounts, refunds, booked once) |
| Sui library (8) | x402 header handling, network selection, one key on both rails, the settler refusing junk offline |
| `e2e:arc` (19) | provision, direct draw, over-limit refusal, three x402 purchases (self-paid and on credit), forged and unsigned payments refused, repayment booked on chain |
| `e2e:arc-edges` (49) | no balance, some balance and enough; agent, mandate and line caps on purchases and draws; repaying with too little, in part, too much; receipts that are real, reused, misdirected, short or made up; a sibling's pending debt settled before a repayment; the app's ledger checked against the contract after every movement |
| `e2e:intercepta` (17) | live against Intercepta and Arc testnet: a clean seller cleared and settled, a known scammer's payee refused before signing (by the address and the authorisation scans both), a $5 purchase held, declined, and held again and approved, and both sellers turning away a flagged payer |
| `e2e:sui` (20) | credit on Sui, Arc refusing what Sui drew, mandate caps, isolation between humans, early settlement, self-pay, reconcile |
| `sui:lifecycle` (18) | both endings on chain: an earner repaid and an idler defaulted by a stranger's `collect`, then the default cured; replay, underpayment and forgery refused |

World ID cannot be scripted - it needs a phone - so the end-to-end harnesses
stand in for exactly one step: they provision the human's profile as the verify
route does and mint the same signed session cookie. Everything after that is the
app's HTTP API and real transactions.

## Deployed

| | |
|---|---|
| Arc `LifelineCreditFacility` | [`0xd25Fd339E08aad2534dA99B3A02dEec6EC1A818f`](https://testnet.arcscan.app/address/0xd25Fd339E08aad2534dA99B3A02dEec6EC1A818f), block 64053316 |
| Arc USDC | `0x3600000000000000000000000000000000000000` (native, 6-decimal ERC-20 interface) |
| Sui testnet package | [`0x14e7136b…`](https://suiscan.xyz/testnet/object/0x14e7136be665fbf7b839cde7fbb7ef2d3d46fafe35aac957aa01dbc707188e91), tx [`5spRKM7U37…`](https://suiscan.xyz/testnet/tx/5spRKM7U37KcxpXybiVKbWcm2RbykqYtPw1snYA6PvUL) |
| Sui testnet `Facility<FUSD>` | [`0x9ab70797…`](https://suiscan.xyz/testnet/object/0x9ab70797320978608fce71b115d088e2d67c68d4eaf2941b5cbf382ed94e5cea), 500 FUSD liquidity |
| Sui devnet | also deployed; see `sui/deployments/devnet.json` (devnet is wiped periodically) |

Every id is in `sui/deployments/<network>.json`.

On testnet, `sui:lifecycle` passes 18/18 - the earner's obligation collected
by a stranger in
[`8221agWL…`](https://suiscan.xyz/testnet/tx/8221agWL1vqYysTnWXLUqdHpbYAmRcChpprq5LyZtrL4),
the idler's default recorded in
[`Gy9Apwq5…`](https://suiscan.xyz/testnet/tx/Gy9Apwq5Qf7s9giAGNfirnoHTpGFo9VoWZR5owhAwgMt)
with nothing moved - and `e2e:sui` passes 20/20 through the app.

## Security notes

- Sessions are a signed, httpOnly cookie minted only by a verified World proof.
  Every spending route reads the human from it - never from a request body or
  query string.
- A mandate (`POST /api/agent-token`) is a card: it spends up to its cap and
  cannot register agents, issue mandates, settle or reconcile.
- x402 sellers on both rails verify against the requirements they quoted, never
  the ones the buyer echoes back, and a payment can be used once.
- An earlier revision of `web/src/app/api/auth/world-rp-context/route.ts`
  shipped a World RP signing key as a fallback. It is still in git history:
  rotate it in the World developer portal and set `WORLD_RP_SIGNING_KEY`.
