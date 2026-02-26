# Phase 3: Ecosystem Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** HashiCorp Vault, AWS Secrets Manager, Doppler의 세 가지 외부 Provider를 추가하고, JSON Schema 배포, Provider 개발 가이드 문서, npm 릴리스 파이프라인을 구축하여 apicenter를 실제 오픈소스 생태계로 확장한다.

**Architecture:** `packages/provider-vault`, `packages/provider-aws`, `packages/provider-doppler`를 독립 패키지로 추가하여 각각의 SDK/HTTP 클라이언트를 통해 `SecretProvider` 인터페이스를 구현한다. `@apicenter/core`의 Zod 스키마를 `zod-to-json-schema`로 변환하여 `schemas/apicenter.schema.json`을 생성하고, GitHub Actions 태그 기반 워크플로우로 모든 패키지를 npm에 일괄 배포한다.

**Tech Stack (additions only):** `node-vault` (Vault KV v2 클라이언트), `@aws-sdk/client-secrets-manager` (AWS SDK v3), `zod-to-json-schema` (JSON Schema 생성), `github-actions/release` workflow with `pnpm publish`

---

## 완성 후 패키지 구조

```
apicenter/
├── packages/
│   ├── core/
│   │   └── scripts/
│   │       └── generate-schema.mjs     # (신규) JSON Schema 생성 스크립트
│   │
│   ├── provider-dotenv/                # (기존 — 변경 없음)
│   ├── provider-infisical/             # (기존 — 변경 없음)
│   │
│   ├── provider-vault/                 # @apicenter/provider-vault (신규)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── index.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── provider-aws/                   # @apicenter/provider-aws (신규)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── index.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── provider-doppler/               # @apicenter/provider-doppler (신규)
│       ├── src/
│       │   ├── index.ts
│       │   └── index.test.ts
│       ├── package.json
│       └── tsconfig.json
│
├── schemas/
│   └── apicenter.schema.json           # (신규) IDE 자동완성용 JSON Schema
│
├── docs/
│   └── providers/
│       └── creating-a-provider.md      # (신규) Provider 개발 가이드
│
└── .github/
    └── workflows/
        └── release.yml                 # (신규) npm 배포 파이프라인
```

---

## Task 1: @apicenter/provider-vault

### 1-1. package.json 생성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-vault/package.json`

```json
{
  "name": "@apicenter/provider-vault",
  "version": "0.3.0",
  "description": "HashiCorp Vault provider adapter for apicenter",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["apicenter", "vault", "hashicorp", "secrets", "provider"],
  "license": "MIT",
  "dependencies": {
    "node-vault": "^0.10.0"
  },
  "devDependencies": {
    "@apicenter/core": "workspace:*",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "peerDependencies": {
    "@apicenter/core": "workspace:*"
  }
}
```

### 1-2. tsconfig.json 생성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-vault/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 1-3. VaultProvider 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-vault/src/index.ts`

```typescript
import nodeVault from 'node-vault';
import type {
  SecretProvider,
  AuthConfig,
  SecretEntry,
} from '@apicenter/core';

export interface VaultConfig {
  address: string;
  token?: string;        // VAULT_TOKEN env var fallback
  mount?: string;        // KV v2 mount path, default: "secret"
  path_prefix?: string;  // optional prefix prepended to env path
}

export class VaultProvider implements SecretProvider {
  name = 'vault';

  private client: ReturnType<typeof nodeVault> | null = null;
  private config: VaultConfig;

  constructor(config: VaultConfig) {
    if (!config.address) {
      throw new Error('VaultProvider: config.address is required');
    }
    this.config = {
      mount: 'secret',
      ...config,
    };
  }

  private getToken(): string {
    const token = this.config.token || process.env['VAULT_TOKEN'];
    if (!token) {
      throw new Error(
        'VaultProvider: No token provided. Set config.token or VAULT_TOKEN env var.',
      );
    }
    return token;
  }

  private getClient(): ReturnType<typeof nodeVault> {
    if (!this.client) {
      this.client = nodeVault({
        apiVersion: 'v1',
        endpoint: this.config.address,
        token: this.getToken(),
      });
    }
    return this.client;
  }

  /**
   * Build the KV v2 path for a given environment.
   * Format: {mount}/data/{path_prefix}/{env}
   * Example: secret/data/myapp/dev
   */
  private buildPath(env: string): string {
    const parts = [this.config.path_prefix, env].filter(Boolean);
    return parts.join('/');
  }

  async authenticate(config: AuthConfig): Promise<void> {
    const token = (config as VaultConfig).token || process.env['VAULT_TOKEN'];
    if (token) {
      this.config.token = token;
    }
    // Eagerly create the client to validate connectivity
    this.client = nodeVault({
      apiVersion: 'v1',
      endpoint: this.config.address,
      token: this.getToken(),
    });
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.tokenLookupSelf();
      return true;
    } catch {
      return false;
    }
  }

  async getSecret(key: string, env: string = 'dev'): Promise<string> {
    const client = this.getClient();
    const mount = this.config.mount!;
    const path = this.buildPath(env);

    try {
      // KV v2: GET /v1/{mount}/data/{path}
      const response = await client.read(`${mount}/data/${path}`);
      const secrets: Record<string, string> = response?.data?.data ?? {};

      if (!(key in secrets)) {
        throw new Error(
          `VaultProvider: Key "${key}" not found at ${mount}/data/${path}`,
        );
      }

      return secrets[key]!;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('VaultProvider:')) {
        throw err;
      }
      throw new Error(
        `VaultProvider: Failed to get secret "${key}" from ${mount}/data/${path}: ${String(err)}`,
      );
    }
  }

  async listSecrets(env: string = 'dev'): Promise<SecretEntry[]> {
    const allSecrets = await this.pullAll(env);
    return Object.entries(allSecrets).map(([key, value]) => ({
      key,
      value,
      env,
    }));
  }

  async setSecret(key: string, value: string, env: string = 'dev'): Promise<void> {
    // Read current secrets first to avoid overwriting unrelated keys
    let existing: Record<string, string> = {};
    try {
      existing = await this.pullAll(env);
    } catch {
      // Path may not exist yet — that is fine
    }

    await this.pushAll({ ...existing, [key]: value }, env);
  }

  async deleteSecret(key: string, env: string = 'dev'): Promise<void> {
    const existing = await this.pullAll(env);
    if (!(key in existing)) {
      throw new Error(
        `VaultProvider: Key "${key}" not found — cannot delete.`,
      );
    }
    const updated = { ...existing };
    delete updated[key];
    await this.pushAll(updated, env);
  }

  async pullAll(env: string = 'dev'): Promise<Record<string, string>> {
    const client = this.getClient();
    const mount = this.config.mount!;
    const path = this.buildPath(env);

    try {
      const response = await client.read(`${mount}/data/${path}`);
      return (response?.data?.data as Record<string, string>) ?? {};
    } catch (err: unknown) {
      // Vault returns 404 when the path does not exist
      const message = String(err);
      if (message.includes('404') || message.includes('not found')) {
        return {};
      }
      throw new Error(
        `VaultProvider: Failed to pull secrets from ${mount}/data/${path}: ${message}`,
      );
    }
  }

  async pushAll(secrets: Record<string, string>, env: string = 'dev'): Promise<void> {
    const client = this.getClient();
    const mount = this.config.mount!;
    const path = this.buildPath(env);

    try {
      // KV v2: POST /v1/{mount}/data/{path}
      await client.write(`${mount}/data/${path}`, { data: secrets });
    } catch (err: unknown) {
      throw new Error(
        `VaultProvider: Failed to push secrets to ${mount}/data/${path}: ${String(err)}`,
      );
    }
  }
}

export default VaultProvider;
```

