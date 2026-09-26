import { getHold, resolveHold, type HeldPayment } from "./holdStore";
import { getAgentByAddress } from "./agentStore";
import { getAgentPrivateKey } from "./agentKeys";
import { LifelineSigner, type LifelinePayResult } from "./lifelineSigner";
import { invalidateTelemetryCache } from "./telemetryCache";

/**
 * The checks every answer to a held payment goes through, whoever asks.
 * `null` means the hold may be answered by this human.
 */
export function holdProblem(holdId: string, human: string): { status: number; error: string } | null {
  const hold = getHold(holdId);
  if (!hold || hold.human.toLowerCase() !== human.toLowerCase()) return { status: 404, error: "No such held payment." };
  if (hold.status !== "held") return { status: 409, error: `Already ${hold.status}.` };
  if (hold.expiresAt < Date.now()) return { status: 410, error: "That hold has expired; ask the agent to try again." };
  const agent = getAgentByAddress(hold.agentAddress);
  if (!agent || (agent.humanOwner || "").toLowerCase() !== human.toLowerCase()) {
    return { status: 403, error: "That agent is no longer yours." };
  }
  return null;
}

/**
 * Release a held payment the human has approved. It is screened again on the
 * way out: a hold can be waved through, a refusal cannot.
 */
export async function releaseHeldPayment(
  holdId: string,
  human: string
): Promise<{ ok: true; result: LifelinePayResult; hold: HeldPayment } | { ok: false; status: number; error: string }> {
  const problem = holdProblem(holdId, human);
  if (problem) return { ok: false, ...problem };

  // Resolved before paying, so a double tap cannot pay twice.
  const hold = resolveHold(holdId, "approved")!;
  const result = await new LifelineSigner().pay(
    hold.url,
    {
      agentAddress: hold.agentAddress,
      agentPrivateKey: getAgentPrivateKey(hold.agentAddress) || undefined,
      humanProfileId: human,
      humanApproved: true,
    },
    { method: hold.method, body: hold.body }
  );
  invalidateTelemetryCache(human);
  return { ok: true, result, hold };
}
