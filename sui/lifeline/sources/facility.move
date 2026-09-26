/// Lifeline's credit facility, on Sui.
///
/// A port of `contracts/src/LifelineCreditFacility.sol`: the same ledger of human
/// credit profiles, authorised agents, drawdowns and repayments, with the same
/// rules about who may do what. Credit is extended to a human who is unique
/// because World ID says so; their agents spend against it.
///
/// Two things are different because this is Move rather than the EVM:
///
/// - Authority is a capability, not an address check. `AdminCap` is the
///   underwriter - what `onlyOwner` was - and transferring it is how ownership
///   moves.
/// - The facility holds liquidity. On Arc a drawdown only records debt and the
///   money moves off-chain through Circle Gateway. Here `obligation::draw`
///   takes coins out of the facility in the same transaction that records the
///   debt, so a purchase and the debt it creates cannot come apart.
///
/// Amounts are in the coin's base units. For USDC that is 6 decimals, the same
/// units the Arc contract uses.
module lifeline::facility;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::table::{Self, Table};

// === Statuses ===

const PROFILE_INACTIVE: u8 = 0;
const PROFILE_ACTIVE: u8 = 1;
const PROFILE_SUSPENDED: u8 = 2;
const PROFILE_DEFAULTED: u8 = 3;

const LOAN_ACTIVE: u8 = 0;

// === Errors ===

#[error]
const EWrongFacility: vector<u8> = b"Capability belongs to a different facility";
#[error]
const EProfileExists: vector<u8> = b"Profile already exists";
#[error]
const ENoProfile: vector<u8> = b"Profile does not exist";
#[error]
const ENeedsHumanRoot: vector<u8> = b"Underwritten profile needs a human root";
#[error]
const EHumanHasProfile: vector<u8> = b"Human already has a profile";
#[error]
const ERootUsed: vector<u8> = b"Human root already used";
#[error]
const EBadStatus: vector<u8> = b"Unknown profile status";
#[error]
const ENotProfileOwner: vector<u8> = b"Not the profile owner";
#[error]
const EUnauthorized: vector<u8> = b"Unauthorized";
#[error]
const EAgentNotOnProfile: vector<u8> = b"Agent not associated with profile";
#[error]
const EEmptyBatch: vector<u8> = b"Batch must cover at least one payment";
#[error]
const EProfileNotActive: vector<u8> = b"Profile is not active";
#[error]
const EAgentNotAuthorized: vector<u8> = b"Agent not authorized for this profile";
#[error]
const EOverLimit: vector<u8> = b"Requested drawdown exceeds credit limit";
#[error]
const ENoDebt: vector<u8> = b"No outstanding debt to repay";
#[error]
const EInsufficientLiquidity: vector<u8> = b"Facility does not hold enough liquidity";
#[error]
const EZeroAmount: vector<u8> = b"Amount must be positive";

// === Objects ===

/// The underwriter. Whoever holds this is what `owner` was on Arc.
public struct AdminCap has key, store {
    id: UID,
    facility: ID,
}

public struct CreditProfile has copy, drop, store {
    profile_id: vector<u8>,
    human_owner: address,
    /// World ID nullifier or a hash of it. One root, one profile.
    human_root: vector<u8>,
    credit_limit: u64,
    outstanding_debt: u64,
    total_borrowed: u64,
    total_repaid: u64,
    status: u8,
    created_at_ms: u64,
}

public struct AgentAuthorization has copy, drop, store {
    profile_id: vector<u8>,
    is_active: bool,
    authorized_at_ms: u64,
}

/// One drawdown row. `payment_count` is what makes a row a batch: fifty
/// nanopayments settled together cost one row, as on Arc.
public struct Drawdown has copy, drop, store {
    profile_id: vector<u8>,
    agent: address,
    timestamp_ms: u64,
    status: u8,
    amount: u64,
    loan_id: u64,
    payment_count: u32,
    /// Hash of the human-readable reference, which lives off-chain.
    reference_hash: vector<u8>,
}

public struct Facility<phantom T> has key {
    id: UID,
    liquidity: Balance<T>,
    profiles: Table<vector<u8>, CreditProfile>,
    /// Self-registration only: one address, one profile.
    human_to_profile: Table<address, vector<u8>>,
    /// One World root, one profile, however the profile was opened.
    root_to_profile: Table<vector<u8>, vector<u8>>,
    agents: Table<address, AgentAuthorization>,
    drawdowns: Table<u64, Drawdown>,
    next_loan_id: u64,
    next_repayment_id: u64,
    profile_count: u64,
}

