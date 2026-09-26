/// The Arc suite, ported: LifelineCreditFacility.t.sol and Exploit.t.sol.
///
/// Each exploit test names the attack it closes on Arc; the Move facility has
/// to refuse the same thing, whether by an address check or by not handing out
/// the capability at all.
#[test_only]
module lifeline::facility_tests;

use lifeline::facility::{Self, Facility, AdminCap};
use sui::clock::{Self, Clock};
use sui::coin;
use sui::test_scenario::{Self as ts, Scenario};

public struct USDC has drop {}

const OPERATOR: address = @0xF1;
const HUMAN: address = @0xA1;
const AGENT: address = @0xA2;
const AGENT2: address = @0xA3;
const STRANGER: address = @0xBAD;

const LIMIT: u64 = 10_000_000; // $10.00

fun pid(): vector<u8> { b"profile-human-1" }

fun root(): vector<u8> { b"world-nullifier-1" }

fun begin(): (Scenario, Clock) {
    let mut sc = ts::begin(OPERATOR);
    let cap = facility::create<USDC>(sc.ctx());
    transfer::public_transfer(cap, OPERATOR);
    let clock = clock::create_for_testing(sc.ctx());
    (sc, clock)
}

fun finish(sc: Scenario, clock: Clock) {
    clock.destroy_for_testing();
    sc.end();
}

/// Lifeline underwrites HUMAN at $10 and authorises AGENT, as the web app does on
/// World verification and agent registration.
fun onboard(sc: &mut Scenario, clock: &Clock) {
    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.create_credit_profile(&cap, pid(), HUMAN, root(), LIMIT, clock);
    f.authorize_agent_as_underwriter(&cap, pid(), AGENT, clock);
    ts::return_shared(f);
    sc.return_to_sender(cap);
}

fun draw_as(sc: &mut Scenario, clock: &Clock, sender: address, agent: address, amount: u64) {
    sc.next_tx(sender);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.record_drawdown(pid(), agent, amount, 1, b"ref", clock, sc.ctx());
    ts::return_shared(f);
}

fun debt(sc: &mut Scenario): u64 {
    sc.next_tx(OPERATOR);
    let f = sc.take_shared<Facility<USDC>>();
    let d = f.outstanding_debt(pid());
    ts::return_shared(f);
    d
}

// === LifelineCreditFacility.t.sol ===

#[test]
fun profile_creation_and_agent_authorization() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);

    sc.next_tx(OPERATOR);
    let f = sc.take_shared<Facility<USDC>>();
    let p = f.profile(pid());
    assert!(p.human_owner() == HUMAN);
    assert!(p.credit_limit() == LIMIT);
    assert!(p.status() == facility::status_active());
    assert!(f.is_agent_authorized(pid(), AGENT));
    assert!(!f.is_agent_authorized(pid(), AGENT2));
    assert!(f.agent_profile_id(AGENT) == pid());
    assert!(f.profile_count() == 1);
    ts::return_shared(f);
    finish(sc, clock);
}

#[test]
fun drawdown_records_debt_without_moving_coins() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    draw_as(&mut sc, &clock, AGENT, AGENT, 2_500_000);

    sc.next_tx(OPERATOR);
    let f = sc.take_shared<Facility<USDC>>();
    assert!(f.outstanding_debt(pid()) == 2_500_000);
    assert!(f.remaining_credit(pid()) == LIMIT - 2_500_000);
    assert!(f.liquidity() == 0);
    let d = f.drawdown(1);
    assert!(d.drawdown_amount() == 2_500_000);
    assert!(d.drawdown_agent() == AGENT);
    ts::return_shared(f);
    finish(sc, clock);
}

#[test]
fun agents_share_one_human_limit() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.authorize_agent(pid(), AGENT2, &clock, sc.ctx());
    ts::return_shared(f);

    draw_as(&mut sc, &clock, AGENT, AGENT, 6_000_000);
    draw_as(&mut sc, &clock, AGENT2, AGENT2, 4_000_000);
    assert!(debt(&mut sc) == LIMIT);

    sc.next_tx(OPERATOR);
    let f = sc.take_shared<Facility<USDC>>();
    assert!(f.remaining_credit(pid()) == 0);
    ts::return_shared(f);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EOverLimit)]
fun second_agent_cannot_exceed_shared_limit() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.authorize_agent(pid(), AGENT2, &clock, sc.ctx());
    ts::return_shared(f);

    draw_as(&mut sc, &clock, AGENT, AGENT, 6_000_000);
    draw_as(&mut sc, &clock, AGENT2, AGENT2, 4_000_001);
    finish(sc, clock);
}

