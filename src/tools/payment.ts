/**
 * Official NodeLoc Payment API tools (create payment / query / transfer).
 *
 * Signing rules from https://docs.nodeloc.com/api-reference/payment:
 * - params sorted by key name, joined as k1=v1&k2=v2
 * - key = SHA256(payment token)  (hex string, NOT the raw token)
 * - signature = HMAC-SHA256(key, paramString)
 */
import { createHash, createHmac } from "node:crypto";

import * as config from "../config.js";
import { NodeLocError, NotConfigured } from "../client.js";

type Dict = Record<string, string | number>;

function requireCredentials(): void {
  if (!config.PAYMENT_ID || !config.PAYMENT_TOKEN) {
    throw new NotConfigured(
      "Payment credentials missing. Set NODELOC_PAYMENT_ID (pay_xxx) and NODELOC_PAYMENT_TOKEN " +
      "(tk_xxx). Create an app at https://www.nodeloc.com/payment/applications " +
      "(requires TL1+ and admin approval).",
    );
  }
}

function sign(params: Dict): string {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const tokenHash = createHash("sha256").update(config.PAYMENT_TOKEN, "utf-8").digest("hex");
  return createHmac("sha256", tokenHash).update(paramString, "utf-8").digest("hex");
}

async function call(path: string, params: Dict): Promise<unknown> {
  const signed: Dict = { ...params, signature: sign(params) };
  const resp = await fetch(`${config.BASE_URL}/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(Object.entries(signed).map(([k, v]) => [k, String(v)])),
    signal: AbortSignal.timeout(45_000),
  });
  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    throw new NodeLocError(`Payment API returned HTTP ${resp.status} (non-JSON response)`);
  }
  if (resp.status >= 400 || data["success"] === false) {
    throw new NodeLocError(`Payment API error: ${String(data["error"] ?? JSON.stringify(data))}`);
  }
  return data;
}

/** Start a payment. Returns payment_url to redirect the buyer to. */
export async function createPayment(amount: number, description: string, orderId: string): Promise<unknown> {
  requireCredentials();
  return call(`payment/pay/${config.PAYMENT_ID}/process`, { amount, description, order_id: orderId });
}

/** Query a transaction status (pending/processing/completed/failed/cancelled/refunded). */
export async function queryPayment(transactionId: string): Promise<unknown> {
  requireCredentials();
  return call(`payment/query/${config.PAYMENT_ID}`, { transaction_id: transactionId });
}

/**
 * Transfer points from the payment-app owner to another user.
 * Both toUserId and toUsername must refer to the same user.
 * Fees depend on the sender's trust level (TL0 10% .. TL4 0.5%);
 * the sender is charged amount + fee, the recipient receives amount.
 * Idempotent per (payment_id, order_id).
 */
export async function transferPoints(
  toUserId: number, toUsername: string, amount: number, orderId: string,
): Promise<unknown> {
  requireCredentials();
  return call(`payment/transfer/${config.PAYMENT_ID}`, {
    to_user_id: toUserId, to_username: toUsername, amount, order_id: orderId,
  });
}