// === Events ===

public struct FacilityCreated has copy, drop { facility: ID, admin_cap: ID }

public struct CreditProfileCreated has copy, drop {
    profile_id: vector<u8>,
    human_owner: address,
    human_root: vector<u8>,
    credit_limit: u64,
}

public struct CreditLimitUpdated has copy, drop {
    profile_id: vector<u8>,
    old_limit: u64,
    new_limit: u64,
}

public struct ProfileStatusChanged has copy, drop { profile_id: vector<u8>, status: u8 }

public struct AgentAuthorized has copy, drop {
    profile_id: vector<u8>,
    agent: address,
    timestamp_ms: u64,
}

public struct AgentRevoked has copy, drop {
    profile_id: vector<u8>,
    agent: address,
    timestamp_ms: u64,
}

public struct DrawdownRecorded has copy, drop {
    loan_id: u64,
    profile_id: vector<u8>,
    agent: address,
    amount: u64,
    new_outstanding_debt: u64,
    timestamp_ms: u64,
    payment_count: u32,
    reference_hash: vector<u8>,
}

public struct RepaymentRecorded has copy, drop {
    repayment_id: u64,
    profile_id: vector<u8>,
    payer: address,
    beneficiary_agent: address,
    amount: u64,
    remaining_debt: u64,
    timestamp_ms: u64,
}

public struct DefaultMarked has copy, drop {
    profile_id: vector<u8>,
    outstanding_debt: u64,
    timestamp_ms: u64,
}

public struct LiquidityAdded has copy, drop { amount: u64, total: u64 }

public struct Withdrawn has copy, drop { to: address, amount: u64 }

// === Setup ===

/// Opens a facility lending coin `T` and hands its underwriter capability to
/// the caller. The facility is shared: agents and humans act on it directly.
public fun create<T>(ctx: &mut TxContext): AdminCap {
    let facility = Facility<T> {
        id: object::new(ctx),
        liquidity: balance::zero(),
        profiles: table::new(ctx),
        human_to_profile: table::new(ctx),
        root_to_profile: table::new(ctx),
        agents: table::new(ctx),
        drawdowns: table::new(ctx),
        next_loan_id: 1,
        next_repayment_id: 1,
        profile_count: 0,
    };
    let cap = AdminCap { id: object::new(ctx), facility: object::id(&facility) };
    event::emit(FacilityCreated { facility: object::id(&facility), admin_cap: object::id(&cap) });
    transfer::share_object(facility);
    cap
}

// === Profiles ===

/// Underwriter path. Lifeline onboards every human from one operator identity,
/// so the owner address says nothing about uniqueness - the World root does,
/// and an underwritten profile without one would have no Sybil control.
public fun create_credit_profile<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    human_owner: address,
    human_root: vector<u8>,
    initial_credit_limit: u64,
    clock: &Clock,
) {
    self.assert_cap(cap);
    assert!(!human_root.is_empty(), ENeedsHumanRoot);
    self.open_profile(profile_id, human_owner, human_root, initial_credit_limit, clock);
}

/// Self-registration. The caller really is the human, so one address gets one
/// profile - and it carries no credit until the underwriter sets a limit.
public fun self_register<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    human_root: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let human = ctx.sender();
    assert!(!self.human_to_profile.contains(human), EHumanHasProfile);
    self.open_profile(profile_id, human, human_root, 0, clock);
    self.human_to_profile.add(human, profile_id);
}

/// Underwriter only. A borrower who can set their own limit is not a borrower.
public fun set_credit_limit<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    new_limit: u64,
) {
    self.assert_cap(cap);
    let profile = self.profile_mut(profile_id);
    let old_limit = profile.credit_limit;
    profile.credit_limit = new_limit;
    event::emit(CreditLimitUpdated { profile_id, old_limit, new_limit });
}

/// Underwriter only. A human who could clear their own default could resume
/// borrowing the moment they stopped paying.
public fun set_profile_status<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    status: u8,
) {
    self.assert_cap(cap);
    assert!(status <= PROFILE_DEFAULTED, EBadStatus);
    self.profile_mut(profile_id).status = status;
    event::emit(ProfileStatusChanged { profile_id, status });
}