### 1-4. VaultProvider 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-vault/src/index.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultProvider } from './index.js';

// --- Mock node-vault ---
const mockRead = vi.fn();
const mockWrite = vi.fn();
const mockTokenLookupSelf = vi.fn();

vi.mock('node-vault', () => ({
  default: vi.fn(() => ({
    read: mockRead,
    write: mockWrite,
    tokenLookupSelf: mockTokenLookupSelf,
  })),
}));

const makeProvider = (overrides: Partial<{ path_prefix: string; mount: string }> = {}) =>
  new VaultProvider({
    address: 'https://vault.example.com',
    token: 'test-token',
    mount: 'secret',
    ...overrides,
  });

describe('VaultProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Constructor ---

  it('throws if address is missing', () => {
    expect(
      () => new VaultProvider({ address: '' }),
    ).toThrow('config.address is required');
  });

  it('defaults mount to "secret" when not provided', () => {
    const provider = new VaultProvider({ address: 'https://vault.example.com', token: 't' });
    expect(provider.name).toBe('vault');
  });

  // --- isAuthenticated ---

  it('returns true when tokenLookupSelf succeeds', async () => {
    mockTokenLookupSelf.mockResolvedValueOnce({ data: { id: 'test-token' } });
    const provider = makeProvider();
    expect(await provider.isAuthenticated()).toBe(true);
  });

  it('returns false when tokenLookupSelf throws', async () => {
    mockTokenLookupSelf.mockRejectedValueOnce(new Error('permission denied'));
    const provider = makeProvider();
    expect(await provider.isAuthenticated()).toBe(false);
  });

  // --- pullAll ---

  it('reads from correct KV v2 path', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { DB_HOST: 'localhost' } } });
    const provider = makeProvider({ path_prefix: 'myapp' });
    const result = await provider.pullAll('dev');
    expect(mockRead).toHaveBeenCalledWith('secret/data/myapp/dev');
    expect(result).toEqual({ DB_HOST: 'localhost' });
  });

  it('returns empty object when path returns 404', async () => {
    mockRead.mockRejectedValueOnce(new Error('Status 404'));
    const provider = makeProvider();
    const result = await provider.pullAll('dev');
    expect(result).toEqual({});
  });

  it('uses path without prefix when path_prefix is not set', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { KEY: 'val' } } });
    const provider = makeProvider();
    await provider.pullAll('staging');
    expect(mockRead).toHaveBeenCalledWith('secret/data/staging');
  });

  it('throws wrapped error on non-404 failure', async () => {
    mockRead.mockRejectedValueOnce(new Error('connection refused'));
    const provider = makeProvider();
    await expect(provider.pullAll('dev')).rejects.toThrow('Failed to pull secrets');
  });

  // --- pushAll ---

  it('writes to correct KV v2 path', async () => {
    mockWrite.mockResolvedValueOnce({});
    const provider = makeProvider({ path_prefix: 'myapp' });
    await provider.pushAll({ API_KEY: 'abc123' }, 'prod');
    expect(mockWrite).toHaveBeenCalledWith('secret/data/myapp/prod', {
      data: { API_KEY: 'abc123' },
    });
  });

  it('throws wrapped error on write failure', async () => {
    mockWrite.mockRejectedValueOnce(new Error('permission denied'));
    const provider = makeProvider();
    await expect(provider.pushAll({ KEY: 'val' }, 'dev')).rejects.toThrow(
      'Failed to push secrets',
    );
  });

  // --- getSecret ---

  it('returns single secret value', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { DB_PASS: 'secret123' } } });
    const provider = makeProvider();
    const value = await provider.getSecret('DB_PASS', 'dev');
    expect(value).toBe('secret123');
  });

  it('throws when key is not found', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { OTHER: 'val' } } });
    const provider = makeProvider();
    await expect(provider.getSecret('MISSING_KEY', 'dev')).rejects.toThrow(
      'Key "MISSING_KEY" not found',
    );
  });

  // --- listSecrets ---

  it('returns SecretEntry array from pullAll', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { A: '1', B: '2' } } });
    const provider = makeProvider();
    const entries = await provider.listSecrets('dev');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ key: 'A', value: '1', env: 'dev' });
  });

  // --- setSecret ---

  it('merges new key into existing secrets on set', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { EXISTING: 'old' } } });
    mockWrite.mockResolvedValueOnce({});
    const provider = makeProvider();
    await provider.setSecret('NEW_KEY', 'new_val', 'dev');
    expect(mockWrite).toHaveBeenCalledWith(
      expect.any(String),
      { data: { EXISTING: 'old', NEW_KEY: 'new_val' } },
    );
  });

  // --- deleteSecret ---

  it('removes key from secrets on delete', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { DEL: 'x', KEEP: 'y' } } });
    mockWrite.mockResolvedValueOnce({});
    const provider = makeProvider();
    await provider.deleteSecret('DEL', 'dev');
    expect(mockWrite).toHaveBeenCalledWith(
      expect.any(String),
      { data: { KEEP: 'y' } },
    );
  });

  it('throws when deleting non-existent key', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { KEEP: 'y' } } });
    const provider = makeProvider();
    await expect(provider.deleteSecret('GHOST', 'dev')).rejects.toThrow(
      'Key "GHOST" not found',
    );
  });
});
```

### 1-5. 설치 및 빌드 명령어

```bash
# 패키지 의존성 설치 (monorepo 루트에서)
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm install

