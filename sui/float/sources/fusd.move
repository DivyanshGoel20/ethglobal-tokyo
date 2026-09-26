/// A 6-decimal test dollar for demos.
///
/// The facility is generic over its coin, and on Sui testnet it can lend
/// Circle's USDC as it is. But testnet USDC comes from a faucet with a captcha,
/// which no script or CI run can pass - so the demos lend this instead, minted
/// in small amounts to anyone who asks. It is worth exactly nothing.
module float::fusd;

use sui::coin::{Coin, TreasuryCap};
use sui::coin_registry;

/// No single mint larger than this, so the faucet stays a faucet.
const MAX_MINT: u64 = 1_000 * 1_000_000;

#[error]
const ETooMuch: vector<u8> = b"Faucet mints at most 1000 FUSD per call";

public struct FUSD has drop {}

public struct Faucet has key {
    id: UID,
    cap: TreasuryCap<FUSD>,
}

fun init(otw: FUSD, ctx: &mut TxContext) {
    let (builder, cap) = coin_registry::new_currency_with_otw(
        otw,
        6,
        b"FUSD".to_string(),
        b"Float Test Dollar".to_string(),
        b"A worthless 6-decimal dollar for exercising Float on Sui".to_string(),
        b"".to_string(),
        ctx,
    );
    let metadata_cap = builder.finalize(ctx);
    transfer::public_transfer(metadata_cap, ctx.sender());
    transfer::share_object(Faucet { id: object::new(ctx), cap });
}

public fun mint(faucet: &mut Faucet, amount: u64, ctx: &mut TxContext): Coin<FUSD> {
    assert!(amount <= MAX_MINT, ETooMuch);
    faucet.cap.mint(amount, ctx)
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(FUSD {}, ctx)
}
