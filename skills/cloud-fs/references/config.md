# Configuring cloud-fs

This file covers three flows:

1. **Bootstrap a new project** — no cloud-fs in `.mcp.json` yet.
2. **Persisting to `.mcp.json`** — after a successful one-off session.
3. **Switching or adding a provider** — user has cloud-fs but wants a
   different bucket or backend.

Auto-detect first. Only ask the user what you cannot infer.

---

## Bootstrap a new project

### Step 1 — Find out what the user wants

Auto-detect signals before prompting:

| Signal | What it tells you |
|---|---|
| `AWS_ACCESS_KEY_ID` / `~/.aws/credentials` present | S3 likely |
| `AZURE_STORAGE_CONNECTION_STRING` set | Azure Blob likely |
| `GOOGLE_APPLICATION_CREDENTIALS` set, or `gcloud auth application-default print-access-token` returns a token | GCS likely |
| `.mcp.json` exists with no cloud-fs entry | Project already uses MCP — just append |
| Nothing of the above | Pure prompt — ask which provider the user has access to |

Run these checks (silently — don't print every check):

```bash
test -n "$AWS_ACCESS_KEY_ID" && echo aws-env
test -f "$HOME/.aws/credentials" && echo aws-file
test -n "$AZURE_STORAGE_CONNECTION_STRING" && echo azure-env
test -n "$GOOGLE_APPLICATION_CREDENTIALS" && echo gcs-env
test -f .mcp.json && echo mcp-json
```

### Step 2 — Ask only what's ambiguous

Use `AskUserQuestion`. Phrase questions so the user can pick without
typing a URI by hand when possible.

**If multiple providers are detected**, ask:
```
Question: "I see credentials for more than one provider. Which one
do you want to wire up first?"
Header: "Provider"
Options: each detected provider (e.g. "AWS S3", "Azure Blob", "GCS",
"In-memory demo")
```

**If exactly one provider is detected**, confirm + ask for the bucket
/ container / prefix:
```
Question: "Found AWS credentials. Which S3 bucket (and optional
prefix) should cloud-fs expose?"
Header: "Bucket"
Options:
  - "I'll type it" (with Other input)
  - any buckets/prefixes you can infer from project context
```

**If no credentials are detected**, offer the demo as a no-friction
option:
```
Question: "No cloud credentials detected. Want to try the in-memory
demo (no credentials needed) or set up a real provider?"
Header: "Setup mode"
Options:
  - "In-memory demo (Recommended)" → seeds sample files
  - "AWS S3" → ask for region + bucket, then guide to creds
  - "Azure Blob" → ask for connection string source
  - "GCS" → ask for service account JSON path or ADC
```

For provider-specific follow-up details (regions, endpoints, connection
strings, etc.), see `providers.md`.

### Step 3 — Write the .mcp.json entry

Once you know provider + root URI:

```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@nogoo9/mcp-server-cloud-fs",
        "<provider>",
        "<root-uri>"
      ]
    }
  }
}
```

Add `--region` for S3/GCS, `--endpoint` for MinIO/RustFS, `--sqlite-db`
for SQLite — see `providers.md`.

For env-based credentials (Azure connection string, AWS profile, GCS
key file), put them in an `env` block on the entry:

```json
"env": {
  "AZURE_STORAGE_CONNECTION_STRING": "..."
}
```

**Never embed long-lived secrets directly** — prefer referencing the
user's shell env or a credentials file. If the user wants a connection
string in `.mcp.json`, warn them once that the file is usually
checked into git and ask whether to add it to `.gitignore`.

### Step 4 — Hand off to the user

After writing `.mcp.json`, tell the user:

> Restart Claude Code so the cloud-fs MCP server attaches. After that,
> ask me anything like "list files in the bucket" or "grep TODO in
> reports/" and I'll use the VFS tools directly.

You cannot use `mcp__cloud-fs__*` in this session because MCP servers
are loaded at session start. Don't try.

---

## Persisting to .mcp.json (after first one-off success)

After a successful operation in MCP mode in a session where `.mcp.json`
does **not** yet have a cloud-fs entry, ask:

```
Question: "Want me to save this provider config to .mcp.json so future
Claude Code sessions in this project have cloud-fs pre-wired?"
Header: "Persist"
Options:
  - "Yes, save to .mcp.json"
  - "No, session only"
```

If yes:
1. Read the current `.mcp.json` (if any).
2. Merge in a `cloud-fs` entry that matches the *current session's*
   provider and root. The user is currently using the MCP server, so
   reconstruct the command from `mcp__cloud-fs__list_allowed_directories`
   output + any env vars in scope.
3. Write atomically (read → modify → write the whole file).
4. Confirm with one line + show the diff or just the new entry.

Don't re-ask the persistence question in the same session if the user
already said no.

---

## Switching providers / adding a second root

Two cases:

1. **Same provider, additional root** — append another positional URI to
   `args` in `.mcp.json`:
   ```json
   "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "s3",
            "s3://bucket-a", "s3://bucket-b/prefix"]
   ```
2. **Different provider entirely** — add a second MCP server entry with
   a different name (e.g. `"cloud-fs-azure"`), since one cloud-fs server
   binds to one provider type.

Either change requires a Claude Code restart to take effect.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `mcp__cloud-fs__*` tools not in the available list | Server not in `.mcp.json` or Claude Code not restarted since the entry was added | Bootstrap flow / restart |
| `"Access denied: path is outside allowed roots"` | User asked for a path under a root that isn't configured | Add the root via "switching providers" above, or use a different path |
| `at least one root URI is required` (during bootstrap test) | Forgot to pass a root URI after the provider name | Append `s3://my-bucket` etc. |
| `AZURE_STORAGE_CONNECTION_STRING env var is required` | Azure provider chosen but no connection string in env | Put it in the `env` block on the `.mcp.json` entry |
| `--cache-dir is required when --cache-store fs` | User picked filesystem cache without a directory | Either drop `--cache-store fs` or add `--cache-dir /some/path` |