# provider-vault 단독 빌드 및 테스트
pnpm --filter @apicenter/provider-vault build
pnpm --filter @apicenter/provider-vault test
```

---

## Task 2: @apicenter/provider-aws

### 2-1. package.json 생성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-aws/package.json`

```json
{
  "name": "@apicenter/provider-aws",
  "version": "0.3.0",
  "description": "AWS Secrets Manager provider adapter for apicenter",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["apicenter", "aws", "secrets-manager", "secrets", "provider"],
  "license": "MIT",
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.0.0"
  },
  "devDependencies": {
    "@apicenter/core": "workspace:*",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "peerDependencies": {
    "@apicenter/core": "workspace:*"
  }
}
```

### 2-2. tsconfig.json 생성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-aws/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 2-3. AwsProvider 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-aws/src/index.ts`

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';
import type {
  SecretProvider,
  AuthConfig,
  SecretEntry,
} from '@apicenter/core';

export type AwsMode = 'bundle' | 'individual';

export interface AwsConfig {
  region: string;
  prefix?: string;   // optional prefix for secret names, e.g. "myapp/"
  mode?: AwsMode;    // "bundle" (default) | "individual"
}

/**
 * AwsProvider stores secrets in AWS Secrets Manager.
 *
 * bundle mode (default):
 *   One secret per environment: `{prefix}{env}`
 *   The secret value is a JSON string: `{"KEY": "value", ...}`
 *   This minimises AWS API calls and costs.
 *
 * individual mode:
 *   One secret per key per environment: `{prefix}{key}`
 *   The secret value is a plain string.
 *   Use this when each secret has its own IAM policy or rotation schedule.
 */
export class AwsProvider implements SecretProvider {
  name = 'aws';

  private client: SecretsManagerClient;
  private config: Required<AwsConfig>;

  constructor(config: AwsConfig) {
    if (!config.region) {
      throw new Error('AwsProvider: config.region is required');
    }
    this.config = {
      prefix: '',
      mode: 'bundle',
      ...config,
    };
    // AWS SDK picks up credentials from env vars / ~/.aws/credentials / IAM role automatically
    this.client = new SecretsManagerClient({ region: this.config.region });
  }

  /** Replace the internal SecretsManagerClient (used for testing). */
  _setClient(client: SecretsManagerClient): void {
    this.client = client;
  }

  private bundleSecretName(env: string): string {
    return `${this.config.prefix}${env}`;
  }

  private individualSecretName(key: string): string {
    return `${this.config.prefix}${key}`;
  }

  // ---------- Authentication ----------

  async authenticate(_config: AuthConfig): Promise<void> {
    // AWS uses its own credential chain — nothing to do here.
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      // ListSecrets with maxResults=1 is a lightweight connectivity check
      await this.client.send(new ListSecretsCommand({ MaxResults: 1 }));
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Bundle mode helpers ----------

  private async readBundle(env: string): Promise<Record<string, string>> {
    const secretId = this.bundleSecretName(env);
    try {
      const response = await this.client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );
      const raw = response.SecretString;
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, string>;
    } catch (err: unknown) {
      if (err instanceof ResourceNotFoundException) return {};
      throw new Error(
        `AwsProvider: Failed to read bundle secret "${secretId}": ${String(err)}`,
      );
    }
  }

  private async writeBundle(
    env: string,
    secrets: Record<string, string>,
  ): Promise<void> {
    const secretId = this.bundleSecretName(env);
    const secretString = JSON.stringify(secrets);
    try {
      // Try to update first; create if it doesn't exist
      await this.client.send(
        new PutSecretValueCommand({ SecretId: secretId, SecretString: secretString }),
      );
    } catch (err: unknown) {
      if (err instanceof ResourceNotFoundException) {
        await this.client.send(
          new CreateSecretCommand({ Name: secretId, SecretString: secretString }),
        );
      } else {
        throw new Error(
          `AwsProvider: Failed to write bundle secret "${secretId}": ${String(err)}`,
        );
      }
    }
  }

  // ---------- SecretProvider interface ----------

