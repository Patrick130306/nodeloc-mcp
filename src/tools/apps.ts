/**
 * Wrapper around the official `nodeloc-apps` CLI for in-site miniprograms.
 *
 * The CLI covers login, project init, playtest (hot reload) and review submission.
 * Install: see https://docs.nodeloc.com/miniprogram/quickstart
 */
import { execFile } from "node:child_process";

import * as config from "../config.js";
import { NodeLocError } from "../client.js";

const TIMEOUT_MS = 120_000;

/** Naive shell-style split supporting double quotes. */
function splitArgs(command: string): string[] {
  const m = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return m.map((s) => s.replace(/^"|"$/g, ""));
}

/** Run a nodeloc-apps CLI command, e.g. "init my-app", "playtest", "submit".
 * Interactive flows (e.g. `login` opening a browser) may not work through this
 * non-interactive wrapper; run those once in a terminal yourself. */
export async function runAppsCli(
  command: string, cwd?: string,
): Promise<{ command: string; exitCode: number; stdout: string; stderr: string }> {
  const args = splitArgs(command);
  if (!args.length) throw new NodeLocError("Empty CLI command.");
  return new Promise((resolve, reject) => {
    execFile(
      config.APPS_CLI, args,
      { cwd, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, shell: process.platform === "win32" },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new NodeLocError(
            `nodeloc-apps CLI not found (looked for '${config.APPS_CLI}' in PATH). ` +
            "Install it per https://docs.nodeloc.com/miniprogram/quickstart " +
            "or set NODELOC_APPS_CLI to its full path.",
          ));
          return;
        }
        if (error && (error as { killed?: boolean }).killed) {
          reject(new NodeLocError(`CLI timed out after ${TIMEOUT_MS / 1000}s: ${command}`));
          return;
        }
        resolve({
          command: `${config.APPS_CLI} ${command}`,
          exitCode: error && typeof error.code === "number" ? error.code : 0,
          stdout: String(stdout).slice(-8000),
          stderr: String(stderr).slice(-4000),
        });
      },
    );
  });
}
