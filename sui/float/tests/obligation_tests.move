/// The parked repayment, tested the way the Hedera rail was proved on testnet:
/// a borrower signs once, the obligation comes due, and it either collects or
/// defaults in plain sight - with nobody needing to be trusted to run it.
#[test_only]
module float::obligation_tests;

use float::facility::{Self, Facility, AdminCap};
use float::obligation::{Self, Purse, Obligation};
use sui::clock::{Self, Clock};
use sui::coin;
use sui::test_scenario::{Self as ts, Scenario};

public struct USDC has drop {}

/// An agent's purse and the obligation parked against it.
public struct Ids has copy, drop { purse: ID, ob: ID }

const FLOAT: address = @0xF1;
const HUMAN: address = @0xA1;
const AGENT: address = @0xA2;
const IDLER: address = @0xA3;
const STRANGER: address = @0xBAD;
const SELLER: address = @0x5E11;

const LIMIT: u64 = 10_000_000;
const LIQUIDITY: u64 = 100_000_000;
const WEEK_MS: u64 = 7 * 24 * 60 * 60 * 1000;

fun pid(): vector<u8> { b"profile-human-1" }

/// Float underwrites HUMAN, authorises both agents and funds the facility.
fun begin(): (Scenario, Clock) {
    let mut sc = ts::begin(FLOAT);
    let cap = facility::create<USDC>(sc.ctx());
    transfer::public_transfer(cap, FLOAT);
    let mut clock = clock::create_for_testing(sc.ctx());
    clock.set_for_testing(1_000_000);

    sc.next_tx(FLOAT);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.create_credit_profile(&cap, pid(), HUMAN, b"world-root", LIMIT, &clock);
    f.authorize_agent_as_underwriter(&cap, pid(), AGENT, &clock);
    f.authorize_agent_as_underwriter(&cap, pid(), IDLER, &clock);
    f.fund(coin::mint_for_testing<USDC>(LIQUIDITY, sc.ctx()));
    ts::return_shared(f);
    sc.return_to_sender(cap);
    (sc, clock)
}

fun finish(sc: Scenario, clock: Clock) {
    clock.destroy_for_testing();
    sc.end();
}

/// The agent opens a purse and parks a repayment for up to `ceiling`, due in a
/// week. Returns (purse, obligation) ids.
fun park_as(sc: &mut Scenario, clock: &Clock, agent: address, ceiling: u64): Ids {
    sc.next_tx(agent);
    let f = sc.take_shared<Facility<USDC>>();
    let purse_id = obligation::open_purse(&f, pid(), sc.ctx());
    ts::return_shared(f);

    sc.next_tx(agent);
    let f = sc.take_shared<Facility<USDC>>();
    let purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    let due = clock.timestamp_ms() + WEEK_MS;
    let ob_id = obligation::park(&f, &purse, ceiling, due, clock, sc.ctx());
    ts::return_shared(f);
    ts::return_shared(purse);
    Ids { purse: purse_id, ob: ob_id }
}

/// The agent draws `amount` and pays the seller with it, in one transaction -
/// the shape of an x402 purchase on credit.
fun buy_on_credit(sc: &mut Scenario, clock: &Clock, agent: address, ids: Ids, amount: u64) {
    let Ids { purse: purse_id, ob: ob_id } = ids;
    sc.next_tx(agent);
    let mut f = sc.take_shared<Facility<USDC>>();
    let mut purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    let mut ob = sc.take_shared_by_id<Obligation<USDC>>(ob_id);
    let paid = obligation::draw(&mut f, &mut purse, &mut ob, amount, 1, b"x402", clock, sc.ctx());
    transfer::public_transfer(paid, SELLER);
    ts::return_shared(f);
    ts::return_shared(purse);
    ts::return_shared(ob);
}

fun earn(sc: &mut Scenario, purse_id: ID, amount: u64) {
    sc.next_tx(STRANGER);
    let mut purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    obligation::deposit(&mut purse, coin::mint_for_testing<USDC>(amount, sc.ctx()));
    ts::return_shared(purse);
}

fun collect_as(sc: &mut Scenario, clock: &Clock, caller: address, ids: Ids) {
    let Ids { purse: purse_id, ob: ob_id } = ids;
    sc.next_tx(caller);
    let mut f = sc.take_shared<Facility<USDC>>();
    let mut purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    let mut ob = sc.take_shared_by_id<Obligation<USDC>>(ob_id);
    obligation::collect(&mut f, &mut purse, &mut ob, clock, sc.ctx());
    ts::return_shared(f);
    ts::return_shared(purse);
    ts::return_shared(ob);
}

