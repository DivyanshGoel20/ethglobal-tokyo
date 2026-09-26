import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getHuman, signPayload, unauthenticated } from "./session";
import { getAgentByAddress, agentRail } from "./agentStore";

/**
 * A credential a human issues to their own agent.
 *
 * The question this answers is who is borrowing. Lifeline extends credit to a
 * World-verified human, and an agent spending that line is the whole product -
 * so the agent does not need to consent to anything. The human already did,
 * when they verified and opened the facility. What was missing was any way for
 * an agent running outside the browser to *prove* which human sent it.
 *
 * That is this: a signed bearer token carrying the human's nullifier and a
 * spending cap they chose. It is the card, and issuing it is the authorisation.
 * The agent then spends within a mandate rather than asking permission per
 * purchase, and the party that agreed and the party that owes are the same
 * person again.
 *
 * Signed with the same secret as the session cookie, but stamped with its own
 * type so neither can be replayed as the other - a stolen session cookie must
 * not become a long-lived spending credential.
 */

const TYPE = "agent";

export type AgentGrant = {
  /** World nullifier of the human who issued it. */
  human: string;
  /**
   * debited for a repayment, so the party that spent is the party that owes.
   */
  
  /** Most this agent may borrow, in USDC, across the life of the token. */
  capUsd: number;
  label: string;
  expiresAt: string;
};

type Claims = { typ: string; n: string; cap: number; lbl: string; exp: number; hed?: string };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");

export function mintAgentToken(
  human: string,
  opts: { capUsd: number; days: number; label: string }
): { token: string; grant: AgentGrant } {
  const exp = Math.floor(Date.now() / 1000) + Math.round(opts.days * 86400);
  const claims: Claims = {
    typ: TYPE,
    n: human,
    cap: opts.capUsd,
    lbl: opts.label.slice(0, 64),
    exp,
    
  };
  const payload = b64(claims);
  return {
    token: `${payload}.${signPayload(payload)}`,
    grant: {
      human,
      capUsd: opts.capUsd,
      label: claims.lbl,
      
      expiresAt: new Date(exp * 1000).toISOString(),
    },
  };
}

