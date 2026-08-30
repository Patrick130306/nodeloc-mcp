/** Runtime configuration, loaded from environment variables. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BASE_URL = (process.env.NODELOC_BASE_URL ?? "https://www.nodeloc.com").replace(/\/+$/, "");
export const DOCS_BASE_URL = (process.env.NODELOC_DOCS_BASE_URL ?? "https://docs.nodeloc.com").replace(/\/+$/, "");

export const USERNAME = process.env.NODELOC_USERNAME ?? "";
export const PASSWORD = process.env.NODELOC_PASSWORD ?? "";
export const TIMEZONE = process.env.NODELOC_TIMEZONE ?? "Asia/Shanghai";
export const LOCALE = process.env.NODELOC_LOCALE ?? "zh-CN";
/** 0 = none, 1 = SMS, 2 = TOTP (Discourse second_factor_method) */
export const SECOND_FACTOR_METHOD = process.env.NODELOC_SECOND_FACTOR_METHOD ?? "0";

export const DATA_DIR = process.env.NODELOC_DATA_DIR ?? path.join(os.homedir(), ".nodeloc-mcp");
export const DOCS_CACHE_DIR = path.join(DATA_DIR, "docs-cache");
fs.mkdirSync(DOCS_CACHE_DIR, { recursive: true });

/** Official Payment application credentials (optional). */
export const PAYMENT_ID = process.env.NODELOC_PAYMENT_ID ?? "";     // pay_xxx
export const PAYMENT_TOKEN = process.env.NODELOC_PAYMENT_TOKEN ?? ""; // tk_xxx

/** nodeloc-apps CLI executable for miniprogram tooling (optional). */
export const APPS_CLI = process.env.NODELOC_APPS_CLI ?? "nodeloc-apps";
