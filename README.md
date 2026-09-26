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

**Sui** is a Move chain. The same facility is ported to Move - and the part
the Hedera rail of Float - the ETHOnline project Lifeline grew out of - did
with scheduled transfers, a repayment parked *before*
the money is spent, is rebuilt from Sui objects.

```
                     World ID  ─── one human, one credit line
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
  ┌───────────────────┐      ┌──────────────────────────┐
  │ Arc testnet       │      │ Sui                      │
  │ FloatCredit-      │      │ float::facility          │
  │ Facility.sol      │      │ float::obligation (Move) │
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

## The Sui port

`sui/float` is `contracts/src/FloatCreditFacility.sol` in Move, plus what the
Hedera rail proved on testnet, rebuilt for a chain with no scheduler.

| Float on Arc / Hedera | Lifeline on Sui |
|---|---|
| `onlyOwner` | `AdminCap` - hold it to underwrite; transfer it to change owner |
| profiles, limits, agent auth, batched drawdowns, `repayWithToken`, `markDefault`, `withdraw` | `float::facility`, same rules, same exploit tests |
| drawdown records debt; money moves off-chain via Gateway | `obligation::draw` takes coins out of the facility **in the transaction that books the debt** |
| HIP-423 schedule: borrower signs a dated transfer before the spend | `obligation::park`: the agent signs a dated claim on its `Purse` before it can draw |
| consensus executes the schedule unattended | `obligation::collect` is open to anyone once due - no capability, same outcome for a stranger as for Lifeline |
| empty account at expiry: `INSUFFICIENT_TOKEN_BALANCE`, nothing moves | purse short at the due date: `RepaymentDefaulted`, nothing moves, the debt keeps consuming the line |
| tranche: one schedule for many payments, **collects the ceiling** | one obligation for many draws, **collects what was drawn** |
| repay early by deleting the schedule | `obligation::settle`; also cures a default |
| Blocky402 pays fees | Lifeline's operator sponsors every agent transaction |
| — | while a pledge is outstanding, the purse will not release the coins covering it |

Sui runs nothing on its own, so collection needs a caller. Lifeline's
reconciliation is that caller (`npm run sui:reconcile` for a cron), but the
function needs no permission: if Lifeline disappeared, anyone could still collect.

The pledge lock covers what arrives in the purse. An agent that routes its
earnings elsewhere can still leave its purse short - the same honest limit as a
Hedera account that is emptied before its schedule runs, and it ends the same
way: a default anyone can read on chain.

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

## The payment flow

1. An agent requests a metered resource and gets `402` with the requirements in
   `PAYMENT-REQUIRED`: amount, asset, `payTo`, network.
2. Its own balance is read. Enough, and it pays for itself and owes nothing.
3. Short, and Lifeline checks the human's remaining headroom across both rails,
   and any mandate cap. Over it, the request is refused before anything moves.
4. **Arc:** the drawdown is booked (batched on chain) and Lifeline's Gateway
   balance settles with the seller.
   **Sui:** if the agent has no open obligation with room, it parks one first.
   Then one sponsored transaction draws the shortfall, tops it up from the
   agent's own coins, and pays the seller. The seller simulates it, checks it
   pays the quoted amount, submits it, and only then serves the resource.
5. The payment is on the trail; the debt is on the human's line.

## Layout

```text
contracts/      Foundry: FloatCreditFacility for Arc, tests, deploy scripts
sui/float/      Move package: facility, obligation, fusd (demo coin), tests
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
npm run e2e:sui               # the Sui rail through the app
npm run sui:lifecycle         # both endings of a parked repayment, on chain
```

| suite | what it proves |
|---|---|
| `forge test` (23) | the facility's rules, and every exploit it was hardened against |
| `sui move test` (58) | the same suite in Move, plus parking, tranches, collection, default, cure, the pledge lock, and no double collection |
| web tests (18) | signed sessions, forged and expired cookies, query-string identity refused, single-use repayment receipts |
| Sui library (8) | x402 header handling, network selection, one key on both rails, the settler refusing junk offline |
| `e2e:arc` (19) | provision, direct draw, over-limit refusal, three x402 purchases (self-paid and on credit), forged and unsigned payments refused, repayment booked on chain |
| `e2e:sui` (20) | credit on Sui, Arc refusing what Sui drew, mandate caps, isolation between humans, early settlement, self-pay, reconcile |
| `sui:lifecycle` (18) | the Hedera lifecycle on Sui: an earner repaid and an idler defaulted by a stranger's `collect`, then the default cured; replay, underpayment and forgery refused |

World ID cannot be scripted - it needs a phone - so the end-to-end harnesses
stand in for exactly one step: they provision the human's profile as the verify
route does and mint the same signed session cookie. Everything after that is the
app's HTTP API and real transactions.

## Deployed

| | |
|---|---|
| Arc `FloatCreditFacility` | [`0xe382723bE95cB5c8801270a03Da17Bf4c27F320f`](https://testnet.arcscan.app/address/0xe382723bE95cB5c8801270a03Da17Bf4c27F320f), block 64024661 |
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