#[test]
fun excess_repayment_is_capped_and_returned() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    draw_as(&mut sc, &clock, AGENT, AGENT, 3_000_000);

    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    let payment = coin::mint_for_testing<USDC>(5_000_000, sc.ctx());
    let change = f.repay(pid(), AGENT, payment, &clock, sc.ctx());
    assert!(change.value() == 2_000_000);
    assert!(f.outstanding_debt(pid()) == 0);
    assert!(f.liquidity() == 3_000_000);
    assert!(f.profile(pid()).total_repaid() == 3_000_000);
    change.burn_for_testing();
    ts::return_shared(f);
    finish(sc, clock);
}

// === Exploit.t.sol ===

#[test]
fun self_registration_grants_zero_credit() {
    let (mut sc, clock) = begin();
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.self_register(pid(), root(), &clock, sc.ctx());
    assert!(f.profile(pid()).credit_limit() == 0);
    assert!(f.profile(pid()).human_owner() == HUMAN);
    ts::return_shared(f);
    finish(sc, clock);
}

/// A borrower cannot raise their own limit: nothing sets a limit without the
/// underwriter's capability. The only move left is to open a facility of their
/// own and present *its* capability to this one - which is refused.
#[test, expected_failure(abort_code = facility::EWrongFacility)]
fun a_capability_from_another_facility_is_refused() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);

    sc.next_tx(OPERATOR);
    let real_cap = sc.take_from_sender<AdminCap>();
    let real_facility = real_cap.cap_facility();
    sc.return_to_sender(real_cap);

    sc.next_tx(HUMAN);
    let rogue = facility::create<USDC>(sc.ctx());
    let mut f = sc.take_shared_by_id<Facility<USDC>>(real_facility);
    f.set_credit_limit(&rogue, pid(), 1_000_000_000);
    abort 0
}

#[test]
fun underwriter_can_still_set_the_limit() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.set_credit_limit(&cap, pid(), 25_000_000);
    assert!(f.profile(pid()).credit_limit() == 25_000_000);
    ts::return_shared(f);
    sc.return_to_sender(cap);
    finish(sc, clock);
}

/// On Arc the profile owner could once clear their own default. Here only the
/// capability sets status; the owner can only suspend.
#[test, expected_failure(abort_code = facility::EProfileNotActive)]
fun defaulter_cannot_borrow_again() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    draw_as(&mut sc, &clock, AGENT, AGENT, 1_000_000);

    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.mark_default(&cap, pid(), &clock);
    assert!(f.profile(pid()).status() == facility::status_defaulted());
    ts::return_shared(f);
    sc.return_to_sender(cap);

    draw_as(&mut sc, &clock, AGENT, AGENT, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EProfileNotActive)]
fun human_may_suspend_themselves_and_then_cannot_draw() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.suspend_own_profile(pid(), sc.ctx());
    assert!(f.profile(pid()).status() == facility::status_suspended());
    assert!(f.remaining_credit(pid()) == 0);
    ts::return_shared(f);

    draw_as(&mut sc, &clock, AGENT, AGENT, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::ENotProfileOwner)]
fun stranger_cannot_suspend_someone_else() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(STRANGER);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.suspend_own_profile(pid(), sc.ctx());
    abort 0
}

/// On Arc, recordRepayment was once open to anyone with payer = themselves.
/// Here the only coin-free repayment needs the capability, and the coin path
/// takes coins. A stranger repaying with coins is paying real money.
#[test]
fun stranger_can_only_clear_debt_by_paying_it() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    draw_as(&mut sc, &clock, AGENT, AGENT, 2_000_000);

    sc.next_tx(STRANGER);
    let mut f = sc.take_shared<Facility<USDC>>();
    let change = f.repay(pid(), AGENT, coin::mint_for_testing<USDC>(0, sc.ctx()), &clock, sc.ctx());
    change.destroy_zero();
    assert!(f.outstanding_debt(pid()) == 2_000_000);
    ts::return_shared(f);
    finish(sc, clock);
}

#[test]
fun operator_can_book_an_offchain_repayment() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    draw_as(&mut sc, &clock, AGENT, AGENT, 2_000_000);

    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    let applied = f.record_repayment(&cap, pid(), HUMAN, AGENT, 5_000_000, &clock);
    assert!(applied == 2_000_000);
    assert!(f.outstanding_debt(pid()) == 0);
    ts::return_shared(f);
    sc.return_to_sender(cap);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::ERootUsed)]
fun one_human_root_cannot_open_a_second_profile() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.create_credit_profile(&cap, b"profile-2", HUMAN, root(), LIMIT, &clock);
    abort 0
}