/// A human may always suspend themselves; that direction needs no permission.
/// Only the underwriter can re-activate.
public fun suspend_own_profile<T>(self: &mut Facility<T>, profile_id: vector<u8>, ctx: &mut TxContext) {
    let profile = self.profile_mut(profile_id);
    assert!(profile.human_owner == ctx.sender(), ENotProfileOwner);
    profile.status = PROFILE_SUSPENDED;
    event::emit(ProfileStatusChanged { profile_id, status: PROFILE_SUSPENDED });
}

// === Agents ===

/// The human authorises an agent to draw against their line.
public fun authorize_agent<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    agent: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(self.profile(profile_id).human_owner == ctx.sender(), EUnauthorized);
    self.set_agent(profile_id, agent, clock);
}

public fun authorize_agent_as_underwriter<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    agent: address,
    clock: &Clock,
) {
    self.assert_cap(cap);
    assert!(self.profiles.contains(profile_id), ENoProfile);
    self.set_agent(profile_id, agent, clock);
}

public fun revoke_agent<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    agent: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(self.profile(profile_id).human_owner == ctx.sender(), EUnauthorized);
    self.unset_agent(profile_id, agent, clock);
}

public fun revoke_agent_as_underwriter<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    agent: address,
    clock: &Clock,
) {
    self.assert_cap(cap);
    assert!(self.profiles.contains(profile_id), ENoProfile);
    self.unset_agent(profile_id, agent, clock);
}

// === Drawdowns ===

/// Books debt without moving coins: the payment happened elsewhere. Callable
/// by the human or the agent itself, as on Arc. A drawdown that moves money
/// goes through `obligation::draw`, which parks the repayment first.
public fun record_drawdown<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    agent: address,
    amount: u64,
    payment_count: u32,
    reference_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    let sender = ctx.sender();
    assert!(
        sender == agent || sender == self.profile(profile_id).human_owner,
        EUnauthorized,
    );
    self.book_drawdown(profile_id, agent, amount, payment_count, reference_hash, clock)
}

public fun record_drawdown_as_underwriter<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    agent: address,
    amount: u64,
    payment_count: u32,
    reference_hash: vector<u8>,
    clock: &Clock,
): u64 {
    self.assert_cap(cap);
    self.book_drawdown(profile_id, agent, amount, payment_count, reference_hash, clock)
}

// === Repayments ===

/// Underwriter only, and it moves no coins - it books a repayment the operator
/// has already seen settle elsewhere. On Arc this was once callable by anyone,
/// which let any address clear any debt for free.
public fun record_repayment<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    payer: address,
    beneficiary_agent: address,
    amount: u64,
    clock: &Clock,
): u64 {
    self.assert_cap(cap);
    assert!(self.profile(profile_id).outstanding_debt > 0, ENoDebt);
    self.book_repayment(profile_id, payer, beneficiary_agent, amount, clock)
}

/// Repay with coins. Anyone may pay a human's debt; only what is owed is
/// taken, and the change comes back rather than being kept.
public fun repay<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    beneficiary_agent: address,
    mut payment: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    let owed = self.profile(profile_id).outstanding_debt;
    assert!(owed > 0, ENoDebt);

    let applied = owed.min(payment.value());
    self.liquidity.join(payment.split(applied, ctx).into_balance());
    self.book_repayment(profile_id, ctx.sender(), beneficiary_agent, applied, clock);
    payment
}

/// Underwriter only. Marking a default does not erase the debt.
public fun mark_default<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    profile_id: vector<u8>,
    clock: &Clock,
) {
    self.assert_cap(cap);
    let profile = self.profile_mut(profile_id);
    assert!(profile.outstanding_debt > 0, ENoDebt);
    profile.status = PROFILE_DEFAULTED;
    event::emit(DefaultMarked {
        profile_id,
        outstanding_debt: profile.outstanding_debt,
        timestamp_ms: clock.timestamp_ms(),
    });
}

// === Liquidity ===

/// Anyone may fund the facility. Lifeline does, so agents have something to draw.
public fun fund<T>(self: &mut Facility<T>, coins: Coin<T>) {
    let amount = coins.value();
    assert!(amount > 0, EZeroAmount);
    self.liquidity.join(coins.into_balance());
    event::emit(LiquidityAdded { amount, total: self.liquidity.value() });
}

