# Creating a Custom Provider

This guide walks you through building a custom `SecretProvider` adapter for API Center.

## 1. The `SecretProvider` Interface

All providers must implement the following interface from `@apicenter/core`:

```typescript
import type { SecretProvider, SecretEntry, SecretValue, AuthConfig } from '@apicenter/core';

interface SecretProvider {
  name: string;

  // Authentication
  authenticate(config: AuthConfig): Promise<void>;
  isAuthenticated(): Promise<boolean>;

  // Bulk operations
  pullAll(env?: string): Promise<Record<string, string>>;
  pushAll(secrets: Record<string, string>, env?: string): Promise<void>;

  // Individual operations
  getSecret(key: string, env?: string): Promise<SecretValue>;
  listSecrets(env?: string): Promise<SecretEntry[]>;
  setSecret(key: string, value: string, env?: string): Promise<void>;
  deleteSecret(key: string, env?: string): Promise<void>;

  // Optional
  getEnvironments?(): Promise<string[]>;
  getHistory?(key: string): Promise<SecretHistory[]>;
  rotateSecret?(key: string): Promise<string>;
}
```

## 2. Package Naming Convention

| Type | Name |
|------|------|
| npm package | `@apicenter/provider-{name}` |
| Provider `name` field | `'{name}'` (must match apicenter.yaml) |
| apicenter.yaml | `provider: name: {name}` |

## 3. Minimal Working Example

```typescript
// packages/provider-example/src/index.ts
import type { SecretProvider, SecretEntry, SecretValue, AuthConfig } from '@apicenter/core';

export interface ExampleConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class ExampleProvider implements SecretProvider {
  readonly name = 'example';
  private apiKey: string;
  private baseUrl: string;
  private store: Map<string, Map<string, string>> = new Map(); // in-memory for demo

  constructor(config: ExampleConfig) {
    this.apiKey = config.apiKey ?? process.env['EXAMPLE_API_KEY'] ?? '';
    this.baseUrl = config.baseUrl ?? 'https://api.example.com';
  }

  async authenticate(config: AuthConfig): Promise<void> {
    const key = (config as ExampleConfig).apiKey;
    if (key) this.apiKey = key;
  }

  async isAuthenticated(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async pullAll(env = 'dev'): Promise<Record<string, string>> {
    return Object.fromEntries(this.store.get(env) ?? []);
  }

  async pushAll(secrets: Record<string, string>, env = 'dev'): Promise<void> {
    const envMap = this.store.get(env) ?? new Map<string, string>();
    for (const [key, value] of Object.entries(secrets)) {
      envMap.set(key, value);
    }
    this.store.set(env, envMap);
  }

  async getSecret(key: string, env = 'dev'): Promise<SecretValue> {
    return this.store.get(env)?.get(key);
  }

  async listSecrets(env = 'dev'): Promise<SecretEntry[]> {
    const all = await this.pullAll(env);
    return Object.entries(all).map(([key, value]) => ({ key, value, env }));
  }

  async setSecret(key: string, value: string, env = 'dev'): Promise<void> {
    await this.pushAll({ [key]: value }, env);
  }

  async deleteSecret(key: string, env = 'dev'): Promise<void> {
    this.store.get(env)?.delete(key);
  }
}

export default ExampleProvider;
```

## 4. apicenter.yaml configuration

```yaml
provider:
  name: example
  config:
    apiKey: "${EXAMPLE_API_KEY}"
    baseUrl: "https://api.example.com"
```

## 5. Testing Your Provider

Use Vitest and mock your HTTP client / SDK. Never make real network calls in unit tests.

```typescript
// src/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExampleProvider } from './index.js';

vi.mock('your-sdk', () => ({
  default: vi.fn(() => ({ /* mock methods */ })),
}));

describe('ExampleProvider', () => {
  it('name matches provider key', () => {
    expect(new ExampleProvider({}).name).toBe('example');
  });

  it('pullAll returns empty map when no secrets exist', async () => {
    const p = new ExampleProvider({});
    expect(await p.pullAll('dev')).toEqual({});
  });

  it('pushAll and pullAll round-trip', async () => {
    const p = new ExampleProvider({});
    await p.pushAll({ MY_KEY: 'hello' }, 'dev');
    expect(await p.getSecret('MY_KEY', 'dev')).toBe('hello');
  });
});
```

### Testing Checklist

- [ ] `name` field matches the provider name in apicenter.yaml
- [ ] `pullAll` returns `{}` (not error) when no secrets exist yet
- [ ] `pushAll` + `pullAll` round-trip works correctly
- [ ] `setSecret` creates a new key without overwriting others
- [ ] `deleteSecret` removes only the specified key
- [ ] `isAuthenticated()` returns `false` when credentials are invalid
- [ ] All HTTP/SDK calls are mocked — no real network in tests
- [ ] Error messages include the provider name for easy debugging
- [ ] Works with `env` parameter variations (`undefined`, `'dev'`, `'prod'`)

## 6. Publishing

```bash
# 1. Build
pnpm build

# 2. Test
pnpm test

# 3. Publish
npm publish --access public
```

Your provider will be auto-discovered by API Center when installed:

```bash
npm install @apicenter/provider-example
```

Users just update their `apicenter.yaml`:

```yaml
provider:
  name: example
  config:
    apiKey: "${EXAMPLE_API_KEY}"
```
