// Preload for verification only. Production imports do not use this module.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import child from "node:child_process";
import { fileURLToPath } from "node:url";
import { syncBuiltinESMExports } from "node:module";
let protectedAttempts = 0,
  networkAttempts = 0,
  executionAttempts = 0;
const owner = "/Users/sammii/development/podify/";
function protectedPath(value) {
  if (typeof value === "number" || value == null) return false;
  const name =
    value instanceof URL
      ? fileURLToPath(value)
      : Buffer.isBuffer(value)
        ? value.toString()
        : String(value);
  const absolute = path.resolve(name);
  return (
    absolute.includes("/Library/Application Support/sh.voicebox.app/") ||
    /(?:^|\/)\.env(?:\.|$)/.test(name) ||
    /(?:^|\/)\.podify-output(?:\/|$)/.test(name) ||
    (absolute.startsWith(owner) && !absolute.startsWith(owner + ".git/")) ||
    absolute.startsWith(path.resolve("private") + "/") ||
    absolute.startsWith(path.resolve("interview-prep") + "/")
  );
}
for (const [target, names] of [
  [
    fs,
    [
      "readFileSync",
      "readFile",
      "openSync",
      "open",
      "createReadStream",
      "writeFileSync",
      "writeFile",
      "createWriteStream",
      "rmSync",
      "rm",
      "unlinkSync",
      "unlink",
    ],
  ],
  [fsp, ["readFile", "writeFile", "open", "rm", "unlink"]],
])
  for (const name of names) {
    const original = target[name];
    target[name] = function (...args) {
      if (protectedPath(args[0])) {
        protectedAttempts++;
        throw new Error(
          "Verification guard refused protected runtime or environment file access.",
        );
      }
      return original.apply(this, args);
    };
  }
const refuseNetwork = () => {
  networkAttempts++;
  throw new Error("Network is disconnected during Podify build verification.");
};
globalThis.fetch = async () => refuseNetwork();
for (const target of [http, https])
  for (const key of ["request", "get"]) target[key] = refuseNetwork;
net.connect = refuseNetwork;
net.createConnection = refuseNetwork;
net.Socket.prototype.connect = refuseNetwork;
for (const name of [
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "spawn",
  "spawnSync",
]) {
  const original = child[name];
  child[name] = function (command, ...args) {
    if (
      /ffmpeg|ffprobe|test-voices|cli\/main|batch-generate/.test(
        String(command),
      )
    ) {
      executionAttempts++;
      throw new Error(
        "Generation/media execution is disconnected during build verification.",
      );
    }
    return original.call(this, command, ...args);
  };
}
syncBuiltinESMExports();
process.once("exit", () => {
  if (protectedAttempts || networkAttempts || executionAttempts)
    process.stderr.write(
      JSON.stringify({
        guard: "podify-build-io",
        protectedAttempts,
        networkAttempts,
        executionAttempts,
      }) + "\n",
    );
});
