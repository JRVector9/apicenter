# Contributing to API Center

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/your-org/apicenter.git
cd apicenter
pnpm install
pnpm build
pnpm test
```

## Project Structure

```
packages/
├── core/               # @apicenter/core — types, config, scanner, registry, cache
├── cli/                # apicenter — CLI commands (oclif)
├── provider-dotenv/    # @apicenter/provider-dotenv (built-in)
├── provider-infisical/ # @apicenter/provider-infisical
├── provider-vault/     # @apicenter/provider-vault
├── provider-aws/       # @apicenter/provider-aws
├── provider-doppler/   # @apicenter/provider-doppler
├── provider-1password/ # @apicenter/provider-1password
└── mcp-server/         # @apicenter/mcp-server — Claude Code MCP integration
```

## Building a New Provider

1. Copy the template from an existing provider:
   ```bash
   cp -r packages/provider-doppler packages/provider-myservice
   cd packages/provider-myservice
   ```

2. Update `package.json`:
   - Change `name` to `@apicenter/provider-myservice`
   - Replace `@doppler/sdk` dependency with your SDK

3. Implement the `SecretProvider` interface in `src/index.ts`:
   ```typescript
   import type { SecretProvider, SecretEntry, AuthConfig, SecretValue } from '@apicenter/core';

   export class MyServiceProvider implements SecretProvider {
     name = 'myservice';
     // ... implement all required methods
   }
   ```

4. Write tests in `src/index.test.ts` using `vi.mock()` for your SDK:
   ```typescript
   vi.mock('my-service-sdk', () => ({ MyClient: vi.fn() }));
   ```

5. Add your provider to `packages/core/src/config/schema.ts`:
   ```typescript
   export const SUPPORTED_PROVIDERS = [
     'dotenv', 'infisical', 'vault', 'aws', 'doppler', '1password', 'myservice'
   ] as const;
   ```

6. Update `packages/cli/src/commands/provider/list.ts` and `add.ts` with the new provider name.

See [docs/providers/creating-a-provider.md](docs/providers/creating-a-provider.md) for the full guide.

## Running Tests

```bash
# All packages
pnpm test

# Specific package
pnpm --filter @apicenter/core test
pnpm --filter @apicenter/provider-vault test

# Watch mode
pnpm --filter apicenter test -- --watch
```

## Commit Convention

```
feat: add new feature
fix: bug fix
docs: documentation changes
test: test-only changes
refactor: refactor without feature change
chore: tooling, dependencies
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Write tests first (TDD)
4. Implement the feature
5. Run `pnpm test` — all tests must pass
6. Run `pnpm typecheck` — no TypeScript errors
7. Submit a PR with a clear description of the change

## Key Design Principles

- **TDD**: Write failing tests first, then implement
- **DRY**: Don't duplicate logic across providers
- **YAGNI**: Don't add features that aren't needed yet
- **Zero config**: New providers should work with minimal configuration
- **Security by default**: Never log secret values without masking

## License

By contributing, you agree that your contributions will be licensed under MIT.
