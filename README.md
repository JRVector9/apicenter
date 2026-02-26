# API Center

> One CLI to manage secrets across any backend.
> Stop copy-pasting `.env` files. Start syncing secrets.

[![CI](https://github.com/your-org/apicenter/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/apicenter/actions)
[![npm version](https://img.shields.io/npm/v/apicenter.svg)](https://www.npmjs.com/package/apicenter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why API Center?

| | Before | After |
|---|---|---|
| New team member | Copy `.env` from Slack/Notion | `apicenter pull` |
| Environment sync | Manual, error-prone | `apicenter diff` + `apicenter pull` |
| Secret leak | `.env` accidentally committed | gitignore enforced by `apicenter init` |
| Multiple backends | Locked into one service | Swap providers in one line of config |

- 🔌 **Any backend** — Infisical, Vault, AWS Secrets Manager, Doppler, 1Password, or plain `.env` files
- 🔍 **Auto-detect** — Scan existing projects to find all env vars instantly
- 🔒 **Secure by default** — Secrets never appear in logs, git history, or terminal output
- 🚀 **Zero-config start** — Works with `.env` files out of the box; upgrade to a vault when ready

---

## Installation

```bash
# npm
npm install -g apicenter

# pnpm
pnpm add -g apicenter
```

---

## Quick Start

```bash
# 1. Initialize project (creates apicenter.yaml)
apicenter init

# 2. Detect existing env vars in your source code
apicenter scan

# 3. Sync secrets from provider to local .env.local
apicenter pull

# 4. Check what changed before pushing
apicenter diff

# 5. Run your app with secrets injected (no file created)
apicenter run -- npm start
```

---

## Commands

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `init` | Initialize project config | `--provider`, `--env`, `--force` |
| `scan` | Detect env var references in source | `--include`, `--exclude`, `--json` |
| `pull` | Provider → local `.env` file | `--env`, `--dry-run`, `--output` |
| `push` | Local `.env` → Provider | `--env`, `--keys`, `--yes` |
| `diff` | Compare local ↔ Provider | `--env` |
| `run` | Inject secrets + run command | `--env` |
| `doctor` | Check project security posture | — |

### `apicenter scan` — Supported Languages

| Language | Pattern Detected |
|----------|-----------------|
| JavaScript / TypeScript | `process.env.KEY`, `process.env["KEY"]` |
| Python | `os.environ["KEY"]`, `os.environ.get("KEY")`, `os.getenv("KEY")` |
| Go | `os.Getenv("KEY")` |
| Ruby | `ENV["KEY"]`, `ENV.fetch("KEY")` |
| Rust | `env::var("KEY")`, `std::env::var("KEY")` |
| Java | `System.getenv("KEY")` |
| PHP | `$_ENV["KEY"]`, `getenv("KEY")` |
| `.env` files | `KEY=value` |
| Docker / Compose | `ENV KEY`, `- KEY=value` |
| GitHub Actions | `${{ secrets.KEY }}` |

---

## Configuration (`apicenter.yaml`)

```yaml
version: "1"

provider:
  name: dotenv          # dotenv | infisical | vault | aws | doppler | 1password
  config:
    path: .env          # provider-specific config

environments:
  dev:
    provider_env: development
  staging:
    provider_env: staging
  prod:
    provider_env: production

default_env: dev

output:
  format: dotenv        # dotenv | json | yaml | toml
  path: .env.local      # output file for `apicenter pull`

security:
  mask_in_logs: true
  confirm_before_push: true
  gitignore_check: true
```

### Minimal config (just `.env` sync)

```yaml
version: "1"
provider:
  name: dotenv
  config:
    path: .env
```

### Infisical

```yaml
version: "1"
provider:
  name: infisical
  config:
    project_id: "proj_xxx"
    host: "https://app.infisical.com"   # omit for cloud
    client_id: "${INFISICAL_CLIENT_ID}"
    client_secret: "${INFISICAL_CLIENT_SECRET}"
```

Install the Infisical adapter:

```bash
npm install @apicenter/provider-infisical
```

---

## Providers

| Provider | Package | Status |
|----------|---------|--------|
| `.env` file | built-in | ✅ Available |
| Infisical | `@apicenter/provider-infisical` | ✅ Available |
| HashiCorp Vault | `@apicenter/provider-vault` | ✅ Available |
| AWS Secrets Manager | `@apicenter/provider-aws` | ✅ Available |
| Doppler | `@apicenter/provider-doppler` | ✅ Available |
| 1Password | `@apicenter/provider-1password` | 🔜 Phase 4 |

---

## Building a Custom Provider

Implement the `SecretProvider` interface from `@apicenter/core`:

```typescript
import { SecretProvider, SecretEntry, SecretValue } from '@apicenter/core';

export class MyProvider implements SecretProvider {
  name = 'my-provider';

  async authenticate(config): Promise<void> { /* ... */ }
  async isAuthenticated(): Promise<boolean> { return true; }

  async pullAll(env?: string): Promise<Record<string, string>> { /* ... */ }
  async pushAll(secrets: Record<string, string>, env?: string): Promise<void> { /* ... */ }
  async getSecret(key: string, env?: string): Promise<SecretValue> { /* ... */ }
  async listSecrets(env?: string): Promise<SecretEntry[]> { /* ... */ }
  async setSecret(key: string, value: string, env?: string): Promise<void> { /* ... */ }
  async deleteSecret(key: string, env?: string): Promise<void> { /* ... */ }
}
```

See [Creating a Provider](docs/providers/creating-a-provider.md) for the full guide.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

```bash
# Clone & setup
git clone https://github.com/your-org/apicenter.git
cd apicenter
pnpm install

# Run all tests
pnpm test

# Build all packages
pnpm build
```

---

## License

MIT © [API Center Contributors](https://github.com/your-org/apicenter/graphs/contributors)