  async pullAll(env: string = 'dev'): Promise<Record<string, string>> {
    if (this.config.mode === 'bundle') {
      return this.readBundle(env);
    }

    // individual mode: list all secrets with the prefix, filter by env suffix
    // Convention: {prefix}{key} and we tag with env — for simplicity in individual mode
    // we list all secrets matching prefix and return them all (env-agnostic)
    const results: Record<string, string> = {};
    let nextToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListSecretsCommand({ NextToken: nextToken }),
      );
      for (const entry of response.SecretList ?? []) {
        const name = entry.Name ?? '';
        if (name.startsWith(this.config.prefix)) {
          const key = name.slice(this.config.prefix.length);
          try {
            const val = await this.client.send(
              new GetSecretValueCommand({ SecretId: name }),
            );
            results[key] = val.SecretString ?? '';
          } catch {
            // skip unreadable secrets
          }
        }
      }
      nextToken = response.NextToken;
    } while (nextToken);

    return results;
  }

  async pushAll(secrets: Record<string, string>, env: string = 'dev'): Promise<void> {
    if (this.config.mode === 'bundle') {
      await this.writeBundle(env, secrets);
      return;
    }

    // individual mode: write each key as a separate secret
    await Promise.all(
      Object.entries(secrets).map(async ([key, value]) => {
        const secretId = this.individualSecretName(key);
        try {
          await this.client.send(
            new PutSecretValueCommand({ SecretId: secretId, SecretString: value }),
          );
        } catch (err: unknown) {
          if (err instanceof ResourceNotFoundException) {
            await this.client.send(
              new CreateSecretCommand({ Name: secretId, SecretString: value }),
            );
          } else {
            throw new Error(
              `AwsProvider: Failed to write secret "${secretId}": ${String(err)}`,
            );
          }
        }
      }),
    );
  }

  async getSecret(key: string, env: string = 'dev'): Promise<string> {
    if (this.config.mode === 'bundle') {
      const all = await this.readBundle(env);
      if (!(key in all)) {
        throw new Error(`AwsProvider: Key "${key}" not found in bundle "${this.bundleSecretName(env)}"`);
      }
      return all[key]!;
    }

    const secretId = this.individualSecretName(key);
    try {
      const response = await this.client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );
      return response.SecretString ?? '';
    } catch (err: unknown) {
      if (err instanceof ResourceNotFoundException) {
        throw new Error(`AwsProvider: Secret "${secretId}" not found`);
      }
      throw new Error(`AwsProvider: Failed to get secret "${secretId}": ${String(err)}`);
    }
  }

  async listSecrets(env: string = 'dev'): Promise<SecretEntry[]> {
    const all = await this.pullAll(env);
    return Object.entries(all).map(([key, value]) => ({ key, value, env }));
  }

  async setSecret(key: string, value: string, env: string = 'dev'): Promise<void> {
    if (this.config.mode === 'bundle') {
      const existing = await this.readBundle(env);
      await this.writeBundle(env, { ...existing, [key]: value });
      return;
    }
    // individual mode
    const secretId = this.individualSecretName(key);
    try {
      await this.client.send(
        new PutSecretValueCommand({ SecretId: secretId, SecretString: value }),
      );
    } catch (err: unknown) {
      if (err instanceof ResourceNotFoundException) {
        await this.client.send(
          new CreateSecretCommand({ Name: secretId, SecretString: value }),
        );
      } else {
        throw err;
      }
    }
  }

  async deleteSecret(key: string, env: string = 'dev'): Promise<void> {
    if (this.config.mode === 'bundle') {
      const existing = await this.readBundle(env);
      if (!(key in existing)) {
        throw new Error(`AwsProvider: Key "${key}" not found in bundle`);
      }
      const updated = { ...existing };
      delete updated[key];
      await this.writeBundle(env, updated);
      return;
    }
    // individual mode
    const secretId = this.individualSecretName(key);
    try {
      await this.client.send(new DeleteSecretCommand({ SecretId: secretId }));
    } catch (err: unknown) {
      if (err instanceof ResourceNotFoundException) {
        throw new Error(`AwsProvider: Secret "${secretId}" not found`);
      }
      throw err;
    }
  }
}

export default AwsProvider;
```

### 2-4. AwsProvider 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-aws/src/index.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';
import { AwsProvider } from './index.js';

// --- Mock @aws-sdk/client-secrets-manager ---
const mockSend = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-secrets-manager')>();
  return {
    ...actual,
    SecretsManagerClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

const makeProvider = (overrides: Partial<{ prefix: string; mode: 'bundle' | 'individual' }> = {}) => {
  const p = new AwsProvider({ region: 'ap-northeast-2', ...overrides });
  return p;
};

describe('AwsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Constructor ---

  it('throws if region is missing', () => {
    expect(() => new AwsProvider({ region: '' })).toThrow('config.region is required');
  });

  it('defaults mode to bundle', () => {
    const p = makeProvider();
    expect(p.name).toBe('aws');
  });

  // --- isAuthenticated ---

  it('returns true when ListSecrets succeeds', async () => {
    mockSend.mockResolvedValueOnce({ SecretList: [] });
    expect(await makeProvider().isAuthenticated()).toBe(true);
  });

  it('returns false when ListSecrets throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('No credentials'));
    expect(await makeProvider().isAuthenticated()).toBe(false);
  });

  // --- Bundle mode: pullAll ---

  it('reads bundle secret and parses JSON', async () => {
    mockSend.mockImplementation((cmd: unknown) => {
      if (cmd instanceof GetSecretValueCommand) {
        return Promise.resolve({ SecretString: JSON.stringify({ DB_HOST: 'localhost' }) });
      }
      return Promise.resolve({});
    });
    const result = await makeProvider({ prefix: 'myapp/' }).pullAll('dev');
    expect(result).toEqual({ DB_HOST: 'localhost' });
  });

  it('returns empty object when bundle secret does not exist', async () => {
    mockSend.mockRejectedValueOnce(
      new ResourceNotFoundException({ message: 'not found', $metadata: {} }),
    );
    expect(await makeProvider().pullAll('dev')).toEqual({});
  });

  // --- Bundle mode: pushAll ---

  it('calls PutSecretValue with JSON-stringified secrets', async () => {
    mockSend.mockResolvedValueOnce({});
    await makeProvider({ prefix: 'app/' }).pushAll({ KEY: 'val' }, 'staging');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          SecretId: 'app/staging',
          SecretString: JSON.stringify({ KEY: 'val' }),
        },
      }),
    );
  });

  it('creates a new secret if PutSecretValue returns ResourceNotFoundException', async () => {
    mockSend
      .mockRejectedValueOnce(
        new ResourceNotFoundException({ message: 'not found', $metadata: {} }),
      )
      .mockResolvedValueOnce({});
    await makeProvider().pushAll({ KEY: 'val' }, 'dev');
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenLastCalledWith(expect.any(CreateSecretCommand));
  });

  // --- Bundle mode: getSecret ---

  it('returns correct value from bundle', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ API_KEY: 'abc', OTHER: 'xyz' }),
    });
    const val = await makeProvider().getSecret('API_KEY', 'dev');
    expect(val).toBe('abc');
  });

  it('throws when key is not found in bundle', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify({ OTHER: 'xyz' }) });
    await expect(makeProvider().getSecret('MISSING', 'dev')).rejects.toThrow(
      'Key "MISSING" not found',
    );
  });

  // --- Bundle mode: listSecrets ---

  it('returns SecretEntry array', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ A: '1', B: '2' }),
    });
    const entries = await makeProvider().listSecrets('dev');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ key: 'A', value: '1' });
  });

  // --- Bundle mode: setSecret ---

  it('merges new key into existing bundle', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ EXISTING: 'old' }) })
      .mockResolvedValueOnce({});
    await makeProvider().setSecret('NEW', 'new_val', 'dev');
    expect(mockSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          SecretString: JSON.stringify({ EXISTING: 'old', NEW: 'new_val' }),
        }),
      }),
    );
  });

  // --- Bundle mode: deleteSecret ---

  it('removes key from bundle on delete', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ DEL: 'x', KEEP: 'y' }) })
      .mockResolvedValueOnce({});
    await makeProvider().deleteSecret('DEL', 'dev');
    expect(mockSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          SecretString: JSON.stringify({ KEEP: 'y' }),
        }),
      }),
    );
  });

  it('throws when deleting a key that does not exist in bundle', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify({ KEEP: 'y' }) });
    await expect(makeProvider().deleteSecret('GHOST', 'dev')).rejects.toThrow(
      'Key "GHOST" not found',
    );
  });

  // --- Individual mode: pushAll ---

  it('writes individual secrets with prefix', async () => {
    mockSend.mockResolvedValue({});
    const p = makeProvider({ prefix: 'svc/', mode: 'individual' });
    await p.pushAll({ DB: 'pass' }, 'dev');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { SecretId: 'svc/DB', SecretString: 'pass' },
      }),
    );
  });
});
```