#[test, expected_failure(abort_code = facility::ERootUsed)]
fun a_self_registered_root_cannot_be_underwritten_again() {
    let (mut sc, clock) = begin();
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.self_register(pid(), root(), &clock, sc.ctx());
    ts::return_shared(f);

    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.create_credit_profile(&cap, b"profile-2", @0xC0, root(), LIMIT, &clock);
    abort 0
}

#[test, expected_failure(abort_code = facility::EHumanHasProfile)]
fun one_self_registered_address_cannot_open_a_second_profile() {
    let (mut sc, clock) = begin();
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.self_register(pid(), b"", &clock, sc.ctx());
    f.self_register(b"profile-2", b"", &clock, sc.ctx());
    abort 0
}

#[test]
fun lifeline_can_onboard_many_humans_from_one_identity() {
    let (mut sc, clock) = begin();
    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.create_credit_profile(&cap, b"p1", OPERATOR, b"root-1", LIMIT, &clock);
    f.create_credit_profile(&cap, b"p2", OPERATOR, b"root-2", LIMIT, &clock);
    f.create_credit_profile(&cap, b"p3", OPERATOR, b"root-3", LIMIT, &clock);
    assert!(f.profile_count() == 3);
    ts::return_shared(f);
    sc.return_to_sender(cap);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::ENeedsHumanRoot)]
fun underwritten_profile_must_carry_a_world_root() {
    let (mut sc, clock) = begin();
    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    f.create_credit_profile(&cap, pid(), HUMAN, b"", LIMIT, &clock);
    abort 0
}

#[test]
fun repaid_coins_are_withdrawable_by_the_underwriter() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    draw_as(&mut sc, &clock, AGENT, AGENT, 4_000_000);

    sc.next_tx(AGENT);
    let mut f = sc.take_shared<Facility<USDC>>();
    let change = f.repay(pid(), AGENT, coin::mint_for_testing<USDC>(4_000_000, sc.ctx()), &clock, sc.ctx());
    change.destroy_zero();
    ts::return_shared(f);

    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    let out = f.withdraw(&cap, 4_000_000, sc.ctx());
    assert!(out.value() == 4_000_000);
    assert!(f.liquidity() == 0);
    out.burn_for_testing();
    ts::return_shared(f);
    sc.return_to_sender(cap);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EInsufficientLiquidity)]
fun cannot_withdraw_more_than_is_held() {
    let (mut sc, _clock) = begin();
    sc.next_tx(OPERATOR);
    let mut f = sc.take_shared<Facility<USDC>>();
    let cap = sc.take_from_sender<AdminCap>();
    let out = f.withdraw(&cap, 1, sc.ctx());
    out.burn_for_testing();
    abort 0
}

#[test]
fun batch_records_one_row_for_many_payments() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(AGENT);
    let mut f = sc.take_shared<Facility<USDC>>();
    let loan = f.record_drawdown(pid(), AGENT, 500_000, 50, b"batch", &clock, sc.ctx());
    assert!(loan == 1);
    assert!(f.next_loan_id() == 2);
    assert!(f.drawdown(1).drawdown_payment_count() == 50);
    assert!(f.drawdown(1).drawdown_reference_hash() == b"batch");
    ts::return_shared(f);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EOverLimit)]
fun batch_still_cannot_exceed_the_limit() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(AGENT);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.record_drawdown(pid(), AGENT, LIMIT + 1, 1_000, b"batch", &clock, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = facility::EEmptyBatch)]
fun batch_must_cover_at_least_one_payment() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(AGENT);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.record_drawdown(pid(), AGENT, 1, 0, b"batch", &clock, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = facility::EUnauthorized)]
fun stranger_cannot_book_debt_against_someone_else() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    draw_as(&mut sc, &clock, STRANGER, AGENT, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EAgentNotAuthorized)]
fun a_revoked_agent_cannot_draw() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(HUMAN);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.revoke_agent(pid(), AGENT, &clock, sc.ctx());
    assert!(!f.is_agent_authorized(pid(), AGENT));
    ts::return_shared(f);
    draw_as(&mut sc, &clock, AGENT, AGENT, 1);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = facility::EUnauthorized)]
fun stranger_cannot_authorize_agents_on_someone_elses_line() {
    let (mut sc, clock) = begin();
    onboard(&mut sc, &clock);
    sc.next_tx(STRANGER);
    let mut f = sc.take_shared<Facility<USDC>>();
    f.authorize_agent(pid(), STRANGER, &clock, sc.ctx());
    abort 0
}
