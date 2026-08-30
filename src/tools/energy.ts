/**
 * Energy (points) tools: daily check-in, red envelopes, rewards/tips, points history.
 *
 * Endpoint details from the APK reverse-engineering doc (section H).
 */
import { randomUUID } from "node:crypto";

import * as config from "../config.js";
import { getClient } from "../client.js";

/** Daily check-in. Uses the app's anti-abuse contract: a UUID nonce (no dashes),
 * a millisecond timestamp, and the X-Discourse-Checkin / X-Checkin-Nonce headers. */
export async function checkin(): Promise<unknown> {
  const nonce = randomUUID().replace(/-/g, "");
  const timestamp = Date.now();
  return getClient().request("POST", "checkin", {
    form: { nonce, timestamp },
    extraHeaders: {
      "X-Discourse-Checkin": "true",
      "X-Checkin-Nonce": nonce,
      "Accept-Language": config.LOCALE,
    },
  });
}

/** Create a red envelope inside a topic: totalPoints split into totalCount shares. */
export async function createRedEnvelope(topicId: number, totalPoints: number, totalCount: number): Promise<unknown> {
  return getClient().post("red-envelopes.json", {
    topic_id: topicId, total_points: totalPoints, total_count: totalCount,
  });
}

/** Tip energy points to a post author. */
export async function giveReward(postId: number, amount: number, note?: string): Promise<unknown> {
  const form: Record<string, string | number> = { post_id: postId, amount };
  if (note) form["note"] = note;
  return getClient().post("reward/give", form);
}

async function resolveUsername(username?: string): Promise<string> {
  const client = getClient();
  if (username) return username;
  if (!client.username) await client.login();
  return client.username;
}

/** Energy points income/expense history. */
export async function pointsHistory(username?: string): Promise<unknown> {
  const name = await resolveUsername(username);
  return getClient().get(`u/${encodeURIComponent(name)}/points-history.json`);
}

/** Energy points score breakdown. */
export async function pointsScores(username?: string): Promise<unknown> {
  const name = await resolveUsername(username);
  return getClient().get(`u/${encodeURIComponent(name)}/points-scores.json`);
}