### 2-5. 빌드 및 테스트 명령어

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm install
pnpm --filter @apicenter/provider-aws build
pnpm --filter @apicenter/provider-aws test
```

---

## Task 3: @apicenter/provider-doppler

### 3-1. package.json 생성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-doppler/package.json`

```json
{
  "name": "@apicenter/provider-doppler",
  "version": "0.3.0",
  "description": "Doppler provider adapter for apicenter",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["apicenter", "doppler", "secrets", "provider"],
  "license": "MIT",
  "dependencies": {},
  "devDependencies": {
    "@apicenter/core": "workspace:*",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "peerDependencies": {
    "@apicenter/core": "workspace:*"
  }
}
```

### 3-2. tsconfig.json 생성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-doppler/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 3-3. DopplerProvider 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-doppler/src/index.ts`

```typescript
import type {
  SecretProvider,
  AuthConfig,
  SecretEntry,
} from '@apicenter/core';

export interface DopplerConfig {
  token?: string;    // DOPPLER_TOKEN env var fallback
  project: string;
  config: string;    // Doppler config name (maps to environment)
}

// Doppler API response shapes
interface DopplerSecretRaw {
  computed: string;
  note: string;
}

interface DopplerSecretsResponse {
  secrets: Record<string, DopplerSecretRaw>;
}

interface DopplerUpdatePayload {
  project: string;
  config: string;
  secrets: Record<string, { computed: string }>;
}

const DOPPLER_API = 'https://api.doppler.com/v3';

/**
 * DopplerProvider communicates with the Doppler REST API v3.
 * Uses global fetch (Node.js 18+). No external dependencies required.
 *
 * Note: Doppler treats "project + config" as the secret namespace.
 * The `env` parameter passed to pullAll / pushAll is IGNORED —
 * the `config` field from DopplerConfig determines the environment.
 * If you need per-environment separation, instantiate separate providers
 * with different config values.
 */
export class DopplerProvider implements SecretProvider {
  name = 'doppler';

  private config: DopplerConfig;

  // Injected at test time
  private _fetch: typeof fetch = fetch;

  constructor(config: DopplerConfig) {
    if (!config.project) {
      throw new Error('DopplerProvider: config.project is required');
    }
    if (!config.config) {
      throw new Error('DopplerProvider: config.config is required');
    }
    this.config = config;
  }

  /** Override fetch implementation (for testing). */
  _setFetch(fetchFn: typeof fetch): void {
    this._fetch = fetchFn;
  }

  private getToken(): string {
    const token = this.config.token || process.env['DOPPLER_TOKEN'];
    if (!token) {
      throw new Error(
        'DopplerProvider: No token provided. Set config.token or DOPPLER_TOKEN env var.',
      );
    }
    return token;
  }

  private buildAuthHeader(): { Authorization: string } {
    return { Authorization: `Bearer ${this.getToken()}` };
  }

  private buildQuery(): string {
    return `project=${encodeURIComponent(this.config.project)}&config=${encodeURIComponent(this.config.config)}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${DOPPLER_API}${path}`;
    const headers: Record<string, string> = {
      ...this.buildAuthHeader(),
      'Content-Type': 'application/json',
    };

    const response = await this._fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `DopplerProvider: ${method} ${path} failed with HTTP ${response.status}: ${text}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // ---------- Authentication ----------

  async authenticate(config: AuthConfig): Promise<void> {
    const token = (config as DopplerConfig).token || process.env['DOPPLER_TOKEN'];
    if (token) {
      this.config.token = token;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.request('GET', `/configs/config/secrets?${this.buildQuery()}`);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- SecretProvider interface ----------

  async pullAll(_env?: string): Promise<Record<string, string>> {
    const response = await this.request<DopplerSecretsResponse>(
      'GET',
      `/configs/config/secrets?${this.buildQuery()}`,
    );

    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(response.secrets)) {
      result[key] = entry.computed;
    }
    return result;
  }

  async pushAll(secrets: Record<string, string>, _env?: string): Promise<void> {
    const payload: DopplerUpdatePayload = {
      project: this.config.project,
      config: this.config.config,
      secrets: Object.fromEntries(
        Object.entries(secrets).map(([key, value]) => [
          key,
          { computed: value },
        ]),
      ),
    };

    await this.request('POST', '/configs/config/secrets', payload);
  }

  async getSecret(key: string, _env?: string): Promise<string> {
    const response = await this.request<DopplerSecretsResponse>(
      'GET',
      `/configs/config/secrets?${this.buildQuery()}`,
    );

    const entry = response.secrets[key];
    if (!entry) {
      throw new Error(
        `DopplerProvider: Key "${key}" not found in project="${this.config.project}" config="${this.config.config}"`,
      );
    }
    return entry.computed;
  }

  async listSecrets(_env?: string): Promise<SecretEntry[]> {
    const all = await this.pullAll();
    return Object.entries(all).map(([key, value]) => ({
      key,
      value,
      env: this.config.config,
    }));
  }

  async setSecret(key: string, value: string, _env?: string): Promise<void> {
    await this.pushAll({ [key]: value });
  }

  async deleteSecret(key: string, _env?: string): Promise<void> {
    // Doppler API: DELETE /v3/configs/config/secret?project=X&config=Y&name=KEY
    await this.request(
      'DELETE',
      `/configs/config/secret?${this.buildQuery()}&name=${encodeURIComponent(key)}`,
    );
  }
}

