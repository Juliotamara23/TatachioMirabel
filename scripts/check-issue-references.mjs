#!/usr/bin/env node
/**
 * check-issue-references.mjs
 * Pre-push hook to detect issue references in newly added lines.
 * Reads stdin (local_ref local_sha remote_ref remote_sha), scans diffs for
 * case-insensitive issue-reference patterns in newly added source lines.
 * Exits 1 if any matches found, 0 otherwise.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Source-like file extensions to scan
const SOURCE_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "go", "java", "kt", "rs", "sh",
  "css", "scss", "html"
]);

// Regex to match issue references (case-insensitive)
// Matches issue references using hash, hyphen, or underscore notation.
// Use (?:^|[^\w#]) instead of \b to allow # at start of string or after non-word chars
// Capture group 1 gets the actual issue reference
const ISSUE_REF_REGEX = /(?:^|[^\w#])((?:issues?\s*[#_-]?\s*|#)\d+)\b/gi;

function runCommand(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (result.error) {
    throw new Error(`Failed to run ${cmd} ${args.join(" ")}: ${result.error.message}`);
  }
  return result;
}

function getEmptyTreeSha() {
  // Git's empty tree object SHA
  return "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
}

function isDeleteRef(localSha) {
  return localSha === "0000000000000000000000000000000000000000";
}

function hasSourceExtension(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && SOURCE_EXTENSIONS.has(ext);
}

function getDiffAddedLines(localSha, remoteSha) {
  // Use --unified=0 to get only added lines without context
  // --diff-filter=A only shows added files, but we want added lines in modified files too
  // We'll parse the diff output to extract added lines
  const args = [
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    remoteSha,
    localSha
  ];
  const result = runCommand("git", args);
  return result.stdout;
}

function parseDiffForAddedLines(diffOutput) {
  const findings = [];
  const lines = diffOutput.split("\n");
  let currentFile = null;
  let lineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header: --- a/file or +++ b/file
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6); // Remove "+++ b/"
      continue;
    }

    if (line.startsWith("--- a/")) {
      continue;
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      lineNumber = parseInt(hunkMatch[1], 10) - 1; // Will be incremented on first added line
      continue;
    }

    // Added line
    if (line.startsWith("+") && !line.startsWith("+++")) {
      lineNumber++;
      const content = line.slice(1); // Remove the '+' prefix

      if (currentFile && hasSourceExtension(currentFile)) {
        // Check for issue references
        const matches = content.matchAll(ISSUE_REF_REGEX);
        for (const match of matches) {
          findings.push({
            file: currentFile,
            line: lineNumber,
            text: match[1].trim()
          });
        }
      }
      continue;
    }

    // Removed line or context line - don't increment lineNumber for added lines
    if (!line.startsWith("-") && !line.startsWith(" ")) {
      // Other diff markers, skip
    }
  }

  return findings;
}

function processRefLine(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 4) {
    return null;
  }
  const [localRef, localSha, remoteRef, remoteSha] = parts;
  return { localRef, localSha, remoteSha };
}

async function main() {
  // Read all stdin
  const stdin = readFileSync(0, "utf8").trim();

  if (!stdin) {
    // Empty stdin - nothing to check
    process.exit(0);
  }

  const allFindings = [];

  for (const line of stdin.split("\n")) {
    const ref = processRefLine(line);
    if (!ref) continue;

    const { localRef, localSha, remoteSha } = ref;

    // Skip delete refs (localSha is all zeros)
    if (isDeleteRef(localSha)) {
      continue;
    }

    // For new branches (remoteSha is all zeros), diff against empty tree
    const baseSha = remoteSha === "0000000000000000000000000000000000000000" ? getEmptyTreeSha() : remoteSha;

    try {
      const diffOutput = getDiffAddedLines(localSha, baseSha);
      const findings = parseDiffForAddedLines(diffOutput);
      allFindings.push(...findings);
    } catch (error) {
      // If diff fails (e.g., new branch with no common history), try empty tree
      if (baseSha !== getEmptyTreeSha()) {
        try {
          const diffOutput = getDiffAddedLines(localSha, getEmptyTreeSha());
          const findings = parseDiffForAddedLines(diffOutput);
          allFindings.push(...findings);
        } catch {
          // Ignore diff errors for edge cases
        }
      }
    }
  }

  if (allFindings.length > 0) {
    console.error("[pre-push] Issue references detected in added lines:");
    for (const finding of allFindings) {
      console.error(`  ${finding.file}:${finding.line}: ${finding.text}`);
    }
    console.error("\n[pre-push] Remove issue references from added source lines before pushing.");
    console.error("[pre-push] Use 'git commit --amend' or 'git rebase -i' to fix.");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[pre-push] Unexpected error:", err.message);
  process.exit(1);
});