/// Underwriter only. Without it, every repaid coin would be stranded here.
public fun withdraw<T>(
    self: &mut Facility<T>,
    cap: &AdminCap,
    amount: u64,
    ctx: &mut TxContext,
): Coin<T> {
    self.assert_cap(cap);
    assert!(self.liquidity.value() >= amount, EInsufficientLiquidity);
    event::emit(Withdrawn { to: ctx.sender(), amount });
    coin::take(&mut self.liquidity, amount, ctx)
}

// === Views ===

public fun profile<T>(self: &Facility<T>, profile_id: vector<u8>): CreditProfile {
    assert!(self.profiles.contains(profile_id), ENoProfile);
    *self.profiles.borrow(profile_id)
}

public fun has_profile<T>(self: &Facility<T>, profile_id: vector<u8>): bool {
    self.profiles.contains(profile_id)
}

/// Zero for any profile that is not active, as on Arc.
public fun remaining_credit<T>(self: &Facility<T>, profile_id: vector<u8>): u64 {
    if (!self.profiles.contains(profile_id)) return 0;
    let p = self.profiles.borrow(profile_id);
    if (p.status != PROFILE_ACTIVE || p.credit_limit <= p.outstanding_debt) 0
    else p.credit_limit - p.outstanding_debt
}

public fun outstanding_debt<T>(self: &Facility<T>, profile_id: vector<u8>): u64 {
    if (!self.profiles.contains(profile_id)) return 0;
    self.profiles.borrow(profile_id).outstanding_debt
}

public fun is_agent_authorized<T>(self: &Facility<T>, profile_id: vector<u8>, agent: address): bool {
    if (!self.agents.contains(agent)) return false;
    let auth = self.agents.borrow(agent);
    auth.is_active && auth.profile_id == profile_id
}

public fun agent_profile_id<T>(self: &Facility<T>, agent: address): vector<u8> {
    if (!self.agents.contains(agent)) return vector[];
    self.agents.borrow(agent).profile_id
}

public fun drawdown<T>(self: &Facility<T>, loan_id: u64): Drawdown {
    *self.drawdowns.borrow(loan_id)
}

public fun profile_count<T>(self: &Facility<T>): u64 { self.profile_count }

public fun next_loan_id<T>(self: &Facility<T>): u64 { self.next_loan_id }

public fun next_repayment_id<T>(self: &Facility<T>): u64 { self.next_repayment_id }

public fun liquidity<T>(self: &Facility<T>): u64 { self.liquidity.value() }

public fun cap_facility(cap: &AdminCap): ID { cap.facility }

// CreditProfile fields are private to this module; these are how anything
// else reads them.
public fun human_owner(p: &CreditProfile): address { p.human_owner }

public fun human_root(p: &CreditProfile): vector<u8> { p.human_root }

public fun credit_limit(p: &CreditProfile): u64 { p.credit_limit }

public fun debt(p: &CreditProfile): u64 { p.outstanding_debt }

public fun total_borrowed(p: &CreditProfile): u64 { p.total_borrowed }

public fun total_repaid(p: &CreditProfile): u64 { p.total_repaid }

public fun status(p: &CreditProfile): u8 { p.status }

public fun drawdown_amount(d: &Drawdown): u64 { d.amount }

public fun drawdown_agent(d: &Drawdown): address { d.agent }

public fun drawdown_payment_count(d: &Drawdown): u32 { d.payment_count }

public fun drawdown_reference_hash(d: &Drawdown): vector<u8> { d.reference_hash }

public fun status_active(): u8 { PROFILE_ACTIVE }

public fun status_suspended(): u8 { PROFILE_SUSPENDED }

public fun status_defaulted(): u8 { PROFILE_DEFAULTED }

public fun status_inactive(): u8 { PROFILE_INACTIVE }

// === Package: what obligation.move builds on ===