export default DopplerProvider;
```

### 3-4. DopplerProvider 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-doppler/src/index.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DopplerProvider } from './index.js';

// Helper: create a mock fetch response
function mockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const SECRETS_RESPONSE = {
  secrets: {
    DB_HOST: { computed: 'localhost', note: '' },
    API_KEY: { computed: 'sk-abc', note: '' },
  },
};

const makeProvider = (token = 'test-token') =>
  new DopplerProvider({ token, project: 'my-project', config: 'dev' });

describe('DopplerProvider', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  // --- Constructor ---

  it('throws when project is missing', () => {
    expect(
      () => new DopplerProvider({ project: '', config: 'dev' }),
    ).toThrow('config.project is required');
  });

  it('throws when config is missing', () => {
    expect(
      () => new DopplerProvider({ project: 'proj', config: '' }),
    ).toThrow('config.config is required');
  });

  // --- isAuthenticated ---

  it('returns true when GET secrets succeeds', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SECRETS_RESPONSE));
    const p = makeProvider();
    p._setFetch(mockFetch);
    expect(await p.isAuthenticated()).toBe(true);
  });

  it('returns false when GET secrets throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('401'));
    const p = makeProvider();
    p._setFetch(mockFetch);
    expect(await p.isAuthenticated()).toBe(false);
  });

  // --- pullAll ---

  it('returns flat key-value record from Doppler response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SECRETS_RESPONSE));
    const p = makeProvider();
    p._setFetch(mockFetch);
    const result = await p.pullAll();
    expect(result).toEqual({ DB_HOST: 'localhost', API_KEY: 'sk-abc' });
  });

  it('sends Bearer token in Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SECRETS_RESPONSE));
    const p = makeProvider('my-secret-token');
    p._setFetch(mockFetch);
    await p.pullAll();
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer my-secret-token',
    });
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ messages: ['unauthorized'] }, false, 401));
    const p = makeProvider();
    p._setFetch(mockFetch);
    await expect(p.pullAll()).rejects.toThrow('HTTP 401');
  });

  // --- pushAll ---

  it('posts secrets in Doppler update format', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const p = makeProvider();
    p._setFetch(mockFetch);
    await p.pushAll({ NEW_KEY: 'new_val' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/configs/config/secrets');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      project: 'my-project',
      config: 'dev',
      secrets: { NEW_KEY: { computed: 'new_val' } },
    });
  });

  // --- getSecret ---

  it('returns computed value for known key', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SECRETS_RESPONSE));
    const p = makeProvider();
    p._setFetch(mockFetch);
    expect(await p.getSecret('API_KEY')).toBe('sk-abc');
  });

  it('throws for unknown key', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SECRETS_RESPONSE));
    const p = makeProvider();
    p._setFetch(mockFetch);
    await expect(p.getSecret('MISSING')).rejects.toThrow('Key "MISSING" not found');
  });

  // --- listSecrets ---

  it('returns SecretEntry array with config name as env', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SECRETS_RESPONSE));
    const p = makeProvider();
    p._setFetch(mockFetch);
    const entries = await p.listSecrets();
    expect(entries[0]).toMatchObject({ env: 'dev' });
    expect(entries).toHaveLength(2);
  });

  // --- setSecret ---

  it('posts single key-value pair', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const p = makeProvider();
    p._setFetch(mockFetch);
    await p.setSecret('MY_KEY', 'my_val');
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.secrets).toMatchObject({ MY_KEY: { computed: 'my_val' } });
  });

  // --- deleteSecret ---

  it('calls DELETE with correct query params', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const p = makeProvider();
    p._setFetch(mockFetch);
    await p.deleteSecret('REMOVE_ME');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('DELETE');
    expect(url).toContain('name=REMOVE_ME');
  });

  it('uses DOPPLER_TOKEN env var when no token in config', async () => {
    process.env['DOPPLER_TOKEN'] = 'env-token';
    mockFetch.mockResolvedValueOnce(mockResponse(SECRETS_RESPONSE));
    const p = new DopplerProvider({ project: 'proj', config: 'dev' });
    p._setFetch(mockFetch);
    await p.pullAll();
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer env-token',
    });
    delete process.env['DOPPLER_TOKEN'];
  });
});
```

### 3-5. 빌드 및 테스트 명령어

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm install
pnpm --filter @apicenter/provider-doppler build
pnpm --filter @apicenter/provider-doppler test
```

---

## Task 4: JSON Schema for apicenter.yaml

### 4-1. zod-to-json-schema 의존성 추가

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/package.json`

기존 `devDependencies`에 추가:

```json
"zod-to-json-schema": "^3.22.0"
```

기존 `scripts`에 추가:

```json
"generate:schema": "node scripts/generate-schema.mjs"
```

### 4-2. Schema 생성 스크립트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/scripts/generate-schema.mjs`

```javascript
#!/usr/bin/env node
/**
 * Generates schemas/apicenter.schema.json from the core Zod config schema.
 * Run from packages/core: pnpm run generate:schema
 * Output: <repo-root>/schemas/apicenter.schema.json
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema } from '../dist/config/schema.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const outputDir = resolve(repoRoot, 'schemas');
const outputFile = resolve(outputDir, 'apicenter.schema.json');

const schema = zodToJsonSchema(ConfigSchema, {
  name: 'ApicenterConfig',
  $schema: 'http://json-schema.org/draft-07/schema#',
  definitions: true,
  errorMessages: false,
});

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, JSON.stringify(schema, null, 2) + '\n');
console.log(`Schema generated: ${outputFile}`);
```

### 4-3. apicenter.yaml에 $schema 주석 추가

`generateConfig()` 함수가 위치한 파일을 확인하고 생성되는 YAML 최상단에 다음 주석을 추가한다.

**수정 대상 파일:** `packages/cli/src/commands/init.ts` (또는 `packages/core/src/config/generator.ts`)

생성되는 YAML 문자열 최상단에 추가:

```yaml
# yaml-language-server: $schema=https://unpkg.com/@apicenter/core/schemas/apicenter.schema.json
version: "1"
...
```

구체적인 코드 수정 위치를 확인하기 위해 다음 명령으로 탐색:

```bash
grep -r "generateConfig\|apicenter.yaml" \
  /Users/jinwooro/Desktop/Project/Apicenter/packages --include="*.ts" -l
```

찾은 파일에서 YAML 문자열 템플릿 리터럴 앞에 다음 줄을 삽입:

