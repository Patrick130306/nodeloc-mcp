/**
 * NodeLoc knowledge base (docs.nodeloc.com) query tools.
 *
 * The docs site is built with Mintlify and ships an llms.txt index; every page is
 * available as Markdown by appending .md to its path. Pages are cached on disk.
 */
import fs from "node:fs";
import path from "node:path";

import * as config from "../config.js";

const INDEX_TTL_MS = 3600_000;

interface DocEntry {
  title: string;
  url: string;
  desc: string;
}

let indexCache: { fetchedAt: number; entries: DocEntry[] } = { fetchedAt: 0, entries: [] };

const ENTRY_RE = /^- \[(?<title>[^\]]+)\]\((?<url>https:\/\/[^)]+\.md)\):\s*(?<desc>.*)$/;

async function httpGet(url: string): Promise<string> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

async function loadIndex(force = false): Promise<DocEntry[]> {
  if (!force && indexCache.entries.length && Date.now() - indexCache.fetchedAt < INDEX_TTL_MS) {
    return indexCache.entries;
  }
  const text = await httpGet(`${config.DOCS_BASE_URL}/llms.txt`);
  const entries: DocEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ENTRY_RE.exec(line.trim());
    if (m?.groups) {
      entries.push({ title: m.groups["title"], url: m.groups["url"], desc: m.groups["desc"] ?? "" });
    }
  }
  indexCache = { fetchedAt: Date.now(), entries };
  return entries;
}

/** List all knowledge-base pages (title, url, description). */
export async function listPages(): Promise<DocEntry[]> {
  return loadIndex();
}

function cachePath(url: string): string {
  let name = url.replace(/\/+$/, "").split("/").pop() ?? "index";
  if (name.endsWith(".md")) name = name.slice(0, -3);
  const safe = name.replace(/[^A-Za-z0-9_.-]/g, "_") || "index";
  return path.join(config.DOCS_CACHE_DIR, safe + ".md");
}

/** Fetch a docs page as Markdown. `page` may be a full URL, a path like
 * 'energy/checkin', or a page title fragment from the index. */
export async function getPage(page: string): Promise<string> {
  const entries = await loadIndex();
  let url: string | undefined;
  if (page.startsWith("http")) {
    url = page.endsWith(".md") ? page : page + ".md";
  } else {
    const needle = page.replace(/^\/+|\/+$/g, "").toLowerCase();
    for (const e of entries) {
      const p = e.url.replace(config.DOCS_BASE_URL, "").replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");
      if (needle === p.toLowerCase() || needle === e.title.toLowerCase() || p.toLowerCase().includes(needle)) {
        url = e.url;
        break;
      }
    }
    url ??= `${config.DOCS_BASE_URL}/${page.replace(/^\/+|\/+$/g, "")}.md`;
  }

  const cache = cachePath(url);
  try {
    const text = await httpGet(url);
    fs.writeFileSync(cache, text, "utf-8");
    return text;
  } catch (err) {
    if (fs.existsSync(cache)) return fs.readFileSync(cache, "utf-8");
    throw err;
  }
}

/** Search the knowledge base by keyword (titles, descriptions, cached bodies). */
export async function search(keyword: string): Promise<DocEntry[]> {
  const needle = keyword.toLowerCase();
  const results: DocEntry[] = [];
  for (const e of await loadIndex()) {
    if ((e.title + " " + e.desc).toLowerCase().includes(needle)) {
      results.push(e);
      continue;
    }
    const cache = cachePath(e.url);
    try {
      if (fs.existsSync(cache) && fs.readFileSync(cache, "utf-8").toLowerCase().includes(needle)) {
        results.push(e);
      }
    } catch {
      /* ignore unreadable cache */
    }
  }
  return results;
}
