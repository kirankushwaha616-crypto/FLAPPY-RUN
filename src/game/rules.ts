/** Pure game-economy rules (no browser APIs) so they can be unit tested. */

export const COIN_PICKUP_REWARD = 1;
export const MILESTONE_EVERY = 10;
export const MILESTONE_BONUS = 5;

/** Bonus coins earned when the score reaches `score` after passing a pipe. */
export function milestoneBonus(score: number): number {
  return score > 0 && score % MILESTONE_EVERY === 0 ? MILESTONE_BONUS : 0;
}

export interface Wallet {
  coins: number;
  owned: string[];
}

export type PurchaseResult =
  | { ok: true; wallet: Wallet }
  | { ok: false; reason: "already-owned" | "not-enough-coins" | "invalid-price" };

/** Buy an item: rejects duplicates and insufficient balances, never goes negative. */
export function purchase(wallet: Wallet, itemId: string, price: number): PurchaseResult {
  if (!Number.isFinite(price) || price < 0) return { ok: false, reason: "invalid-price" };
  if (wallet.owned.includes(itemId)) return { ok: false, reason: "already-owned" };
  if (wallet.coins < price) return { ok: false, reason: "not-enough-coins" };
  return { ok: true, wallet: { coins: wallet.coins - price, owned: [...wallet.owned, itemId] } };
}
