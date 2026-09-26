/// A repayment parked before the money is spent.
///
/// The weakest joint in any credit line is collection: a promise to repay
/// "on the 30th" is usually a keeper bot with a hot key or an allowance the
/// borrower can revoke the moment the goods arrive. Sui has no scheduled
/// transactions, so the promise is built from objects instead:
///
/// - An agent's earnings sit in a `Purse` it owns.
/// - At drawdown the agent parks an `Obligation`: a claim on that purse, due on
///   a date, signed once by the agent. Coins can only be drawn against an open
///   obligation, so the promise always precedes the spending - in the same
///   transaction, not merely before it.
/// - When it falls due, anyone may call `collect`. Nobody has to be trusted to
///   do it, and the outcome is deterministic: the purse covers the debt and it
///   is repaid, or it does not and a default is written on chain for anyone to
///   read. Nothing moves in the second case: a default is a fact anyone can
///   check, not a number the lender asserts.
///
/// Two more properties:
///
/// - An obligation is a tranche: many draws, one parked promise, up to a
///   ceiling. Collection takes what was drawn, not the ceiling, so a tranche
///   left open costs the agent nothing it did not borrow.
/// - While a pledge is outstanding, the purse will not release the coins that
///   cover it. Earnings that arrive before the due date are held for the debt
///   rather than being free to leave the moment they land.
module lifeline::obligation;

use lifeline::facility::Facility;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// === Statuses ===

const OPEN: u8 = 0;
const SETTLED: u8 = 1;
const DEFAULTED: u8 = 2;
const CLOSED: u8 = 3;

/// Two months at most, so a parked promise cannot outlive anyone's memory of
/// it.
const MAX_TERM_MS: u64 = 60 * 24 * 60 * 60 * 1000;

// === Errors ===

#[error]
const ENotAgent: vector<u8> = b"Only the agent that owns this purse may do that";
#[error]
const EAgentNotAuthorized: vector<u8> = b"Agent not authorized for this profile";
#[error]
const EWrongPurse: vector<u8> = b"Obligation is parked against a different purse";
#[error]
const EWrongFacility: vector<u8> = b"Obligation belongs to a different facility";
#[error]
const EBadDueDate: vector<u8> = b"Due date must be in the future and within the maximum term";
#[error]
const EZeroCeiling: vector<u8> = b"Ceiling must be positive";
#[error]
const ENotOpen: vector<u8> = b"Obligation is not open";
#[error]
const EPastDue: vector<u8> = b"Obligation is past due; no more draws against it";
#[error]
const EOverCeiling: vector<u8> = b"Draw would exceed the parked ceiling";
#[error]
const ENotDue: vector<u8> = b"Obligation is not due yet";
#[error]
const ENotSettleable: vector<u8> = b"Obligation is already closed";
#[error]
const EUnauthorized: vector<u8> = b"Only the agent or its human may settle early";
#[error]
const EShortfall: vector<u8> = b"Purse does not hold enough to settle";
#[error]
const EPledged: vector<u8> = b"Those coins are pledged to an open obligation";

// === Objects ===

/// An agent's own balance on the rail. Anyone can pay into it; only the agent
/// can take out, and only what is not pledged.
public struct Purse<phantom T> has key {
    id: UID,
    agent: address,
    profile_id: vector<u8>,
    balance: Balance<T>,
    /// Sum drawn against obligations that are still unpaid.
    pledged: u64,
}

public struct Obligation<phantom T> has key {
    id: UID,
    facility: ID,
    purse: ID,
    profile_id: vector<u8>,
    agent: address,
    ceiling: u64,
    drawn: u64,
    due_ms: u64,
    status: u8,
    created_ms: u64,
}

// === Events ===

public struct PurseOpened has copy, drop { purse: ID, agent: address, profile_id: vector<u8> }

public struct RepaymentParked has copy, drop {
    obligation: ID,
    purse: ID,
    agent: address,
    profile_id: vector<u8>,
    ceiling: u64,
    due_ms: u64,
}

public struct ObligationDrawn has copy, drop {
    obligation: ID,
    loan_id: u64,
    amount: u64,
    drawn: u64,
    ceiling: u64,
}

public struct RepaymentCollected has copy, drop {
    obligation: ID,
    agent: address,
    amount: u64,
    /// True when settled before the due date by the agent or its human.
    early: bool,
    by: address,
}