fun settle_as(sc: &mut Scenario, clock: &Clock, caller: address, ids: Ids) {
    let Ids { purse: purse_id, ob: ob_id } = ids;
    sc.next_tx(caller);
    let mut f = sc.take_shared<Facility<USDC>>();
    let mut purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    let mut ob = sc.take_shared_by_id<Obligation<USDC>>(ob_id);
    obligation::settle(&mut f, &mut purse, &mut ob, clock, sc.ctx());
    ts::return_shared(f);
    ts::return_shared(purse);
    ts::return_shared(ob);
}

fun status_of(sc: &mut Scenario, ob_id: ID): u8 {
    sc.next_tx(FLOAT);
    let ob = sc.take_shared_by_id<Obligation<USDC>>(ob_id);
    let s = ob.status();
    ts::return_shared(ob);
    s
}

fun purse_state(sc: &mut Scenario, purse_id: ID): (u64, u64) {
    sc.next_tx(FLOAT);
    let purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    let balance = purse.purse_balance();
    let pledged = purse.purse_pledged();
    ts::return_shared(purse);
    (balance, pledged)
}

fun facility_state(sc: &mut Scenario): (u64, u64) {
    sc.next_tx(FLOAT);
    let f = sc.take_shared<Facility<USDC>>();
    let debt = f.outstanding_debt(pid());
    let liquidity = f.liquidity();
    ts::return_shared(f);
    (debt, liquidity)
}

// === Drawing ===

#[test]
fun a_draw_pays_the_seller_and_books_the_debt_in_one_step() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 1_250_000);

    let (debt, liquidity) = facility_state(&mut sc);
    assert!(debt == 1_250_000);
    assert!(liquidity == LIQUIDITY - 1_250_000);
    let (_, pledged) = purse_state(&mut sc, ids.purse);
    assert!(pledged == 1_250_000);

    sc.next_tx(SELLER);
    let paid = sc.take_from_sender<coin::Coin<USDC>>();
    assert!(paid.value() == 1_250_000);
    paid.burn_for_testing();
    finish(sc, clock);
}

#[test]
fun one_parked_promise_covers_many_payments() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 50_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 5_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 5_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 5_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 5_000);

    sc.next_tx(FLOAT);
    let ob = sc.take_shared_by_id<Obligation<USDC>>(ids.ob);
    assert!(ob.drawn() == 20_000);
    assert!(ob.ceiling() == 50_000);
    ts::return_shared(ob);

    // Collection takes what was drawn, not the ceiling.
    earn(&mut sc, ids.purse, 1_000_000);
    let mut clock = clock;
    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, ids);
    let (balance, pledged) = purse_state(&mut sc, ids.purse);
    assert!(balance == 1_000_000 - 20_000);
    assert!(pledged == 0);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::EOverCeiling)]
fun a_tranche_cannot_be_drawn_past_its_ceiling() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 10_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 6_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 6_000);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EOverLimit)]
fun the_human_limit_binds_however_high_the_ceiling() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, LIMIT * 10);
    buy_on_credit(&mut sc, &clock, AGENT, ids, LIMIT + 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EOverLimit)]
fun two_agents_share_one_limit_through_their_obligations() {
    let (mut sc, clock) = begin();
    let a = park_as(&mut sc, &clock, AGENT, LIMIT);
    let b = park_as(&mut sc, &clock, IDLER, LIMIT);
    buy_on_credit(&mut sc, &clock, AGENT, a, 7_000_000);
    buy_on_credit(&mut sc, &clock, IDLER, b, 3_000_001);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::ENotAgent)]
fun nobody_else_can_draw_on_an_agents_obligation() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 10_000);
    buy_on_credit(&mut sc, &clock, STRANGER, ids, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::EPastDue)]
fun an_obligation_cannot_be_drawn_after_it_falls_due() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 10_000);
    clock.increment_for_testing(WEEK_MS);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EAgentNotAuthorized)]
fun a_revoked_agent_cannot_draw_on_an_old_obligation() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 10_000);
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.revoke_agent(pid(), AGENT, &clock, sc.ctx());
    ts::return_shared(f);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EInsufficientLiquidity)]
fun a_draw_needs_liquidity_behind_it() {
    let (mut sc, clock) = begin();
    sc.next_tx(FLOAT);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.withdraw(&cap, LIQUIDITY, sc.ctx()).burn_for_testing();
    ts::return_shared(f);
    sc.return_to_sender(cap);

    let ids = park_as(&mut sc, &clock, AGENT, 10_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::EAgentNotAuthorized)]
fun only_an_authorised_agent_can_open_a_purse() {
    let (mut sc, _clock) = begin();
    sc.next_tx(STRANGER);
    let f = sc.take_shared<Facility<USDC>>();
    obligation::open_purse(&f, pid(), sc.ctx());
    abort 0
}

// === Parking ===