```typescript
const schemaComment =
  '# yaml-language-server: $schema=https://unpkg.com/@apicenter/core/schemas/apicenter.schema.json\n';
const yamlContent = schemaComment + yaml.stringify(configObject);
```

### 4-4. Schema 생성 실행

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm --filter @apicenter/core build
pnpm --filter @apicenter/core run generate:schema
# 결과: schemas/apicenter.schema.json 생성 확인
ls -lh schemas/apicenter.schema.json
```

---

## Task 5: Provider 개발 가이드 문서

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/docs/providers/creating-a-provider.md`

```markdown
# Creating a Custom Provider

This guide explains how to build your own secret backend adapter for apicenter.

## Overview

A **provider** is an npm package that implements the `SecretProvider` interface from `@apicenter/core`.
Users install it alongside the apicenter CLI and reference it in `apicenter.yaml`.

```bash
npm install apicenter @apicenter/provider-vault
```

```yaml
# apicenter.yaml
provider:
  name: vault
  config:
    address: "https://vault.example.com"
    token: "${VAULT_TOKEN}"
```

## Package Naming Convention

| Type | Package name |
|------|-------------|
| Official | `@apicenter/provider-{name}` |
| Community | `apicenter-provider-{name}` |

## The SecretProvider Interface

```typescript
// From @apicenter/core
export interface SecretProvider {
  name: string;

  // Authentication
  authenticate(config: AuthConfig): Promise<void>;
  isAuthenticated(): Promise<boolean>;

  // Bulk operations (required)
  pullAll(env?: string): Promise<Record<string, string>>;
  pushAll(secrets: Record<string, string>, env?: string): Promise<void>;

  // Individual key operations (required)
  getSecret(key: string, env?: string): Promise<string>;
  listSecrets(env?: string): Promise<SecretEntry[]>;
  setSecret(key: string, value: string, env?: string): Promise<void>;
  deleteSecret(key: string, env?: string): Promise<void>;

  // Optional metadata
  getEnvironments?(): Promise<string[]>;
  getHistory?(key: string): Promise<SecretHistory[]>;
  rotateSecret?(key: string): Promise<string>;
}

export interface SecretEntry {
  key: string;
  value: string;
  env?: string;
}
```

## Step-by-Step Guide

### Step 1: Scaffold the package

```bash
mkdir packages/provider-example
cd packages/provider-example
```

`package.json`:

```json
{
  "name": "apicenter-provider-example",
  "version": "1.0.0",
  "description": "apicenter provider for Example Secrets Service",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "example-sdk": "^1.0.0"
  },
  "peerDependencies": {
    "@apicenter/core": ">=0.3.0"
  }
}
```

### Step 2: Implement the provider

```typescript
// src/index.ts
import type { SecretProvider, AuthConfig, SecretEntry } from '@apicenter/core';

export interface ExampleConfig {
  endpoint: string;
  apiKey?: string; // EXAMPLE_API_KEY env var fallback
}

export class ExampleProvider implements SecretProvider {
  name = 'example';

  private endpoint: string;
  private apiKey: string;

  constructor(config: ExampleConfig) {
    if (!config.endpoint) {
      throw new Error('ExampleProvider: config.endpoint is required');
    }
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey ?? process.env['EXAMPLE_API_KEY'] ?? '';
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    // Validate credentials by making a lightweight API call
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.endpoint}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async pullAll(env: string = 'dev'): Promise<Record<string, string>> {
    const resp = await fetch(`${this.endpoint}/secrets?env=${env}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json() as Promise<Record<string, string>>;
  }

  async pushAll(secrets: Record<string, string>, env: string = 'dev'): Promise<void> {
    const resp = await fetch(`${this.endpoint}/secrets?env=${env}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(secrets),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }

  async getSecret(key: string, env: string = 'dev'): Promise<string> {
    const all = await this.pullAll(env);
    if (!(key in all)) throw new Error(`Key "${key}" not found`);
    return all[key]!;
  }

  async listSecrets(env: string = 'dev'): Promise<SecretEntry[]> {
    const all = await this.pullAll(env);
    return Object.entries(all).map(([key, value]) => ({ key, value, env }));
  }

  async setSecret(key: string, value: string, env: string = 'dev'): Promise<void> {
    const existing = await this.pullAll(env);
    await this.pushAll({ ...existing, [key]: value }, env);
  }

  async deleteSecret(key: string, env: string = 'dev'): Promise<void> {
    const existing = await this.pullAll(env);
    if (!(key in existing)) throw new Error(`Key "${key}" not found`);
    const updated = { ...existing };
    delete updated[key];
    await this.pushAll(updated, env);
  }
}

export default ExampleProvider;
```

### Step 3: Write tests

Always mock the HTTP client or SDK to avoid real network calls in tests.

```typescript
// src/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExampleProvider } from './index.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

describe('ExampleProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when endpoint is missing', () => {
    expect(() => new ExampleProvider({ endpoint: '' })).toThrow();
  });

  it('pullAll returns key-value record', async () => {
    mockFetch.mockResolvedValueOnce(ok({ KEY: 'val' }));
    const p = new ExampleProvider({ endpoint: 'https://api.example.com', apiKey: 'tok' });
    expect(await p.pullAll('dev')).toEqual({ KEY: 'val' });
  });

  // ... add 8+ more tests covering pushAll, getSecret, setSecret, deleteSecret, error cases
});
```

### Step 4: Build and publish

```bash
pnpm build
npm publish --access public
```

### Step 5: Register in apicenter.yaml

Users add your provider with the full npm package name:

```yaml
provider:
  name: example
  package: apicenter-provider-example   # apicenter will dynamic-import this
  config:
    endpoint: "https://api.example.com"
    apiKey: "${EXAMPLE_API_KEY}"
```

## Error Handling Guidelines

- Always throw `Error` instances with descriptive messages prefixed by the provider name.
  Example: `throw new Error('ExampleProvider: Key "FOO" not found')`
- Never swallow errors silently unless falling back gracefully (e.g., returning `{}` for 404).
- Distinguish between "not found" (return empty / throw descriptive) and "auth failure" (throw immediately).

## Testing Checklist

- [ ] Constructor throws on missing required config
- [ ] `isAuthenticated()` returns false on network error
- [ ] `pullAll()` correctly maps provider response to `Record<string, string>`
- [ ] `pushAll()` sends correctly structured payload
- [ ] `getSecret()` throws when key is missing
- [ ] `listSecrets()` returns `SecretEntry[]` with correct shape
- [ ] `setSecret()` merges rather than overwrites
- [ ] `deleteSecret()` throws when key does not exist
- [ ] Credentials fall back to environment variables
- [ ] All tests use mocks (zero real network calls)
```