/// Every drawdown, however it is initiated, passes the same checks.
public(package) fun book_drawdown<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    agent: address,
    amount: u64,
    payment_count: u32,
    reference_hash: vector<u8>,
    clock: &Clock,
): u64 {
    assert!(payment_count > 0, EEmptyBatch);
    assert!(amount > 0, EZeroAmount);
    assert!(self.is_agent_authorized(profile_id, agent), EAgentNotAuthorized);

    let profile = self.profile_mut(profile_id);
    assert!(profile.status == PROFILE_ACTIVE, EProfileNotActive);
    assert!(profile.outstanding_debt + amount <= profile.credit_limit, EOverLimit);

    profile.outstanding_debt = profile.outstanding_debt + amount;
    profile.total_borrowed = profile.total_borrowed + amount;
    let new_outstanding_debt = profile.outstanding_debt;

    let loan_id = self.next_loan_id;
    self.next_loan_id = loan_id + 1;
    let timestamp_ms = clock.timestamp_ms();
    self
        .drawdowns
        .add(
            loan_id,
            Drawdown {
                profile_id,
                agent,
                timestamp_ms,
                status: LOAN_ACTIVE,
                amount,
                loan_id,
                payment_count,
                reference_hash,
            },
        );

    event::emit(DrawdownRecorded {
        loan_id,
        profile_id,
        agent,
        amount,
        new_outstanding_debt,
        timestamp_ms,
        payment_count,
        reference_hash,
    });
    loan_id
}

/// Clamps to what is owed and returns what was applied.
public(package) fun book_repayment<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    payer: address,
    beneficiary_agent: address,
    amount: u64,
    clock: &Clock,
): u64 {
    let profile = self.profile_mut(profile_id);
    let applied = amount.min(profile.outstanding_debt);
    profile.outstanding_debt = profile.outstanding_debt - applied;
    profile.total_repaid = profile.total_repaid + applied;
    let remaining_debt = profile.outstanding_debt;

    let repayment_id = self.next_repayment_id;
    self.next_repayment_id = repayment_id + 1;
    event::emit(RepaymentRecorded {
        repayment_id,
        profile_id,
        payer,
        beneficiary_agent,
        amount: applied,
        remaining_debt,
        timestamp_ms: clock.timestamp_ms(),
    });
    applied
}

public(package) fun take_liquidity<T>(self: &mut Facility<T>, amount: u64): Balance<T> {
    assert!(self.liquidity.value() >= amount, EInsufficientLiquidity);
    self.liquidity.split(amount)
}

public(package) fun put_liquidity<T>(self: &mut Facility<T>, coins: Balance<T>) {
    self.liquidity.join(coins);
}

// === Internal ===

fun assert_cap<T>(self: &Facility<T>, cap: &AdminCap) {
    assert!(cap.facility == object::id(self), EWrongFacility);
}

fun profile_mut<T>(self: &mut Facility<T>, profile_id: vector<u8>): &mut CreditProfile {
    assert!(self.profiles.contains(profile_id), ENoProfile);
    self.profiles.borrow_mut(profile_id)
}

fun open_profile<T>(
    self: &mut Facility<T>,
    profile_id: vector<u8>,
    human_owner: address,
    human_root: vector<u8>,
    credit_limit: u64,
    clock: &Clock,
) {
    assert!(!self.profiles.contains(profile_id), EProfileExists);
    if (!human_root.is_empty()) {
        assert!(!self.root_to_profile.contains(human_root), ERootUsed);
        self.root_to_profile.add(human_root, profile_id);
    };

    self
        .profiles
        .add(
            profile_id,
            CreditProfile {
                profile_id,
                human_owner,
                human_root,
                credit_limit,
                outstanding_debt: 0,
                total_borrowed: 0,
                total_repaid: 0,
                status: PROFILE_ACTIVE,
                created_at_ms: clock.timestamp_ms(),
            },
        );
    self.profile_count = self.profile_count + 1;

    event::emit(CreditProfileCreated { profile_id, human_owner, human_root, credit_limit });
}

fun set_agent<T>(self: &mut Facility<T>, profile_id: vector<u8>, agent: address, clock: &Clock) {
    let auth = AgentAuthorization {
        profile_id,
        is_active: true,
        authorized_at_ms: clock.timestamp_ms(),
    };
    if (self.agents.contains(agent)) *self.agents.borrow_mut(agent) = auth
    else self.agents.add(agent, auth);
    event::emit(AgentAuthorized { profile_id, agent, timestamp_ms: clock.timestamp_ms() });
}

fun unset_agent<T>(self: &mut Facility<T>, profile_id: vector<u8>, agent: address, clock: &Clock) {
    assert!(self.agents.contains(agent), EAgentNotOnProfile);
    let auth = self.agents.borrow_mut(agent);
    assert!(auth.profile_id == profile_id, EAgentNotOnProfile);
    auth.is_active = false;
    event::emit(AgentRevoked { profile_id, agent, timestamp_ms: clock.timestamp_ms() });
}
