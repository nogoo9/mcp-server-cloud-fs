---
description: Run a security scan on changed source files using Semgrep and the code-security skill.
---

# Security Scan Workflow

A lightweight SAST gate using Semgrep. Focuses on files changed since the last commit to keep it fast.

## Step 1 — Identify changed files

```bash
git diff --name-only HEAD
```

Filter to TypeScript / JavaScript / config files only (skip docs, markdown, lockfiles).

## Step 2 — Run Semgrep on changed files

Use the `semgrep` skill. If Semgrep MCP tools are available, use `semgrep_scan`. Otherwise fall back to the CLI:

```bash
semgrep --config p/security-audit \
        --config p/owasp-top-ten \
        --error \
        $(git diff --name-only HEAD | grep -E '\.(ts|js|json|yaml|yml)$' | tr '\n' ' ')
```

The `--error` flag exits non-zero if any findings are found at ERROR severity.

## Step 3 — Triage findings

For each finding:

| Severity | Action |
|---|---|
| **ERROR** | Hard block — must fix or add a justified `# nosemgrep: <rule-id>` suppression before continuing |
| **WARNING** | Review — fix if it is a real vulnerability; suppress with justification if it's a false positive |
| **INFO** | Note only — informational, no action required |

Do **not** use blanket `# nosemgrep` without specifying the rule ID. Every suppression must have a comment explaining why it is a false positive.

## Step 4 — Apply the code-security skill

For any ERROR or WARNING finding, consult the `code-security` skill to understand the vulnerability class and apply the correct fix pattern.

## Step 5 — Re-scan after fixes

Re-run Step 2 after applying fixes to confirm zero ERROR-level findings remain.

## Summary

Report:
- Number of files scanned
- Findings by severity (ERROR / WARNING / INFO)
- Any suppressions added (rule ID + justification)
- Final scan result: ✅ clean or ❌ blocked
