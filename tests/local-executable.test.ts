import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { findLocalExecutable } from "../src/lib/local-executable";

test("detects a tool in a quoted PATH entry and honors explicit overrides", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "ezra executable "));
  const originalPath = process.env.PATH;
  t.after(() => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(directory, { recursive: true, force: true });
  });

  const name = "ezra-test-tool";
  const suffix = process.platform === "win32" ? ".exe" : "";
  const bin = path.join(directory, "bin with spaces");
  const executable = path.join(bin, name + suffix);
  const explicit = path.join(bin, "override" + suffix);
  const incorrect = path.join(bin, "directory" + suffix);
  mkdirSync(bin);
  mkdirSync(incorrect);
  writeFileSync(executable, "", { mode: 0o755 });
  writeFileSync(explicit, "", { mode: 0o755 });
  process.env.PATH = `"${bin}"`;

  assert.equal(findLocalExecutable(name, undefined, []), executable);
  assert.equal(findLocalExecutable(name, explicit, []), explicit);
  assert.equal(findLocalExecutable(name, incorrect, []), null);
});
