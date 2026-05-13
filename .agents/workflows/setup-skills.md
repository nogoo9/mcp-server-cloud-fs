---
description: Install the default AI agent skills required for development workflows in this project.
---

# Setup Agent Skills

The `.agents/skills/` directory is listed in `.gitignore`. Skills are installed from [semgrep/skills](https://github.com/semgrep/skills) using the `skills` CLI.

## Install

```bash
bun x skills add semgrep/skills
```

This installs all three required skills into `.agents/skills/`:

| Skill | Purpose |
|---|---|
| `semgrep` | SAST scanning — used by the `/security` workflow |
| `code-security` | Secure coding guidelines for TypeScript/Node.js |
| `llm-security` | OWASP LLM Top 10 for AI-adjacent code reviews |

## Verification

```bash
ls .agents/skills/
# Expected: code-security  llm-security  semgrep
```

## Updating skills

To update to the latest version:

```bash
bun x skills add semgrep/skills
```

Re-run the same command — it overwrites the existing installation.