**생성 명령어:**

```bash
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/docs/providers
# 위 내용을 파일에 저장
```

---

## Task 6: npm 배포 파이프라인

### 6-1. release.yml 생성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    name: Build, Test, and Publish
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # required for npm provenance

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          registry-url: "https://registry.npmjs.org"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm run build --filter "@apicenter/*"

      - name: Run all tests
        run: pnpm run test --filter "@apicenter/*"

      - name: Extract version from tag
        id: version
        run: echo "VERSION=${GITHUB_REF_NAME#v}" >> $GITHUB_OUTPUT

      - name: Bump version in all packages
        run: |
          VERSION="${{ steps.version.outputs.VERSION }}"
          for dir in packages/*/; do
            pkg="${dir}package.json"
            if [ -f "$pkg" ]; then
              node -e "
                const fs = require('fs');
                const pkg = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
                pkg.version = '$VERSION';
                fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2) + '\n');
              "
            fi
          done

      - name: Generate JSON Schema
        run: pnpm --filter @apicenter/core run generate:schema

      - name: Publish @apicenter/core
        run: pnpm publish --filter @apicenter/core --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @apicenter/cli
        run: pnpm publish --filter @apicenter/cli --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @apicenter/provider-dotenv
        run: pnpm publish --filter @apicenter/provider-dotenv --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @apicenter/provider-infisical
        run: pnpm publish --filter @apicenter/provider-infisical --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @apicenter/provider-vault
        run: pnpm publish --filter @apicenter/provider-vault --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @apicenter/provider-aws
        run: pnpm publish --filter @apicenter/provider-aws --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @apicenter/provider-doppler
        run: pnpm publish --filter @apicenter/provider-doppler --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          name: Release ${{ github.ref_name }}
          body: |
            ## What's included in this release

            ### Packages published
            - `@apicenter/core@${{ steps.version.outputs.VERSION }}`
            - `@apicenter/cli@${{ steps.version.outputs.VERSION }}`
            - `@apicenter/provider-dotenv@${{ steps.version.outputs.VERSION }}`
            - `@apicenter/provider-infisical@${{ steps.version.outputs.VERSION }}`
            - `@apicenter/provider-vault@${{ steps.version.outputs.VERSION }}`
            - `@apicenter/provider-aws@${{ steps.version.outputs.VERSION }}`
            - `@apicenter/provider-doppler@${{ steps.version.outputs.VERSION }}`

            ### Install
            ```bash
            npm install -g apicenter
            npm install @apicenter/provider-vault   # HashiCorp Vault
            npm install @apicenter/provider-aws     # AWS Secrets Manager
            npm install @apicenter/provider-doppler # Doppler
            ```
          generate_release_notes: true
```

### 6-2. NPM_TOKEN 설정 방법

```bash
# GitHub 저장소 → Settings → Secrets and variables → Actions
# New repository secret: NPM_TOKEN = <npm access token>

# npm 토큰 생성 방법:
npm login
npm token create --type=automation
# 출력된 토큰을 GitHub Secret에 저장
```

### 6-3. 릴리스 트리거 방법

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter

# 태그 생성 및 push
git tag v0.3.0
git push origin v0.3.0
# GitHub Actions가 자동으로 빌드 → 테스트 → 배포 실행
```

---

## 전체 구현 순서 및 커밋 계획

```bash
# 1. provider-vault 구현
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/packages/provider-vault/src
# ... 파일 작성
pnpm --filter @apicenter/provider-vault test
git add packages/provider-vault/
git commit -m "feat: @apicenter/provider-vault - HashiCorp Vault KV v2 어댑터 추가 (v0.3.0)"

# 2. provider-aws 구현
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/packages/provider-aws/src
# ... 파일 작성
pnpm --filter @apicenter/provider-aws test
git add packages/provider-aws/
git commit -m "feat: @apicenter/provider-aws - AWS Secrets Manager 어댑터 추가 (v0.3.0)"

# 3. provider-doppler 구현
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/packages/provider-doppler/src
# ... 파일 작성
pnpm --filter @apicenter/provider-doppler test
git add packages/provider-doppler/
git commit -m "feat: @apicenter/provider-doppler - Doppler REST API v3 어댑터 추가 (v0.3.0)"

# 4. JSON Schema 생성
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/packages/core/scripts
# ... 스크립트 작성
pnpm --filter @apicenter/core build
pnpm --filter @apicenter/core run generate:schema
git add packages/core/scripts/ schemas/ packages/core/package.json
git commit -m "feat: apicenter.yaml JSON Schema 생성 스크립트 추가 (v0.3.0)"

# 5. Provider 개발 가이드 문서
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/docs/providers
# ... 문서 작성
git add docs/providers/
git commit -m "docs: Provider 개발 가이드 문서 추가 (creating-a-provider.md)"

# 6. npm 배포 파이프라인
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/.github/workflows
# ... workflow 작성
git add .github/workflows/release.yml
git commit -m "feat: npm 릴리스 자동화 GitHub Actions 워크플로우 추가 (v0.3.0)"

# 7. 태그 및 릴리스
git tag v0.3.0
git push origin main --tags
```

---

## Phase 3 완료 검증 체크리스트

- [ ] `pnpm --filter @apicenter/provider-vault test` — 10개 이상 테스트 통과
- [ ] `pnpm --filter @apicenter/provider-aws test` — 10개 이상 테스트 통과
- [ ] `pnpm --filter @apicenter/provider-doppler test` — 10개 이상 테스트 통과
- [ ] `ls schemas/apicenter.schema.json` — JSON Schema 파일 존재
- [ ] `docs/providers/creating-a-provider.md` — 가이드 문서 존재
- [ ] `.github/workflows/release.yml` — 릴리스 워크플로우 존재
- [ ] `git tag v0.3.0 && git push origin v0.3.0` — GitHub Actions 릴리스 성공
- [ ] npm에서 `@apicenter/provider-vault`, `@apicenter/provider-aws`, `@apicenter/provider-doppler` 설치 가능
