/**
 * NodeLoc MCP server entry point.
 *
 * Exposes forum, energy, payment, docs and miniprogram tools over MCP (stdio).
 * Tool descriptions are in English; the underlying community is Chinese.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import * as apps from "./tools/apps.js";
import * as docs from "./tools/docs.js";
import * as energy from "./tools/energy.js";
import * as forum from "./tools/forum.js";
import * as payment from "./tools/payment.js";

const server = new McpServer(
  { name: "nodeloc", version: "0.1.0" },
  {
    instructions:
      "Tools for the NodeLoc community (nodeloc.com, a Discourse-based forum): " +
      "browse/post topics, private messages, likes/bookmarks/polls, nested " +
      "communities (nodes), chat, daily check-in, red envelopes, energy-point " +
      "rewards, official payment/transfer API, knowledge-base lookup, and " +
      "miniprogram CLI operations. Authenticated tools require NODELOC_USERNAME " +
      "and NODELOC_PASSWORD; the session is established automatically on first use.",
  },
);

function asJson(value: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function tool(
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  handler: (args: never) => Promise<unknown>,
): void {
  server.registerTool(name, { description, inputSchema: schema }, async (args) =>
    asJson(await handler(args as never)),
  );
}

// ------------------------------------------------------------------ //
// Account
// ------------------------------------------------------------------ //
tool(
  "get_current_user",
  "Get the currently logged-in NodeLoc user (id, username, trust level, unread notification counts). Logs in automatically if needed.",
  {},
  async () => forum.currentUser(),
);

// ------------------------------------------------------------------ //
// Forum — reading
// ------------------------------------------------------------------ //
tool("list_latest_topics", "List latest topics on the forum homepage. Anonymous; page starts at 0.",
  { page: z.number().int().min(0).optional().describe("Page number, starts at 0") },
  async ({ page }: { page?: number }) => forum.latestTopics(page ?? 0));

tool("list_top_topics", "List top/trending topics. Anonymous.", {},
  async () => forum.topTopics());

tool("read_topic", "Read a topic with its posts (trimmed HTML bodies). Anonymous.",
  { topic_id: z.number().int().describe("Topic id") },
  async ({ topic_id }: { topic_id: number }) => forum.getTopic(topic_id));

tool("list_category_topics", "List topics in a category. `filter` is typically 'latest' or 'top'. Anonymous.",
  {
    slug: z.string().describe("Category slug"),
    category_id: z.number().int().describe("Category id"),
    filter: z.string().optional().describe("latest | top"),
    page: z.number().int().min(0).optional(),
  },
  async ({ slug, category_id, filter, page }: { slug: string; category_id: number; filter?: string; page?: number }) =>
    forum.categoryTopics(slug, category_id, filter ?? "latest", page ?? 0));

tool("get_site_info", "Get site configuration: categories (id/name/slug) etc. Anonymous.", {},
  async () => forum.siteInfo());

tool("get_user_profile", "Get a user's public profile (trust level, bio, stats). Anonymous.",
  { username: z.string() },
  async ({ username }: { username: string }) => forum.userProfile(username));

tool("get_user_summary", "Get a user's activity summary (posts, likes, badges). Anonymous.",
  { username: z.string() },
  async ({ username }: { username: string }) => forum.userSummary(username));

tool("search_users", "Search users by name/username, e.g. to resolve @mentions or PM recipients.",
  { term: z.string().describe("Search term") },
  async ({ term }: { term: string }) => forum.searchUsers(term));

tool("list_notifications", "List notifications for the logged-in user (mentions, replies, likes, PMs).", {},
  async () => forum.notifications());

tool("mark_notifications_read", "Mark all notifications as read, or a single one when notification_id is given.",
  { notification_id: z.number().int().optional() },
  async ({ notification_id }: { notification_id?: number }) => forum.markNotificationsRead(notification_id));

tool("list_private_messages", "List private-message topics of a user (defaults to the logged-in user).",
  { username: z.string().optional() },
  async ({ username }: { username?: string }) => forum.privateMessages(username));

// ------------------------------------------------------------------ //
// Forum — writing
// ------------------------------------------------------------------ //
tool("create_topic", "Create a new topic. `raw` is Markdown; category_id from get_site_info.",
  {
    title: z.string().describe("Topic title"),
    raw: z.string().describe("Markdown body"),
    category_id: z.number().int().describe("Category id (see get_site_info)"),
  },
  async ({ title, raw, category_id }: { title: string; raw: string; category_id: number }) =>
    forum.createTopic(title, raw, category_id));

tool("reply_to_topic", "Reply to a topic (Markdown body). Optionally reply to a specific post number.",
  {
    topic_id: z.number().int(),
    raw: z.string().describe("Markdown body"),
    reply_to_post_number: z.number().int().optional(),
  },
  async ({ topic_id, raw, reply_to_post_number }: { topic_id: number; raw: string; reply_to_post_number?: number }) =>
    forum.replyToTopic(topic_id, raw, reply_to_post_number));

tool("send_private_message", "Send a private message. `recipients`: comma-separated usernames.",
  {
    title: z.string(),
    raw: z.string().describe("Markdown body"),
    recipients: z.string().describe("Comma-separated usernames"),
  },
  async ({ title, raw, recipients }: { title: string; raw: string; recipients: string }) =>
    forum.sendPrivateMessage(title, raw, recipients));

tool("like_post", "Like a post.",
  { post_id: z.number().int() },
  async ({ post_id }: { post_id: number }) => forum.likePost(post_id));

tool("unlike_post", "Remove a like from a post.",
  { post_id: z.number().int() },
  async ({ post_id }: { post_id: number }) => forum.unlikePost(post_id));

tool("bookmark_post", "Bookmark a post.",
  { post_id: z.number().int() },
  async ({ post_id }: { post_id: number }) => forum.bookmarkPost(post_id));

tool("vote_poll", "Vote in a poll attached to a post. `options`: the chosen option values.",
  {
    post_id: z.number().int(),
    poll_name: z.string(),
    options: z.array(z.string()).describe("Chosen option values"),
  },
  async ({ post_id, poll_name, options }: { post_id: number; poll_name: string; options: string[] }) =>
    forum.votePoll(post_id, poll_name, options));

tool("unvote_poll", "Retract a poll vote.",
  { post_id: z.number().int(), poll_name: z.string() },
  async ({ post_id, poll_name }: { post_id: number; poll_name: string }) =>
    forum.unvotePoll(post_id, poll_name));

// ------------------------------------------------------------------ //
// Nodes (nested communities)
// ------------------------------------------------------------------ //
tool("list_nodes", "List all nested communities (nodes) and my memberships.", {},
  async () => forum.listNodes());

tool("list_node_topics", "List topics inside a node (nested community).",
  {
    slug: z.string(), node_id: z.number().int(),
    sort: z.string().optional().describe("Sort order, default 'latest'"),
    page: z.number().int().min(0).optional(),
  },
  async ({ slug, node_id, sort, page }: { slug: string; node_id: number; sort?: string; page?: number }) =>
    forum.nodeTopics(slug, node_id, sort ?? "latest", page ?? 0));

tool("join_node", "Join a node (nested community).",
  { node_id: z.number().int() },
  async ({ node_id }: { node_id: number }) => forum.joinNode(node_id));

tool("leave_node", "Leave a node (nested community).",
  { node_id: z.number().int() },
  async ({ node_id }: { node_id: number }) => forum.leaveNode(node_id));

tool("create_node", "Create a new node (nested community). `color` is an optional hex color.",
  {
    name: z.string(), description: z.string(), slug: z.string(),
    parent_category_id: z.number().int(),
    color: z.string().optional().describe("Optional hex color, e.g. #FF6600"),
  },
  async (a: { name: string; description: string; slug: string; parent_category_id: number; color?: string }) =>
    forum.createNode(a.name, a.description, a.slug, a.parent_category_id, a.color));

tool("check_node_slug", "Check whether a node slug is available before creating a node.",
  { slug: z.string() },
  async ({ slug }: { slug: string }) => forum.checkNodeSlug(slug));

// ------------------------------------------------------------------ //
// Chat
// ------------------------------------------------------------------ //
tool("get_chat_messages", "Fetch messages of a chat channel (paginated).",
  { channel_id: z.number().int(), page_size: z.number().int().optional() },
  async ({ channel_id, page_size }: { channel_id: number; page_size?: number }) =>
    forum.chatChannelMessages(channel_id, page_size));

tool("get_chat_thread_messages", "Fetch messages of a chat thread inside a channel.",
  { channel_id: z.number().int(), thread_id: z.number().int(), page_size: z.number().int().optional() },
  async ({ channel_id, thread_id, page_size }: { channel_id: number; thread_id: number; page_size?: number }) =>
    forum.chatThreadMessages(channel_id, thread_id, page_size));

tool("send_chat_message", "Send a chat message to a channel, optionally into a thread.",
  { channel_id: z.number().int(), message: z.string(), thread_id: z.number().int().optional() },
  async ({ channel_id, message, thread_id }: { channel_id: number; message: string; thread_id?: number }) =>
    forum.sendChatMessage(channel_id, message, thread_id));

tool("mark_chat_read", "Mark a chat channel as read up to a message id.",
  { channel_id: z.number().int(), message_id: z.number().int() },
  async ({ channel_id, message_id }: { channel_id: number; message_id: number }) =>
    forum.markChatRead(channel_id, message_id));

// ------------------------------------------------------------------ //
// Energy (points)
// ------------------------------------------------------------------ //
tool("checkin", "Perform the daily check-in and collect energy points. Once per day; a repeated call returns the 'already checked in' result from the server.",
  {}, async () => energy.checkin());

tool("create_red_envelope", "Create a red envelope in a topic: total_points energy split into total_count shares, claimable by users who reply.",
  {
    topic_id: z.number().int(),
    total_points: z.number().int().positive(),
    total_count: z.number().int().positive(),
  },
  async ({ topic_id, total_points, total_count }: { topic_id: number; total_points: number; total_count: number }) =>
    energy.createRedEnvelope(topic_id, total_points, total_count));

tool("give_reward", "Tip energy points to the author of a post.",
  {
    post_id: z.number().int(),
    amount: z.number().int().positive(),
    note: z.string().optional(),
  },
  async ({ post_id, amount, note }: { post_id: number; amount: number; note?: string }) =>
    energy.giveReward(post_id, amount, note));

tool("get_points_history", "Get energy points income/expense history (defaults to the logged-in user).",
  { username: z.string().optional() },
  async ({ username }: { username?: string }) => energy.pointsHistory(username));

tool("get_points_scores", "Get energy points score breakdown (defaults to the logged-in user).",
  { username: z.string().optional() },
  async ({ username }: { username?: string }) => energy.pointsScores(username));

// ------------------------------------------------------------------ //
// Official Payment API (requires NODELOC_PAYMENT_ID / NODELOC_PAYMENT_TOKEN)
// ------------------------------------------------------------------ //
tool("payment_create", "Create a payment request (official Payment API). Returns a payment_url the buyer must open to pay. `order_id` is your unique order reference.",
  {
    amount: z.number().int().positive().describe("Amount in energy points"),
    description: z.string(),
    order_id: z.string().describe("Your unique order reference"),
  },
  async ({ amount, description, order_id }: { amount: number; description: string; order_id: string }) =>
    payment.createPayment(amount, description, order_id));

tool("payment_query", "Query the status of a payment transaction (official Payment API).",
  { transaction_id: z.string() },
  async ({ transaction_id }: { transaction_id: string }) => payment.queryPayment(transaction_id));

tool("payment_transfer", "Transfer energy points from the payment-app owner to a user (official Payment API). to_user_id and to_username must refer to the same user. Sender pays a trust-level-based fee; idempotent per order_id.",
  {
    to_user_id: z.number().int(),
    to_username: z.string(),
    amount: z.number().int().positive(),
    order_id: z.string().describe("Your unique order reference (idempotency key)"),
  },
  async ({ to_user_id, to_username, amount, order_id }: { to_user_id: number; to_username: string; amount: number; order_id: string }) =>
    payment.transferPoints(to_user_id, to_username, amount, order_id));

// ------------------------------------------------------------------ //
// Knowledge base (docs.nodeloc.com)
// ------------------------------------------------------------------ //
tool("docs_list_pages", "List all pages of the NodeLoc knowledge base (title, url, description).", {},
  async () => docs.listPages());

tool("docs_get_page", "Fetch a knowledge-base page as Markdown. `page` can be a full URL, a path like 'energy/checkin', or a title fragment from docs_list_pages.",
  { page: z.string() },
  async ({ page }: { page: string }) => docs.getPage(page));

tool("docs_search", "Search the knowledge base by keyword (titles, descriptions, cached bodies).",
  { keyword: z.string() },
  async ({ keyword }: { keyword: string }) => docs.search(keyword));

// ------------------------------------------------------------------ //
// Miniprograms (nodeloc-apps CLI)
// ------------------------------------------------------------------ //
tool("apps_cli", "Run an official nodeloc-apps CLI command for in-site miniprograms, e.g. 'init my-app', 'playtest', 'submit'. Requires the CLI installed and logged in (interactive `login` must be done once in a terminal yourself). `cwd`: project directory to run in.",
  {
    command: z.string().describe("CLI arguments, e.g. 'init my-app' or 'submit'"),
    cwd: z.string().optional().describe("Project directory to run in"),
  },
  async ({ command, cwd }: { command: string; cwd?: string }) => apps.runAppsCli(command, cwd));

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("nodeloc-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