/// The obligation came due and the purse could not cover it. Nothing moved;
/// the debt stands and goes on consuming the human's line.
public struct RepaymentDefaulted has copy, drop {
    obligation: ID,
    agent: address,
    owed: u64,
    available: u64,
    by: address,
}

// === Purse ===

public fun open_purse<T>(
    facility: &Facility<T>,
    profile_id: vector<u8>,
    ctx: &mut TxContext,
): ID {
    let agent = ctx.sender();
    assert!(facility.is_agent_authorized(profile_id, agent), EAgentNotAuthorized);

    let purse = Purse<T> {
        id: object::new(ctx),
        agent,
        profile_id,
        balance: balance::zero(),
        pledged: 0,
    };
    let id = object::id(&purse);
    event::emit(PurseOpened { purse: id, agent, profile_id });
    transfer::share_object(purse);
    id
}

/// Anyone may pay the agent: this is where its earnings arrive.
public fun deposit<T>(purse: &mut Purse<T>, coins: Coin<T>) {
    purse.balance.join(coins.into_balance());
}

public fun withdraw<T>(purse: &mut Purse<T>, amount: u64, ctx: &mut TxContext): Coin<T> {
    assert!(ctx.sender() == purse.agent, ENotAgent);
    assert!(amount <= purse.available(), EPledged);
    coin::take(&mut purse.balance, amount, ctx)
}

// === Obligations ===

/// The agent signs once: a claim on its purse, due on `due_ms`, for up to
/// `ceiling`. Nothing is owed until something is drawn against it.
public fun park<T>(
    facility: &Facility<T>,
    purse: &Purse<T>,
    ceiling: u64,
    due_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    assert!(ctx.sender() == purse.agent, ENotAgent);
    assert!(facility.is_agent_authorized(purse.profile_id, purse.agent), EAgentNotAuthorized);
    assert!(ceiling > 0, EZeroCeiling);
    let now = clock.timestamp_ms();
    assert!(due_ms > now && due_ms - now <= MAX_TERM_MS, EBadDueDate);

    let obligation = Obligation<T> {
        id: object::new(ctx),
        facility: object::id(facility),
        purse: object::id(purse),
        profile_id: purse.profile_id,
        agent: purse.agent,
        ceiling,
        drawn: 0,
        due_ms,
        status: OPEN,
        created_ms: now,
    };
    let id = object::id(&obligation);
    event::emit(RepaymentParked {
        obligation: id,
        purse: object::id(purse),
        agent: purse.agent,
        profile_id: purse.profile_id,
        ceiling,
        due_ms,
    });
    transfer::share_object(obligation);
    id
}

/// Borrow against a parked obligation. The coins come out of the facility in
/// the same transaction that books the debt, and the caller sends them on -
/// typically straight to the seller of an x402 resource, in one PTB.
public fun draw<T>(
    facility: &mut Facility<T>,
    purse: &mut Purse<T>,
    obligation: &mut Obligation<T>,
    amount: u64,
    payment_count: u32,
    reference_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == purse.agent, ENotAgent);
    obligation.assert_matches(facility, purse);
    assert!(obligation.status == OPEN, ENotOpen);
    assert!(clock.timestamp_ms() < obligation.due_ms, EPastDue);
    assert!(obligation.drawn + amount <= obligation.ceiling, EOverCeiling);

    // Authorisation, profile status and the credit limit are the facility's
    // to check, the same way for every drawdown.
    let loan_id = facility.book_drawdown(
        obligation.profile_id,
        purse.agent,
        amount,
        payment_count,
        reference_hash,
        clock,
    );

    obligation.drawn = obligation.drawn + amount;
    purse.pledged = purse.pledged + amount;

    event::emit(ObligationDrawn {
        obligation: object::id(obligation),
        loan_id,
        amount,
        drawn: obligation.drawn,
        ceiling: obligation.ceiling,
    });
    coin::from_balance(facility.take_liquidity(amount), ctx)
}

