#[test_only]
module lifeline::fusd_tests;

use lifeline::fusd::{Self, Faucet};
use sui::test_scenario as ts;

#[test]
fun anyone_can_mint_a_little() {
    let mut sc = ts::begin(@0xF1);
    fusd::init_for_testing(sc.ctx());
    sc.next_tx(@0xA1);
    let mut faucet = sc.take_shared<Faucet>();
    let coins = fusd::mint(&mut faucet, 25_000_000, sc.ctx());
    assert!(coins.value() == 25_000_000);
    coins.burn_for_testing();
    ts::return_shared(faucet);
    sc.end();
}

#[test, expected_failure(abort_code = fusd::ETooMuch)]
fun nobody_can_mint_a_lot() {
    let mut sc = ts::begin(@0xF1);
    fusd::init_for_testing(sc.ctx());
    sc.next_tx(@0xA1);
    let mut faucet = sc.take_shared<Faucet>();
    fusd::mint(&mut faucet, 1_000_000_001, sc.ctx()).burn_for_testing();
    abort 0
}
