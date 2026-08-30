/**
 * Forum tools: topics, posts, private messages, interactions, users,
 * notifications, nested communities (nodes) and chat.
 *
 * Endpoint map comes from the APK reverse-engineering doc (sections C-I).
 */
import { getClient } from "../client.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Dict = Record<string, any>;

// ------------------------------------------------------------------- //
// Trimming helpers — keep MCP payloads compact
// ------------------------------------------------------------------- //
function trimTopic(t: Dict): Dict {
  return {
    id: t.id, title: t.title, slug: t.slug,
    posts_count: t.posts_count, reply_count: t.reply_count, views: t.views,
    like_count: t.like_count, created_at: t.created_at, last_posted_at: t.last_posted_at,
    category_id: t.category_id, pinned: t.pinned, closed: t.closed,
    excerpt: (t.excerpt ?? "").slice(0, 300),
  };
}

function trimPost(p: Dict, maxLen = 6000): Dict {
  const cooked: string = p.cooked ?? "";
  return {
    id: p.id, post_number: p.post_number, username: p.username, name: p.name,
    created_at: p.created_at, updated_at: p.updated_at, like_count: p.like_count,
    reply_to_post_number: p.reply_to_post_number,
    cooked: cooked.length > maxLen ? cooked.slice(0, maxLen) + "..." : cooked,
  };
}

function trimNotification(n: Dict): Dict {
  return {
    id: n.id, notification_type: n.notification_type, read: n.read, created_at: n.created_at,
    display_username: n.display_username, topic_id: n.topic_id, post_number: n.post_number,
    fancy_title: n.fancy_title, excerpt: (n.excerpt ?? "").slice(0, 200),
  };
}

// ------------------------------------------------------------------- //
// Reading
// ------------------------------------------------------------------- //
export async function latestTopics(page = 0): Promise<Dict> {
  const data = (await getClient().get("latest.json", { page })) as Dict;
  const topics: Dict[] = data.topic_list?.topics ?? [];
  return { topics: topics.map(trimTopic), more: !!data.topic_list?.more_topics_url };
}

export async function topTopics(): Promise<Dict> {
  const data = (await getClient().get("top.json")) as Dict;
  return { topics: (data.topic_list?.topics ?? []).map(trimTopic) };
}

export async function getTopic(topicId: number): Promise<Dict> {
  const data = (await getClient().get(`t/${topicId}.json`)) as Dict;
  return {
    id: data.id, title: data.title, category_id: data.category_id,
    posts_count: data.posts_count, created_at: data.created_at,
    posts: (data.post_stream?.posts ?? []).map((p: Dict) => trimPost(p)),
  };
}

export async function categoryTopics(slug: string, categoryId: number, filter = "latest", page = 0): Promise<Dict> {
  const data = (await getClient().get(`c/${slug}/${categoryId}/l/${filter}.json`, { page })) as Dict;
  return { topics: (data.topic_list?.topics ?? []).map(trimTopic) };
}

export async function siteInfo(): Promise<Dict> {
  const data = (await getClient().get("site.json")) as Dict;
  return {
    categories: (data.categories ?? []).map((c: Dict) => ({
      id: c.id, name: c.name, slug: c.slug,
      description: (c.description_text ?? "").slice(0, 200),
    })),
    default_archetype: data.default_archetype,
  };
}

export async function userProfile(username: string): Promise<Dict> {
  const data = (await getClient().get(`u/${encodeURIComponent(username)}.json`)) as Dict;
  const user = data.user ?? data;
  return {
    id: user.id, username: user.username, name: user.name, title: user.title,
    trust_level: user.trust_level, bio: (user.bio_raw ?? "").slice(0, 1000),
    created_at: user.created_at, last_seen_at: user.last_seen_at,
    location: user.location, website: user.website, badge_count: user.badge_count,
  };
}

export async function userSummary(username: string): Promise<unknown> {
  return getClient().get(`u/${encodeURIComponent(username)}/summary.json`);
}

export async function searchUsers(term: string): Promise<Dict[]> {
  const data = (await getClient().get("u/search/users.json", { term })) as Dict;
  return (data.users ?? []).map((u: Dict) => ({
    username: u.username, name: u.name, avatar: u.avatar_template,
  }));
}

export async function currentUser(): Promise<Dict> {
  const client = getClient();
  let data: Dict;
  try {
    data = (await client.get("session/current.json")) as Dict;
  } catch {
    await client.login();
    data = (await client.get("session/current.json")) as Dict;
  }
  const user = data.current_user ?? data;
  return {
    id: user.id, username: user.username, name: user.name, trust_level: user.trust_level,
    unread_notifications: user.unread_notifications,
    unread_high_priority_notifications: user.unread_high_priority_notifications,
    unread_private_messages: user.unread_private_messages,
  };
}

// ------------------------------------------------------------------- //
// Notifications
// ------------------------------------------------------------------- //
export async function notifications(): Promise<Dict> {
  const data = (await getClient().get("notifications.json")) as Dict;
  return { notifications: (data.notifications ?? []).map(trimNotification) };
}