#[test, expected_failure(abort_code = obligation::EBadDueDate)]
fun a_repayment_cannot_be_parked_in_the_past() {
    let (mut sc, clock) = begin();
    let purse_id = park_as(&mut sc, &clock, AGENT, 1).purse;
    sc.next_tx(AGENT);
    let f = sc.take_shared<Facility<USDC>>();
    let purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    obligation::park(&f, &purse, 1, clock.timestamp_ms(), &clock, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = obligation::EBadDueDate)]
fun a_repayment_cannot_be_parked_beyond_the_maximum_term() {
    let (mut sc, clock) = begin();
    let purse_id = park_as(&mut sc, &clock, AGENT, 1).purse;
    sc.next_tx(AGENT);
    let f = sc.take_shared<Facility<USDC>>();
    let purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    let too_far = clock.timestamp_ms() + obligation::max_term_ms() + 1;
    obligation::park(&f, &purse, 1, too_far, &clock, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = obligation::ENotAgent)]
fun nobody_can_park_a_promise_on_an_agents_behalf() {
    let (mut sc, clock) = begin();
    let purse_id = park_as(&mut sc, &clock, AGENT, 1).purse;
    sc.next_tx(STRANGER);
    let f = sc.take_shared<Facility<USDC>>();
    let purse = sc.take_shared_by_id<Purse<USDC>>(purse_id);
    obligation::park(&f, &purse, 1, clock.timestamp_ms() + WEEK_MS, &clock, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = obligation::EWrongPurse)]
fun an_obligation_only_draws_on_the_purse_it_was_parked_against() {
    let (mut sc, clock) = begin();
    let ob_id = park_as(&mut sc, &clock, AGENT, 10_000).ob;
    let other_purse = park_as(&mut sc, &clock, AGENT, 10_000).purse;
    buy_on_credit(&mut sc, &clock, AGENT, Ids { purse: other_purse, ob: ob_id }, 1);
    finish(sc, clock);
}

// === Collection: both endings ===

#[test]
fun a_funded_purse_repays_on_its_date_with_nobody_trusted() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 15_000);
    earn(&mut sc, ids.purse, 20_000);

    clock.increment_for_testing(WEEK_MS);
    // A stranger runs it: collection needs no keeper Float has to trust.
    collect_as(&mut sc, &clock, STRANGER, ids);

    assert!(status_of(&mut sc, ids.ob) == obligation::status_settled());
    let (debt, liquidity) = facility_state(&mut sc);
    assert!(debt == 0);
    assert!(liquidity == LIQUIDITY);
    let (balance, pledged) = purse_state(&mut sc, ids.purse);
    assert!(balance == 5_000);
    assert!(pledged == 0);
    finish(sc, clock);
}

#[test]
fun an_empty_purse_defaults_in_plain_sight_and_moves_nothing() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, IDLER, 5_000_000);
    buy_on_credit(&mut sc, &clock, IDLER, ids, 10_000);

    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, ids);

    assert!(status_of(&mut sc, ids.ob) == obligation::status_defaulted());
    // The debt stands and keeps consuming the line: a default that returned
    // headroom would make not paying the cheapest way to borrow again.
    let (debt, liquidity) = facility_state(&mut sc);
    assert!(debt == 10_000);
    assert!(liquidity == LIQUIDITY - 10_000);
    let (balance, pledged) = purse_state(&mut sc, ids.purse);
    assert!(balance == 0);
    assert!(pledged == 10_000);
    finish(sc, clock);
}

#[test]
fun a_partly_funded_purse_is_a_default_not_a_partial_sweep() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, IDLER, 5_000_000);
    buy_on_credit(&mut sc, &clock, IDLER, ids, 10_000);
    earn(&mut sc, ids.purse, 9_999);

    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, ids);
    assert!(status_of(&mut sc, ids.ob) == obligation::status_defaulted());
    let (balance, _) = purse_state(&mut sc, ids.purse);
    assert!(balance == 9_999);
    finish(sc, clock);
}

#[test]
fun both_endings_on_one_line() {
    let (mut sc, mut clock) = begin();
    let earner = park_as(&mut sc, &clock, AGENT, 5_000_000);
    let idler = park_as(&mut sc, &clock, IDLER, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, earner, 10_000);
    buy_on_credit(&mut sc, &clock, IDLER, idler, 10_000);
    earn(&mut sc, earner.purse, 15_000);

    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, earner);
    collect_as(&mut sc, &clock, STRANGER, idler);

    assert!(status_of(&mut sc, earner.ob) == obligation::status_settled());
    assert!(status_of(&mut sc, idler.ob) == obligation::status_defaulted());
    let (debt, _) = facility_state(&mut sc);
    assert!(debt == 10_000);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::ENotDue)]
fun nothing_is_collected_before_its_date() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 10_000);
    earn(&mut sc, ids.purse, 10_000);
    collect_as(&mut sc, &clock, STRANGER, ids);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::ENotOpen)]
