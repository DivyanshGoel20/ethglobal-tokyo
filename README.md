# Float

> An undercollateralised credit line for autonomous agents - on Arc and on Sui.

An agent can hold money. Only a human can hold debt.

Float extends a USDC credit line to a human, verified once by World ID, and lets
their agents spend against it. When an agent hits a paywall it cannot afford,
Float pays on its behalf and records what is owed. The agent keeps working; the
human carries the liability, which is the only way undercollateralised credit
can work when agents are free to create.

---

## One line, two rails

**Arc** is an EVM chain where USDC is the native currency. The credit facility
is a Solidity contract; x402 payments settle through Circle Gateway.

**Sui** is a Move chain. The same facility is ported to Move - and the part
Float's Hedera rail did with scheduled transfers, a repayment parked *before*
the money is spent, is rebuilt from Sui objects.

```
                     World ID  ─── one human, one credit line
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
  ┌───────────────────┐      ┌──────────────────────────┐
  │ Arc testnet       │      │ Sui                      │
  │ FloatCreditFacility│     │ float::facility          │
  │ (Solidity)        │      │ float::obligation (Move) │
  │                   │      │                          │
  │ x402 via Circle   │      │ x402 exact scheme,       │
  │ Gateway batching  │      │ gas sponsored by Float   │
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

| Float on Arc / Hedera | Float on Sui |
|---|---|
| `onlyOwner` | `AdminCap` - hold it to underwrite; transfer it to change owner |
| profiles, limits, agent auth, batched drawdowns, `repayWithToken`, `markDefault`, `withdraw` | `float::facility`, same rules, same exploit tests |
| drawdown records debt; money moves off-chain via Gateway | `obligation::draw` takes coins out of the facility **in the transaction that books the debt** |
| HIP-423 schedule: borrower signs a dated transfer before the spend | `obligation::park`: the agent signs a dated claim on its `Purse` before it can draw |
| consensus executes the schedule unattended | `obligation::collect` is open to anyone once due - no capability, same outcome for a stranger as for Float |
| empty account at expiry: `INSUFFICIENT_TOKEN_BALANCE`, nothing moves | purse short at the due date: `RepaymentDefaulted`, nothing moves, the debt keeps consuming the line |
| tranche: one schedule for many payments, **collects the ceiling** | one obligation for many draws, **collects what was drawn** |
| repay early by deleting the schedule | `obligation::settle`; also cures a default |
| Blocky402 pays fees | Float's operator sponsors every agent transaction |
| — | while a pledge is outstanding, the purse will not release the coins covering it |

Sui runs nothing on its own, so collection needs a caller. Float's
reconciliation is that caller (`npm run sui:reconcile` for a cron), but the
function needs no permission: if Float disappeared, anyone could still collect.

The pledge lock covers what arrives in the purse. An agent that routes its
earnings elsewhere can still leave its purse short - the same honest limit as a
Hedera account that is emptied before its schedule runs, and it ends the same
way: a default anyone can read on chain.

## The payment flow

1. An agent requests a metered resource and gets `402` with the requirements in
   `PAYMENT-REQUIRED`: amount, asset, `payTo`, network.
2. Its own balance is read. Enough, and it pays for itself and owes nothing.
3. Short, and Float checks the human's remaining headroom across both rails,
   and any mandate cap. Over it, the request is refused before anything moves.
4. **Arc:** the drawdown is booked (batched on chain) and Float's Gateway
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
sui/src/        @float/sui: Move client, x402 on Sui, the payer, reconcile
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
npm run deposit               # fund Float's Circle Gateway balance
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
| Sui | `sui/deployments/<network>.json` |

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