export async function markNotificationsRead(notificationId?: number): Promise<unknown> {
  return getClient().put("notifications/mark-read", notificationId ? { id: notificationId } : {});
}

// ------------------------------------------------------------------- //
// Writing: topics / replies / private messages
// ------------------------------------------------------------------- //
export async function createTopic(title: string, raw: string, categoryId: number): Promise<unknown> {
  return getClient().post("posts", { title, raw, category: categoryId, archetype: "regular" });
}

export async function replyToTopic(topicId: number, raw: string, replyToPostNumber?: number): Promise<unknown> {
  const form: Record<string, string | number> = { raw, topic_id: topicId };
  if (replyToPostNumber) form["reply_to_post_number"] = replyToPostNumber;
  return getClient().post("posts", form);
}

export async function sendPrivateMessage(title: string, raw: string, recipients: string): Promise<unknown> {
  return getClient().post("posts", {
    title, raw, archetype: "private_message", target_recipients: recipients,
  });
}

export async function privateMessages(username?: string): Promise<Dict> {
  const client = getClient();
  let name = username || client.username;
  if (!name) {
    await client.login();
    name = client.username;
  }
  const data = (await client.get(`topics/private-messages/${encodeURIComponent(name)}.json`)) as Dict;
  return { topics: (data.topic_list?.topics ?? []).map(trimTopic) };
}

// ------------------------------------------------------------------- //
// Interactions
// ------------------------------------------------------------------- //
export async function likePost(postId: number): Promise<unknown> {
  return getClient().post("post_actions", { id: postId, post_action_type_id: 2, flag_topic: "false" });
}

export async function unlikePost(postId: number): Promise<unknown> {
  return getClient().del(`post_actions/${postId}`);
}

export async function bookmarkPost(postId: number): Promise<unknown> {
  return getClient().post("bookmarks", { bookmarkable_id: postId, bookmarkable_type: "Post" });
}

export async function votePoll(postId: number, pollName: string, options: string[]): Promise<unknown> {
  return getClient().post("polls/vote", { post_id: postId, poll_name: pollName, "options[]": options });
}

export async function unvotePoll(postId: number, pollName: string): Promise<unknown> {
  return getClient().del("polls/vote", { post_id: postId, poll_name: pollName });
}

// ------------------------------------------------------------------- //
// Nested communities (nodes)
// ------------------------------------------------------------------- //
export async function listNodes(): Promise<unknown> {
  return getClient().get("nodes.json");
}

export async function nodeTopics(slug: string, nodeId: number, sort = "latest", page = 0): Promise<unknown> {
  return getClient().get(`n/${slug}/${nodeId}.json`, { sort, page });
}

export async function nodeChildren(slug: string, nodeId: number, childId: number, sort = "latest", page = 0): Promise<unknown> {
  return getClient().get(`n/${slug}/${nodeId}/children/${childId}.json`, { sort, page });
}

export async function browseNodes(nodeId: number, page = 0, perPage?: number): Promise<unknown> {
  const params: Record<string, number> = { page };
  if (perPage) params["per_page"] = perPage;
  return getClient().get(`node/browse/${nodeId}.json`, params);
}

export async function joinNode(nodeId: number): Promise<unknown> {
  return getClient().post(`node/join/${nodeId}`);
}

export async function leaveNode(nodeId: number): Promise<unknown> {
  return getClient().del(`node/leave/${nodeId}`);
}

export async function createNode(
  name: string, description: string, slug: string, parentCategoryId: number, color?: string,
): Promise<unknown> {
  const form: Record<string, string | number> = {
    name, description, slug, parent_category_id: parentCategoryId,
  };
  if (color) form["color"] = color.replace(/^#/, "");
  return getClient().post("node/create", form);
}

export async function checkNodeSlug(slug: string): Promise<unknown> {
  return getClient().get("node/check-slug", { slug });
}

// ------------------------------------------------------------------- //
// Chat
// ------------------------------------------------------------------- //
export async function chatChannelMessages(channelId: number, pageSize?: number, targetMessageId?: number): Promise<unknown> {
  const params: Record<string, string | number> = { fetch_from_last_read: "true" };
  if (pageSize) params["page_size"] = pageSize;
  if (targetMessageId) params["target_message_id"] = targetMessageId;
  return getClient().get(`chat/api/channels/${channelId}/messages.json`, params);
}

export async function chatThreadMessages(channelId: number, threadId: number, pageSize?: number): Promise<unknown> {
  const params: Record<string, string | number> = { fetch_from_last_read: "true" };
  if (pageSize) params["page_size"] = pageSize;
  return getClient().get(`chat/api/channels/${channelId}/threads/${threadId}/messages.json`, params);
}

export async function sendChatMessage(channelId: number, message: string, threadId?: number): Promise<unknown> {
  const form: Record<string, string | number> = { message };
  if (threadId) form["thread_id"] = threadId;
  return getClient().post(`chat/${channelId}.json`, form);
}

export async function markChatRead(channelId: number, messageId: number): Promise<unknown> {
  return getClient().put(`chat/api/channels/${channelId}/read`, { message_id: messageId });
}