/// Anyone, once it is due. The purse covers the debt and it is repaid, or it
/// does not and the default is recorded. All or nothing: a partial sweep
/// would leave the agent both short and still in default.
public fun collect<T>(
    facility: &mut Facility<T>,
    purse: &mut Purse<T>,
    obligation: &mut Obligation<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    obligation.assert_matches(facility, purse);
    assert!(obligation.status == OPEN, ENotOpen);
    assert!(clock.timestamp_ms() >= obligation.due_ms, ENotDue);

    let owed = obligation.owed(facility);
    if (owed == 0) {
        obligation.close(purse, CLOSED);
        return
    };

    let available = purse.balance.value();
    if (available < owed) {
        // The purse keeps its pledge, so whatever the agent earns next is
        // held for this debt until someone settles it.
        obligation.status = DEFAULTED;
        event::emit(RepaymentDefaulted {
            obligation: object::id(obligation),
            agent: obligation.agent,
            owed,
            available,
            by: ctx.sender(),
        });
        return
    };

    obligation.pay_from_purse(facility, purse, owed, false, clock, ctx);
}

/// Settle before the due date, or cure a default after it. The agent or its
/// human may do this; the coins come from the purse, so pay into it first in
/// the same transaction if it is short.
///
/// Without an early path, the only way to repay would be to wait - and anyone
/// who repaid through the facility directly would find the obligation still
/// parked, ready to collect a second time. `owed` is clamped to the profile's
/// debt for that reason.
public fun settle<T>(
    facility: &mut Facility<T>,
    purse: &mut Purse<T>,
    obligation: &mut Obligation<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    obligation.assert_matches(facility, purse);
    assert!(obligation.status == OPEN || obligation.status == DEFAULTED, ENotSettleable);
    let sender = ctx.sender();
    assert!(
        sender == obligation.agent || sender == facility.profile(obligation.profile_id).human_owner(),
        EUnauthorized,
    );

    let owed = obligation.owed(facility);
    if (owed == 0) {
        obligation.close(purse, CLOSED);
        return
    };
    assert!(purse.balance.value() >= owed, EShortfall);

    let early = clock.timestamp_ms() < obligation.due_ms;
    obligation.pay_from_purse(facility, purse, owed, early, clock, ctx);
}

// === Views ===

public fun purse_agent<T>(purse: &Purse<T>): address { purse.agent }

public fun purse_balance<T>(purse: &Purse<T>): u64 { purse.balance.value() }

public fun purse_pledged<T>(purse: &Purse<T>): u64 { purse.pledged }

/// What the agent may withdraw: its balance less what is pledged.
public fun available<T>(purse: &Purse<T>): u64 {
    let balance = purse.balance.value();
    if (balance > purse.pledged) balance - purse.pledged else 0
}

public fun ceiling<T>(o: &Obligation<T>): u64 { o.ceiling }

public fun drawn<T>(o: &Obligation<T>): u64 { o.drawn }

public fun due_ms<T>(o: &Obligation<T>): u64 { o.due_ms }

public fun status<T>(o: &Obligation<T>): u8 { o.status }

public fun agent<T>(o: &Obligation<T>): address { o.agent }

public fun purse_id<T>(o: &Obligation<T>): ID { o.purse }

public fun status_open(): u8 { OPEN }

public fun status_settled(): u8 { SETTLED }

public fun status_defaulted(): u8 { DEFAULTED }

public fun status_closed(): u8 { CLOSED }

public fun max_term_ms(): u64 { MAX_TERM_MS }

// === Internal ===

fun assert_matches<T>(o: &Obligation<T>, facility: &Facility<T>, purse: &Purse<T>) {
    assert!(o.facility == object::id(facility), EWrongFacility);
    assert!(o.purse == object::id(purse), EWrongPurse);
}

/// What this obligation can still collect. Never more than the human owes in
/// total: debt already repaid some other way must not be collected again.
fun owed<T>(o: &Obligation<T>, facility: &Facility<T>): u64 {
    o.drawn.min(facility.outstanding_debt(o.profile_id))
}

fun pay_from_purse<T>(
    o: &mut Obligation<T>,
    facility: &mut Facility<T>,
    purse: &mut Purse<T>,
    owed: u64,
    early: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    facility.put_liquidity(purse.balance.split(owed));
    facility.book_repayment(o.profile_id, o.agent, o.agent, owed, clock);
    o.close(purse, SETTLED);
    event::emit(RepaymentCollected {
        obligation: object::id(o),
        agent: o.agent,
        amount: owed,
        early,
        by: ctx.sender(),
    });
}

fun close<T>(o: &mut Obligation<T>, purse: &mut Purse<T>, status: u8) {
    purse.pledged = purse.pledged - o.drawn;
    o.status = status;
}