fun a_settled_obligation_cannot_collect_twice() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 10_000);
    earn(&mut sc, ids.purse, 100_000);
    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, ids);
    collect_as(&mut sc, &clock, STRANGER, ids);
    finish(sc, clock);
}

// === Early settlement and cures ===

#[test]
fun the_agent_can_settle_early_and_the_line_comes_back() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 30_000);
    earn(&mut sc, ids.purse, 30_000);
    settle_as(&mut sc, &clock, AGENT, ids);

    assert!(status_of(&mut sc, ids.ob) == obligation::status_settled());
    let (debt, _) = facility_state(&mut sc);
    assert!(debt == 0);
    finish(sc, clock);
}

#[test]
fun the_human_can_settle_for_their_agent() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 30_000);
    earn(&mut sc, ids.purse, 30_000);
    settle_as(&mut sc, &clock, HUMAN, ids);
    assert!(status_of(&mut sc, ids.ob) == obligation::status_settled());
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::EUnauthorized)]
fun a_stranger_cannot_settle_early() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 30_000);
    earn(&mut sc, ids.purse, 30_000);
    settle_as(&mut sc, &clock, STRANGER, ids);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::EShortfall)]
fun settling_needs_the_money_to_be_there() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 30_000);
    settle_as(&mut sc, &clock, AGENT, ids);
    finish(sc, clock);
}

#[test]
fun a_default_can_be_cured_later() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, IDLER, 5_000_000);
    buy_on_credit(&mut sc, &clock, IDLER, ids, 10_000);
    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, ids);
    assert!(status_of(&mut sc, ids.ob) == obligation::status_defaulted());

    earn(&mut sc, ids.purse, 10_000);
    settle_as(&mut sc, &clock, IDLER, ids);
    assert!(status_of(&mut sc, ids.ob) == obligation::status_settled());
    let (debt, _) = facility_state(&mut sc);
    assert!(debt == 0);
    finish(sc, clock);
}

/// A schedule that fires after the debt is gone charges twice. Repaying the
/// facility directly must leave nothing for the parked obligation to take.
#[test]
fun debt_repaid_another_way_is_not_collected_again() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 40_000);

    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    let change = f.repay(pid(), AGENT, coin::mint_for_testing<USDC>(40_000, sc.ctx()), &clock, sc.ctx());
    change.destroy_zero();
    ts::return_shared(f);

    earn(&mut sc, ids.purse, 100_000);
    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, ids);

    assert!(status_of(&mut sc, ids.ob) == obligation::status_closed());
    let (balance, pledged) = purse_state(&mut sc, ids.purse);
    assert!(balance == 100_000);
    assert!(pledged == 0);
    finish(sc, clock);
}

// === The purse ===

#[test, expected_failure(abort_code = obligation::EPledged)]
fun pledged_earnings_cannot_leave_the_purse() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 30_000);
    earn(&mut sc, ids.purse, 50_000);

    sc.next_tx(AGENT);
    let mut purse = sc.take_shared_by_id<Purse<USDC>>(ids.purse);
    assert!(purse.available() == 20_000);
    obligation::withdraw(&mut purse, 20_001, sc.ctx()).burn_for_testing();
    abort 0
}

#[test]
fun unpledged_earnings_are_the_agents_to_take() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    buy_on_credit(&mut sc, &clock, AGENT, ids, 30_000);
    earn(&mut sc, ids.purse, 50_000);

    sc.next_tx(AGENT);
    let mut purse = sc.take_shared_by_id<Purse<USDC>>(ids.purse);
    obligation::withdraw(&mut purse, 20_000, sc.ctx()).burn_for_testing();
    ts::return_shared(purse);

    settle_as(&mut sc, &clock, AGENT, ids);
    let (balance, pledged) = purse_state(&mut sc, ids.purse);
    assert!(balance == 0 && pledged == 0);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = obligation::ENotAgent)]
fun nobody_else_can_empty_an_agents_purse() {
    let (mut sc, clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    earn(&mut sc, ids.purse, 50_000);
    sc.next_tx(STRANGER);
    let mut purse = sc.take_shared_by_id<Purse<USDC>>(ids.purse);
    obligation::withdraw(&mut purse, 1, sc.ctx()).burn_for_testing();
    abort 0
}

#[test]
fun an_unused_tranche_closes_without_charging_anything() {
    let (mut sc, mut clock) = begin();
    let ids = park_as(&mut sc, &clock, AGENT, 5_000_000);
    earn(&mut sc, ids.purse, 50_000);
    clock.increment_for_testing(WEEK_MS);
    collect_as(&mut sc, &clock, STRANGER, ids);
    assert!(status_of(&mut sc, ids.ob) == obligation::status_closed());
    let (balance, _) = purse_state(&mut sc, ids.purse);
    assert!(balance == 50_000);
    finish(sc, clock);
}