/** The grant behind a bearer token, or null if it is forged, expired, or a session cookie. */
export function verifyAgentToken(token: string | undefined | null): AgentGrant | null {
  if (!token) return null;

  const cut = token.lastIndexOf(".");
  if (cut < 1) return null;

  const payload = token.slice(0, cut);
  const mac = Buffer.from(token.slice(cut + 1));
  const expected = Buffer.from(signPayload(payload));

  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(mac, expected)) return null;

  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    if (c.typ !== TYPE) return null;
    if (typeof c.n !== "string" || !c.n) return null;
    if (typeof c.cap !== "number" || !(c.cap > 0)) return null;
    if (typeof c.exp !== "number" || c.exp * 1000 <= Date.now()) return null;

    return {
      human: c.n,
      capUsd: c.cap,
      label: typeof c.lbl === "string" ? c.lbl : "",
      
      expiresAt: new Date(c.exp * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Pulls a bearer token out of an Authorization header. */
export const bearerFrom = (header: string | null): string | null =>
  header && /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : null;


export type Spender = {
  /** The World-verified human whose credit line is being spent. */
  human: string;
  /**
   * Ceiling on this caller's borrowing, when they hold a mandate rather than a
   * browser session. Undefined means the human is here themselves and only
   * their facility limit applies.
   */
  capUsd?: number;
  via: "session" | "mandate";
};

/**
 * Who is spending, and are they allowed to spend through this agent.
 *
 * Deliberately separate from the administrative path. A browser session is the
 * human present in person and can do anything - register agents, delete them,
 * issue new mandates. A mandate is a card: it authorises spending against one
 * line up to one cap, and nothing else. Were the two conflated, a leaked token
 * would be able to mint itself a larger one.
 *
 * Both rails funnel through here, so a mandate works the same on Arc as it does
 * read it, which made "one credit line" true only if you never used the other
 * half of it.
 */
export function resolveSpender(
  req: NextRequest,
  agentAddress: string,
  /** The rail this route spends on. An agent belongs to one rail only. */
  rail?: "arc" | "sui"
): { spender: Spender } | { error: NextResponse } {
  const grant = verifyAgentToken(bearerFrom(req.headers.get("authorization")));
  const sessionHuman = getHuman(req);

  const spender: Spender | null = sessionHuman
    ? { human: sessionHuman, via: "session" }
    : grant
      ? { human: grant.human, capUsd: grant.capUsd, via: "mandate" }
      : null;

  if (!spender) return { error: unauthenticated() };

  const agent = getAgentByAddress(agentAddress);
  if (!agent) {
    return {
      error: NextResponse.json(
        { error: "No such agent in the Lifeline registry.", code: "unknown_agent" },
        { status: 404 }
      ),
    };
  }

  // A mandate is scoped to the human who issued it, not to the world. Spending
  // through someone else's agent is refused however you arrived.
  if ((agent.humanOwner || "").toLowerCase() !== spender.human.toLowerCase()) {
    return {
      error: NextResponse.json(
        { error: "That agent belongs to a different human.", code: "not_your_agent" },
        { status: 403 }
      ),
    };
  }

  if (rail && agentRail(agent) !== rail) {
    return {
      error: NextResponse.json(
        {
          error: `That agent is on the ${agentRail(agent) === "sui" ? "Sui" : "Arc"} line; it cannot spend or repay on ${rail === "sui" ? "Sui" : "Arc"}.`,
          code: "wrong_rail",
        },
        { status: 400 }
      ),
    };
  }

  return { spender };
}

/**
 * Who is asking, on a route that only reads.
 *
 * The spending path needs an agent to spend through; a read does not, so this
 * answers the smaller question: is anyone here, and which human are they. The
 * answer replaces the identifier these routes used to take off the query
 * string - `?humanOwner=` and `?human=` named whose ledger to return and were
 * believed, so a nullifier was the only thing standing between a stranger and
 * someone's entire payment history.
 *
 * A mandate can read what it can spend against. It cannot name a different
 * human, because the human it reports is the one signed into the token.
 */
export function resolveReader(req: NextRequest): Spender | null {
  const sessionHuman = getHuman(req);
  if (sessionHuman) return { human: sessionHuman, via: "session" };

  const grant = verifyAgentToken(bearerFrom(req.headers.get("authorization")));
  return grant ? { human: grant.human, capUsd: grant.capUsd, via: "mandate" } : null;
}

/**
 * The reader, plus confirmation that this agent is theirs to look at.
 *
 * Agent-scoped reads took an address and answered for whoever owned it. The
 * address is public - it is on chain - so that made every agent's credit,
 * loans and balance readable by anyone who had seen one transaction.
 */
export function resolveAgentReader(
  req: NextRequest,
  agentAddress: string
): { spender: Spender } | { error: NextResponse } {
  const spender = resolveReader(req);
  if (!spender) return { error: unauthenticated() };

  const agent = getAgentByAddress(agentAddress);
  if (!agent) {
    return {
      error: NextResponse.json(
        { error: "No such agent in the Lifeline registry.", code: "unknown_agent" },
        { status: 404 }
      ),
    };
  }

  if ((agent.humanOwner || "").toLowerCase() !== spender.human.toLowerCase()) {
    return {
      error: NextResponse.json(
        { error: "That agent belongs to a different human.", code: "not_your_agent" },
        { status: 403 }
      ),
    };
  }

  return { spender };
}

/** Refusal for a drawdown that would exceed the caller's mandate. */
export const overMandate = (wanted: number, cap: number) =>
  NextResponse.json(
    {
      success: false,
      error:
        `Declined: ${wanted.toFixed(6)} USDC exceeds the ${cap.toFixed(6)} USDC cap on this ` +
        `agent's mandate. Your human can issue a larger one.`,
      code: "over_mandate",
    },
    { status: 403 }
  );

/**
 * Is there any credential behind this request at all?
 *
 * Cheap, and independent of the body. Routes that validate their input before
 * authenticating end up answering an anonymous caller with a 400 that describes
 * the request schema - a small leak, and an inconsistency that makes an
 * unauthenticated probe look like it got further than it did.
 */
export function hasCredential(req: NextRequest): boolean {
  return (
    !!getHuman(req) ||
    !!verifyAgentToken(bearerFrom(req.headers.get("authorization")))
  );
}
