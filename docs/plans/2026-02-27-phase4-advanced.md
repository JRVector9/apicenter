# API Center Phase 4: Advanced Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 1Password 프로바이더 추가, MCP Server로 Claude Code 연동, 유틸리티 명령어, 시크릿 로테이션, 오프라인 캐시 구현

**Architecture:** 아키텍처 다이어그램의 마지막 프로바이더(1Password)를 완성하고, MCP Server로 Claude Code 음성 명령 지원, 유틸리티 명령어(provider/env/config)와 오프라인 암호화 캐시로 생태계를 완성한다.

**Tech Stack:** TypeScript 5, @modelcontextprotocol/sdk ^1.5, @1password/sdk ^0.1, node:crypto (AES-256-GCM), oclif v4, Vitest

**Current state:** 131 tests passing, 7 commands (init/pull/push/diff/scan/run/doctor), 5 providers (dotenv/infisical/vault/aws/doppler)

---

## Task 1: @apicenter/provider-1password

**Files:**
- Create: `packages/provider-1password/package.json`
- Create: `packages/provider-1password/tsconfig.json`
- Create: `packages/provider-1password/src/index.ts`
- Create: `packages/provider-1password/src/index.test.ts`

**What it does:** 1Password Service Account으로 인증. 각 환경(dev/staging/prod)은 1Password 볼트 내 아이템 하나에 매핑. 아이템의 각 필드(label=키, value=값)가 시크릿.

---

### Step 1: package.json 생성

Create `packages/provider-1password/package.json`:
```json
{
  "name": "@apicenter/provider-1password",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@apicenter/core": "workspace:*",
    "@1password/sdk": "^0.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "license": "MIT"
}
```

Create `packages/provider-1password/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declarationDir": "dist"
  },
  "include": ["src"]
}
```

---

### Step 2: 실패하는 테스트 작성

Create `packages/provider-1password/src/index.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnePasswordProvider } from './index.js';

// Mock the SDK — must be before imports
vi.mock('@1password/sdk', () => ({
  createClient: vi.fn(),
}));

describe('OnePasswordProvider', () => {
  let provider: OnePasswordProvider;
  let mockClient: {
    vaults: { listAll: ReturnType<typeof vi.fn> };
    items: {
      listAll: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      vaults: {
        listAll: vi.fn(),
      },
      items: {
        listAll: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        put: vi.fn(),
      },
    };

    provider = new OnePasswordProvider({
      service_account_token: 'test-token',
      vault: 'TestVault',
    });
    // Inject mock client to bypass real SDK init
    provider._setClient(mockClient as any);
  });

  it('should return name as "1password"', () => {
    expect(provider.name).toBe('1password');
  });

  it('isAuthenticated returns true when client is set', async () => {
    expect(await provider.isAuthenticated()).toBe(true);
  });

  it('pullAll returns empty object when item not found', async () => {
    async function* emptyVaults() {}
    async function* emptyItems() {}
    mockClient.vaults.listAll.mockReturnValue(emptyVaults());
    mockClient.items.listAll.mockReturnValue(emptyItems());

    const result = await provider.pullAll('dev');
    expect(result).toEqual({});
  });

  it('pullAll returns key-value map from item fields', async () => {
    async function* mockVaults() {
      yield { id: 'vault-1', name: 'TestVault' };
    }
    async function* mockItems() {
      yield { id: 'item-1', title: 'dev' };
    }

    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({
      id: 'item-1',
      title: 'dev',
      fields: [
        { label: 'DB_HOST', value: 'localhost' },
        { label: 'DB_PORT', value: '5432' },
        { label: '', value: 'ignored' },       // empty label skipped
        { label: 'EMPTY', value: '' },          // empty value skipped
      ],
    });

    const result = await provider.pullAll('dev');
    expect(result).toEqual({ DB_HOST: 'localhost', DB_PORT: '5432' });
  });

  it('getSecret returns value for a specific key', async () => {
    async function* mockVaults() {
      yield { id: 'vault-1', name: 'TestVault' };
    }
    async function* mockItems() {
      yield { id: 'item-1', title: 'dev' };
    }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({
      fields: [{ label: 'API_KEY', value: 'secret123' }],
    });

    expect(await provider.getSecret('API_KEY', 'dev')).toBe('secret123');
  });

  it('getSecret returns undefined when key not found', async () => {
    async function* mockVaults() {
      yield { id: 'vault-1', name: 'TestVault' };
    }
    async function* mockItems() {
      yield { id: 'item-1', title: 'dev' };
    }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({ fields: [] });

    expect(await provider.getSecret('MISSING', 'dev')).toBeUndefined();
  });

  it('listSecrets returns SecretEntry array', async () => {
    async function* mockVaults() {
      yield { id: 'vault-1', name: 'TestVault' };
    }
    async function* mockItems() {
      yield { id: 'item-1', title: 'staging' };
    }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({
      fields: [{ label: 'REDIS_URL', value: 'redis://localhost' }],
    });

    const entries = await provider.listSecrets('staging');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: 'REDIS_URL', value: 'redis://localhost', env: 'staging' });
  });

  it('pushAll creates new item when none exists', async () => {
    async function* mockVaults() {
      yield { id: 'vault-1', name: 'TestVault' };
    }
    async function* emptyItems() {}
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(emptyItems());
    mockClient.items.create.mockResolvedValue({ id: 'new-item' });

    await provider.pushAll({ DB_HOST: 'localhost', DB_PORT: '5432' }, 'dev');
    expect(mockClient.items.create).toHaveBeenCalledOnce();
    const createArg = mockClient.items.create.mock.calls[0][0];
    expect(createArg.title).toBe('dev');
    expect(createArg.vaultId).toBe('vault-1');
    const labels = createArg.fields.map((f: any) => f.label);
    expect(labels).toContain('DB_HOST');
    expect(labels).toContain('DB_PORT');
  });

  it('pushAll updates existing item when found', async () => {
    async function* mockVaults() {
      yield { id: 'vault-1', name: 'TestVault' };
    }
    async function* mockItems() {
      yield { id: 'item-existing', title: 'dev' };
    }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.put.mockResolvedValue({ id: 'item-existing' });

    await provider.pushAll({ NEW_KEY: 'new-value' }, 'dev');
    expect(mockClient.items.put).toHaveBeenCalledOnce();
    expect(mockClient.items.create).not.toHaveBeenCalled();
  });

  it('setSecret delegates to pushAll with merged secrets', async () => {
    const pullAllSpy = vi.spyOn(provider, 'pullAll').mockResolvedValue({ EXISTING: 'val' });
    const pushAllSpy = vi.spyOn(provider, 'pushAll').mockResolvedValue(undefined);

    await provider.setSecret('NEW_KEY', 'new-val', 'dev');
    expect(pushAllSpy).toHaveBeenCalledWith({ EXISTING: 'val', NEW_KEY: 'new-val' }, 'dev');
  });

  it('deleteSecret removes key and pushes remaining', async () => {
    vi.spyOn(provider, 'pullAll').mockResolvedValue({ KEY_A: 'a', KEY_B: 'b' });
    const pushAllSpy = vi.spyOn(provider, 'pushAll').mockResolvedValue(undefined);

    await provider.deleteSecret('KEY_A', 'dev');
    expect(pushAllSpy).toHaveBeenCalledWith({ KEY_B: 'b' }, 'dev');
  });

  it('uses item_prefix when configured', async () => {
    const prefixedProvider = new OnePasswordProvider({
      service_account_token: 'tok',
      vault: 'TestVault',
      item_prefix: 'myapp',
    });
    prefixedProvider._setClient(mockClient as any);

    async function* mockVaults() {
      yield { id: 'v1', name: 'TestVault' };
    }
    async function* mockItems() {
      yield { id: 'i1', title: 'myapp/dev' };
    }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({ fields: [{ label: 'K', value: 'V' }] });

    const result = await prefixedProvider.pullAll('dev');
    expect(result).toEqual({ K: 'V' });
  });
});
```

**Step 3: 테스트 실행 (실패 확인)**

```bash
cd packages/provider-1password && pnpm test
```
Expected: FAIL — `Cannot find module './index.js'`

---

### Step 4: 구현

Create `packages/provider-1password/src/index.ts`:
```typescript
import type { SecretProvider, SecretEntry, AuthConfig, SecretValue } from '@apicenter/core';

interface OnePasswordConfig {
  service_account_token?: string;
  vault: string;
  item_prefix?: string;
}

interface OpClient {
  vaults: { listAll(): AsyncIterable<{ id: string; name: string }> };
  items: {
    listAll(vaultId: string): AsyncIterable<{ id: string; title: string }>;
    get(vaultId: string, itemId: string): Promise<{
      id?: string;
      title?: string;
      fields?: Array<{ label?: string; value?: string | null }>;
    }>;
    create(item: {
      vaultId: string;
      title: string;
      category: string;
      fields: Array<{ label: string; value: string; fieldType: string }>;
    }): Promise<{ id: string }>;
    put(item: {
      id: string;
      vaultId: string;
      title: string;
      category: string;
      fields: Array<{ label: string; value: string; fieldType: string }>;
    }): Promise<{ id: string }>;
  };
}

export class OnePasswordProvider implements SecretProvider {
  name = '1password';
  private token: string;
  private vaultName: string;
  private itemPrefix: string;
  private client: OpClient | null = null;

  constructor(config: OnePasswordConfig) {
    this.token = config.service_account_token ?? process.env['OP_SERVICE_ACCOUNT_TOKEN'] ?? '';
    this.vaultName = config.vault;
    this.itemPrefix = config.item_prefix ?? '';
  }

  /** Inject mock client for testing */
  _setClient(client: OpClient): void {
    this.client = client;
  }

  private async getClient(): Promise<OpClient> {
    if (!this.client) {
      const { createClient } = await import('@1password/sdk');
      this.client = (await createClient({
        auth: this.token,
        integrationName: 'apicenter',
        integrationVersion: '0.1.0',
      })) as unknown as OpClient;
    }
    return this.client;
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    await this.getClient();
  }

  async isAuthenticated(): Promise<boolean> {
    return this.client !== null;
  }

  private async findVaultId(client: OpClient): Promise<string | null> {
    for await (const vault of client.vaults.listAll()) {
      if (vault.name === this.vaultName) return vault.id;
    }
    return null;
  }

  private itemTitle(env: string): string {
    return this.itemPrefix ? `${this.itemPrefix}/${env}` : env;
  }

  private async findItem(
    client: OpClient,
    vaultId: string,
    title: string,
  ): Promise<{ id: string; title: string } | null> {
    for await (const item of client.items.listAll(vaultId)) {
      if (item.title === title) return item;
    }
    return null;
  }

  async pullAll(env?: string): Promise<Record<string, string>> {
    const client = await this.getClient();
    const targetEnv = env ?? 'dev';
    const title = this.itemTitle(targetEnv);

    const vaultId = await this.findVaultId(client);
    if (!vaultId) return {};

    const item = await this.findItem(client, vaultId, title);
    if (!item) return {};

    const full = await client.items.get(vaultId, item.id);
    const result: Record<string, string> = {};
    for (const field of full.fields ?? []) {
      if (field.label && field.value) {
        result[field.label] = String(field.value);
      }
    }
    return result;
  }

  async pushAll(secrets: Record<string, string>, env?: string): Promise<void> {
    const client = await this.getClient();
    const targetEnv = env ?? 'dev';
    const title = this.itemTitle(targetEnv);

    const vaultId = await this.findVaultId(client);
    if (!vaultId) throw new Error(`Vault '${this.vaultName}' not found in 1Password`);

    const fields = Object.entries(secrets).map(([label, value]) => ({
      label,
      value,
      fieldType: 'CONCEALED',
    }));

    const existing = await this.findItem(client, vaultId, title);
    if (existing) {
      await client.items.put({ id: existing.id, vaultId, title, category: 'LOGIN', fields });
    } else {
      await client.items.create({ vaultId, title, category: 'LOGIN', fields });
    }
  }

  async getSecret(key: string, env?: string): Promise<SecretValue> {
    const secrets = await this.pullAll(env);
    return secrets[key];
  }

  async listSecrets(env?: string): Promise<SecretEntry[]> {
    const secrets = await this.pullAll(env);
    return Object.entries(secrets).map(([key, value]) => ({
      key,
      value,
      env: env ?? 'dev',
    }));
  }

  async setSecret(key: string, value: string, env?: string): Promise<void> {
    const existing = await this.pullAll(env);
    await this.pushAll({ ...existing, [key]: value }, env);
  }

  async deleteSecret(key: string, env?: string): Promise<void> {
    const existing = await this.pullAll(env);
    const updated = Object.fromEntries(
      Object.entries(existing).filter(([k]) => k !== key),
    );
    await this.pushAll(updated, env);
  }
}
```

**Step 5: 테스트 실행 (통과 확인)**

```bash
cd packages/provider-1password && pnpm test
```
Expected: 12 tests PASS

**Step 6: pnpm install 후 전체 테스트**

```bash
cd /path/to/apicenter && pnpm install && pnpm test
```
Expected: 143 tests pass

**Step 7: Commit**

```bash
git add packages/provider-1password/
git commit -m "feat: @apicenter/provider-1password 구현 (1Password Service Account)"
```

---

## Task 2: Utility Commands (provider list, env list, config get/set)

**Files:**
- Create: `packages/cli/src/commands/provider/list.ts`
- Create: `packages/cli/src/commands/provider/list.test.ts`
- Create: `packages/cli/src/commands/env/list.ts`
- Create: `packages/cli/src/commands/env/list.test.ts`
- Create: `packages/cli/src/commands/config/get.ts`
- Create: `packages/cli/src/commands/config/set.ts`
- Create: `packages/cli/src/commands/config/get.test.ts`
- Create: `packages/core/src/global-config/index.ts`
- Create: `packages/core/src/global-config/index.test.ts`
- Modify: `packages/core/src/index.ts` — export GlobalConfig

**What it does:**
- `apicenter provider list` — 설치된 @apicenter/provider-* 목록 출력
- `apicenter env list` — apicenter.yaml의 환경 목록 출력
- `apicenter config get <key>` / `config set <key> <value>` — `~/.config/apicenter/config.yaml` 전역 설정 관리

---

### Step 1: GlobalConfig 모듈 - 실패하는 테스트 작성

Create `packages/core/src/global-config/index.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlobalConfig } from './index.js';

describe('GlobalConfig', () => {
  let testDir: string;
  let cfg: GlobalConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `apicenter-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    cfg = new GlobalConfig(testDir);
  });

  it('get returns undefined for missing key', () => {
    expect(cfg.get('nonexistent')).toBeUndefined();
  });

  it('set and get roundtrip', () => {
    cfg.set('default_provider', 'vault');
    expect(cfg.get('default_provider')).toBe('vault');
  });

  it('persists to disk', () => {
    cfg.set('telemetry', 'false');
    const cfg2 = new GlobalConfig(testDir);
    expect(cfg2.get('telemetry')).toBe('false');
  });

  it('list returns all keys', () => {
    cfg.set('key1', 'val1');
    cfg.set('key2', 'val2');
    const all = cfg.list();
    expect(all).toMatchObject({ key1: 'val1', key2: 'val2' });
  });

  it('delete removes a key', () => {
    cfg.set('temp', 'value');
    cfg.delete('temp');
    expect(cfg.get('temp')).toBeUndefined();
  });
});
```

**Step 2: 테스트 실행 (실패 확인)**
```bash
cd packages/core && pnpm test
```
Expected: FAIL — `Cannot find module './index.js'` in global-config

---

### Step 3: GlobalConfig 구현

Create `packages/core/src/global-config/index.ts`:
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml, dump as dumpYaml } from 'js-yaml';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'apicenter');

export class GlobalConfig {
  private readonly configFile: string;
  private data: Record<string, string> = {};

  constructor(configDir?: string) {
    const dir = configDir ?? DEFAULT_CONFIG_DIR;
    this.configFile = join(dir, 'config.yaml');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configFile)) {
      this.data = {};
      return;
    }
    try {
      const content = readFileSync(this.configFile, 'utf-8');
      this.data = (parseYaml(content) as Record<string, string>) ?? {};
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    const dir = this.configFile.replace('/config.yaml', '');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.configFile, dumpYaml(this.data), 'utf-8');
  }

  get(key: string): string | undefined {
    return this.data[key];
  }

  set(key: string, value: string): void {
    this.data[key] = value;
    this.save();
  }

  delete(key: string): void {
    delete this.data[key];
    this.save();
  }

  list(): Record<string, string> {
    return { ...this.data };
  }
}
```

**Step 4: core/src/index.ts에 GlobalConfig export 추가**

```typescript
// packages/core/src/index.ts 맨 끝에 추가
export * from './global-config/index.js';
```

**Step 5: 테스트 실행 (통과 확인)**
```bash
cd packages/core && pnpm test
```
Expected: 5 new tests PASS (total core tests increase)

---

### Step 6: provider/list 명령어 구현

Create `packages/cli/src/commands/provider/list.ts`:
```typescript
import { Command } from '@oclif/core';

const ALL_PROVIDERS = ['dotenv', 'infisical', 'vault', 'aws', 'doppler', '1password'] as const;

export default class ProviderList extends Command {
  static description = '설치된 Secret Provider 목록 확인';
  static examples = ['<%= config.bin %> provider list'];

  async run(): Promise<void> {
    this.log('Secret Providers:\n');
    this.log('  Built-in:');
    this.log('    ✓ dotenv');
    this.log('');
    this.log('  External (npm install @apicenter/provider-<name>):');

    for (const name of ALL_PROVIDERS.filter((n) => n !== 'dotenv')) {
      const installed = await this.isInstalled(name);
      const icon = installed ? '✓' : '○';
      const hint = installed ? '' : '  (not installed)';
      this.log(`    ${icon} ${name}${hint}`);
    }
  }

  private async isInstalled(name: string): Promise<boolean> {
    try {
      await import(`@apicenter/provider-${name}`);
      return true;
    } catch {
      return false;
    }
  }
}
```

Create `packages/cli/src/commands/provider/add.ts`:
```typescript
import { Args, Command } from '@oclif/core';

const ALL_PROVIDERS = ['infisical', 'vault', 'aws', 'doppler', '1password'];

export default class ProviderAdd extends Command {
  static description = 'Provider 설치 안내';
  static examples = ['<%= config.bin %> provider add vault'];

  static args = {
    name: Args.string({ description: 'Provider 이름', required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ProviderAdd);

    if (!ALL_PROVIDERS.includes(args.name)) {
      this.error(
        `알 수 없는 provider: ${args.name}\n사용 가능: ${ALL_PROVIDERS.join(', ')}`,
        { exit: 1 },
      );
    }

    const pkg = `@apicenter/provider-${args.name}`;
    this.log(`\n📦 ${pkg} 설치 방법:\n`);
    this.log(`  npm:  npm install ${pkg}`);
    this.log(`  pnpm: pnpm add ${pkg}`);
    this.log(`  yarn: yarn add ${pkg}`);
    this.log(`\n설치 후 apicenter.yaml의 provider.name을 "${args.name}"으로 변경하세요.`);
  }
}
```

---

### Step 7: env/list 명령어 구현

Create `packages/cli/src/commands/env/list.ts`:
```typescript
import { Command } from '@oclif/core';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '@apicenter/core';

export default class EnvList extends Command {
  static description = 'apicenter.yaml에 정의된 환경 목록';
  static examples = ['<%= config.bin %> env list'];

  async run(): Promise<void> {
    const configPath = join(process.cwd(), 'apicenter.yaml');
    if (!existsSync(configPath)) {
      this.error('apicenter.yaml을 찾을 수 없습니다. `apicenter init`을 먼저 실행하세요.', {
        exit: 1,
      });
    }

    const config = parseConfig(readFileSync(configPath, 'utf-8'));
    const defaultEnv = config.default_env ?? 'dev';
    const envs = config.environments ?? {};

    if (Object.keys(envs).length === 0) {
      this.log(`환경이 정의되지 않았습니다. 기본 환경: ${defaultEnv}`);
      return;
    }

    this.log('Environments:\n');
    for (const [name, env] of Object.entries(envs)) {
      const isDefault = name === defaultEnv;
      const tag = isDefault ? ' (default)' : '';
      this.log(`  ${name}${tag}`);
      this.log(`    provider_env: ${env.provider_env}`);
    }
  }
}
```

---

### Step 8: config/get 및 config/set 명령어 구현

Create `packages/cli/src/commands/config/get.ts`:
```typescript
import { Args, Command } from '@oclif/core';
import { GlobalConfig } from '@apicenter/core';

export default class ConfigGet extends Command {
  static description = '전역 설정 값 조회';
  static examples = [
    '<%= config.bin %> config get default_provider',
  ];

  static args = {
    key: Args.string({ description: '설정 키', required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigGet);
    const cfg = new GlobalConfig();
    const value = cfg.get(args.key);

    if (value === undefined) {
      this.log(`(unset)`);
    } else {
      this.log(value);
    }
  }
}
```

Create `packages/cli/src/commands/config/set.ts`:
```typescript
import { Args, Command } from '@oclif/core';
import { GlobalConfig } from '@apicenter/core';

export default class ConfigSet extends Command {
  static description = '전역 설정 값 저장';
  static examples = [
    '<%= config.bin %> config set default_provider vault',
  ];

  static args = {
    key: Args.string({ description: '설정 키', required: true }),
    value: Args.string({ description: '설정 값', required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet);
    const cfg = new GlobalConfig();
    cfg.set(args.key, args.value);
    this.log(`✓ ${args.key} = ${args.value}`);
  }
}
```

**Step 9: 전체 테스트 실행**
```bash
pnpm test
```
Expected: all existing tests + 5 GlobalConfig tests PASS

**Step 10: Commit**
```bash
git add packages/core/src/global-config/ packages/core/src/index.ts \
  packages/cli/src/commands/provider/ \
  packages/cli/src/commands/env/ \
  packages/cli/src/commands/config/
git commit -m "feat: provider list/add, env list, config get/set 명령어 추가"
```

---

## Task 3: `rotate` 명령어

**Files:**
- Create: `packages/cli/src/commands/rotate.ts`
- Create: `packages/cli/src/commands/rotate.test.ts`

**What it does:** 특정 시크릿 키의 값을 새 랜덤 값으로 교체. 프로바이더가 `rotateSecret()`을 지원하면 native rotation, 아니면 수동 갱신.

---

### Step 1: 실패하는 테스트 작성

Create `packages/cli/src/commands/rotate.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test the secret generation helper and logic directly
describe('rotate command helpers', () => {
  it('generateSecret produces a string of the requested length', async () => {
    const { generateSecret } = await import('./rotate.js');
    const s = generateSecret(32);
    expect(typeof s).toBe('string');
    expect(s.length).toBe(32);
  });

  it('generateSecret produces different values each time', async () => {
    const { generateSecret } = await import('./rotate.js');
    const s1 = generateSecret(16);
    const s2 = generateSecret(16);
    expect(s1).not.toBe(s2);
  });

  it('generateSecret uses only base64url characters', async () => {
    const { generateSecret } = await import('./rotate.js');
    const s = generateSecret(64);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
```

**Step 2: 테스트 실행 (실패 확인)**
```bash
cd packages/cli && pnpm test -- rotate.test
```
Expected: FAIL — `Cannot find module './rotate.js'`

---

### Step 3: 구현

Create `packages/cli/src/commands/rotate.ts`:
```typescript
import { Args, Flags } from '@oclif/core';
import { randomBytes } from 'node:crypto';
import { BaseCommand } from '../base-command.js';

/** Exported for testing */
export function generateSecret(length: number): string {
  // Generate slightly more bytes than needed, then trim to exact length
  const bytes = randomBytes(Math.ceil(length * 0.75));
  return bytes.toString('base64url').slice(0, length);
}

export default class Rotate extends BaseCommand {
  static description = '시크릿 값 로테이션 (새 값으로 자동 갱신)';
  static examples = [
    '<%= config.bin %> rotate DB_PASSWORD',
    '<%= config.bin %> rotate API_KEY --length 48',
    '<%= config.bin %> rotate SESSION_SECRET --value "my-new-value" --yes',
  ];

  static args = {
    key: Args.string({ description: '로테이션할 시크릿 키', required: true }),
  };

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '대상 환경 (기본: default_env)',
    }),
    value: Flags.string({
      char: 'v',
      description: '새 값 지정 (미지정 시 자동 생성)',
    }),
    length: Flags.integer({
      char: 'l',
      description: '자동 생성 시 길이',
      default: 32,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: '확인 없이 실행 (CI/CD용)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { args, flags } = await this.parse(Rotate);

    const env = flags.env ?? this.defaultEnv;
    const newValue = flags.value ?? generateSecret(flags.length);

    this.log(`🔄 ${args.key} 로테이션 준비 중...`);
    this.log(`   환경: ${env}`);
    this.log(`   새 값: ${newValue.slice(0, 4)}${'*'.repeat(Math.min(newValue.length - 4, 20))} (${newValue.length}자)`);

    if (!flags.yes) {
      this.log('\n계속하려면 --yes 플래그를 사용하세요.');
      return;
    }

    // Use native rotation if provider supports it
    if (typeof (this.provider as any).rotateSecret === 'function') {
      const rotated = await (this.provider as any).rotateSecret(args.key, env);
      this.log(`✅ ${args.key} 네이티브 로테이션 완료: ${String(rotated ?? '').slice(0, 4)}***`);
      return;
    }

    // Manual rotation: set the new value
    await this.provider.setSecret(args.key, newValue, env);
    this.log(`✅ ${args.key} 로테이션 완료`);
  }
}
```

**Step 4: 테스트 실행 (통과 확인)**
```bash
cd packages/cli && pnpm test -- rotate.test
```
Expected: 3 tests PASS

**Step 5: Commit**
```bash
git add packages/cli/src/commands/rotate.ts packages/cli/src/commands/rotate.test.ts
git commit -m "feat: apicenter rotate 명령어 추가 (시크릿 자동 로테이션)"
```

---

## Task 4: 오프라인 암호화 캐시

**Files:**
- Create: `packages/core/src/cache/index.ts`
- Create: `packages/core/src/cache/index.test.ts`
- Modify: `packages/core/src/index.ts` — export SecretCache
- Modify: `packages/cli/src/commands/pull.ts` — `--cache` 플래그 추가

**What it does:** `~/.config/apicenter/cache/{provider}-{env}.enc`에 AES-256-GCM으로 시크릿을 암호화 저장. `pull --cache` 시 provider 접속 실패 시 캐시 폴백.

---

### Step 1: 실패하는 테스트 작성

Create `packages/core/src/cache/index.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecretCache } from './index.js';

describe('SecretCache', () => {
  let cacheDir: string;
  let cache: SecretCache;

  beforeEach(() => {
    cacheDir = join(tmpdir(), `apicenter-cache-test-${Date.now()}`);
    mkdirSync(cacheDir, { recursive: true });
    cache = new SecretCache(cacheDir);
  });

  it('returns null for non-existent cache', () => {
    expect(cache.load('dotenv', 'dev')).toBeNull();
  });

  it('save and load roundtrip', () => {
    const secrets = { DB_HOST: 'localhost', API_KEY: 'secret123' };
    cache.save('dotenv', 'dev', secrets);
    const loaded = cache.load('dotenv', 'dev');
    expect(loaded).toEqual(secrets);
  });

  it('different provider/env combos are independent', () => {
    cache.save('vault', 'dev', { A: '1' });
    cache.save('vault', 'prod', { A: '2' });
    expect(cache.load('vault', 'dev')).toEqual({ A: '1' });
    expect(cache.load('vault', 'prod')).toEqual({ A: '2' });
  });

  it('data is not plaintext in the cache file', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    cache.save('test', 'dev', { SECRET_KEY: 'super-secret-value' });
    const raw = readFileSync(join(cacheDir, 'test-dev.enc'));
    expect(raw.toString()).not.toContain('super-secret-value');
  });

  it('clear removes specific cache file', () => {
    cache.save('doppler', 'dev', { KEY: 'val' });
    cache.clear('doppler', 'dev');
    expect(cache.load('doppler', 'dev')).toBeNull();
  });

  it('clear all removes all cache files', () => {
    cache.save('a', 'dev', { K: 'v' });
    cache.save('b', 'dev', { K: 'v' });
    cache.clearAll();
    expect(cache.load('a', 'dev')).toBeNull();
    expect(cache.load('b', 'dev')).toBeNull();
  });

  it('returns null for corrupted cache', () => {
    const { writeFileSync } = require('node:fs');
    const { join } = require('node:path');
    writeFileSync(join(cacheDir, 'bad-dev.enc'), Buffer.from('corrupted data'));
    expect(cache.load('bad', 'dev')).toBeNull();
  });
});
```

**Step 2: 테스트 실행 (실패 확인)**
```bash
cd packages/core && pnpm test -- cache
```
Expected: FAIL

---

### Step 3: 구현

Create `packages/core/src/cache/index.ts`:
```typescript
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';

const DEFAULT_CACHE_DIR = join(homedir(), '.config', 'apicenter', 'cache');
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const SALT = Buffer.from('apicenter-cache-salt-v1');

function deriveKey(): Buffer {
  const password = `${process.env['USER'] ?? 'apicenter'}-${hostname()}`;
  return scryptSync(password, SALT, KEY_LEN) as Buffer;
}

export class SecretCache {
  private readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? DEFAULT_CACHE_DIR;
  }

  save(provider: string, env: string, secrets: Record<string, string>): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    const key = deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(secrets);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Layout: [12 bytes IV][16 bytes authTag][N bytes encrypted]
    const payload = Buffer.concat([iv, authTag, encrypted]);
    writeFileSync(this.cacheFile(provider, env), payload);
  }

  load(provider: string, env: string): Record<string, string> | null {
    const file = this.cacheFile(provider, env);
    if (!existsSync(file)) return null;

    try {
      const payload = readFileSync(file);
      if (payload.length < 28) return null; // too short to be valid

      const iv = payload.subarray(0, 12);
      const authTag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);

      const key = deriveKey();
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
    } catch {
      return null;
    }
  }

  clear(provider: string, env: string): void {
    const file = this.cacheFile(provider, env);
    if (existsSync(file)) unlinkSync(file);
  }

  clearAll(): void {
    if (!existsSync(this.cacheDir)) return;
    for (const f of readdirSync(this.cacheDir)) {
      if (f.endsWith('.enc')) {
        unlinkSync(join(this.cacheDir, f));
      }
    }
  }

  private cacheFile(provider: string, env: string): string {
    return join(this.cacheDir, `${provider}-${env}.enc`);
  }
}
```

**Step 4: core/src/index.ts에 SecretCache export 추가**

기존 `packages/core/src/index.ts` 맨 끝에 추가:
```typescript
export * from './cache/index.js';
```

**Step 5: pull.ts에 --cache 플래그 추가**

`packages/cli/src/commands/pull.ts`의 flags 섹션에 추가:
```typescript
cache: Flags.boolean({
  description: 'Provider 접속 실패 시 로컬 캐시 사용',
  default: false,
}),
```

그리고 `run()` 내부에서 provider.pullAll() 호출 부분을 감싸기:
```typescript
const { SecretCache } = await import('@apicenter/core');
const secretCache = new SecretCache();
let secrets: Record<string, string>;

try {
  secrets = await this.provider.pullAll(env);
  // Always update cache after successful pull
  secretCache.save(this.config_.provider.name, env, secrets);
} catch (err) {
  if (flags.cache) {
    const cached = secretCache.load(this.config_.provider.name, env);
    if (cached) {
      this.log('⚠️  Provider 접속 실패 — 캐시에서 로드합니다.');
      secrets = cached;
    } else {
      throw err;
    }
  } else {
    throw err;
  }
}
```

**Step 6: 전체 테스트 실행**
```bash
pnpm test
```
Expected: all previous + 7 cache tests PASS

**Step 7: Commit**
```bash
git add packages/core/src/cache/ packages/core/src/index.ts packages/cli/src/commands/pull.ts
git commit -m "feat: SecretCache 오프라인 암호화 캐시 (AES-256-GCM) + pull --cache 플래그"
```

---

## Task 5: MCP Server

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/src/index.test.ts`
- Create: `packages/cli/src/commands/mcp/start.ts`

**What it does:** Claude Code에서 `apicenter` MCP 서버를 통해 시크릿 관리. 지원 도구: `list_secrets`, `get_secret`, `set_secret`, `pull_secrets`, `scan_project`.

**Claude Code 설정 후 사용 예시:**
```
"API_KEY 값 뭐야?" → get_secret('API_KEY')
"dev 환경 시크릿 목록 보여줘" → list_secrets({ env: 'dev' })
"REDIS_URL을 redis://prod:6379로 변경해줘" → set_secret('REDIS_URL', 'redis://prod:6379')
```

---

### Step 1: package.json 생성

Create `packages/mcp-server/package.json`:
```json
{
  "name": "@apicenter/mcp-server",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "MCP Server for API Center — enables Claude Code secret management",
  "main": "./dist/index.js",
  "bin": {
    "apicenter-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@apicenter/core": "workspace:*",
    "@apicenter/provider-dotenv": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.5.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "keywords": ["mcp", "secrets", "claude", "ai"],
  "license": "MIT"
}
```

Create `packages/mcp-server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declarationDir": "dist"
  },
  "include": ["src"]
}
```

---

### Step 2: 실패하는 테스트 작성

Create `packages/mcp-server/src/index.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildToolHandlers } from './index.js';

// Mock filesystem and core modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@apicenter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apicenter/core')>();
  return {
    ...actual,
    parseConfig: vi.fn(),
    globalRegistry: {
      has: vi.fn(),
      register: vi.fn(),
      resolve: vi.fn(),
    },
    scanDirectory: vi.fn(),
  };
});

vi.mock('@apicenter/provider-dotenv', () => ({
  DotenvProvider: vi.fn(),
}));

describe('MCP tool handlers', () => {
  let mockProvider: {
    pullAll: ReturnType<typeof vi.fn>;
    getSecret: ReturnType<typeof vi.fn>;
    setSecret: ReturnType<typeof vi.fn>;
    pushAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      pullAll: vi.fn(),
      getSecret: vi.fn(),
      setSecret: vi.fn(),
      pushAll: vi.fn(),
    };
  });

  it('list_secrets returns key list without values', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { parseConfig, globalRegistry } = await import('@apicenter/core');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('version: "1"\nprovider:\n  name: dotenv' as any);
    vi.mocked(parseConfig).mockReturnValue({
      version: '1',
      provider: { name: 'dotenv' },
      default_env: 'dev',
    } as any);
    vi.mocked(globalRegistry.has).mockReturnValue(true);
    vi.mocked(globalRegistry.resolve).mockReturnValue(mockProvider as any);
    mockProvider.pullAll.mockResolvedValue({ DB_HOST: 'localhost', API_KEY: 'secret' });

    const handlers = buildToolHandlers('/test/project');
    const result = await handlers.list_secrets({ env: 'dev' });

    expect(result.content[0].text).toContain('DB_HOST');
    expect(result.content[0].text).toContain('API_KEY');
    expect(result.content[0].text).not.toContain('localhost');
    expect(result.content[0].text).not.toContain('secret');
  });

  it('get_secret returns masked value for security', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { parseConfig, globalRegistry } = await import('@apicenter/core');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('version: "1"\nprovider:\n  name: dotenv' as any);
    vi.mocked(parseConfig).mockReturnValue({
      version: '1',
      provider: { name: 'dotenv' },
      default_env: 'dev',
    } as any);
    vi.mocked(globalRegistry.has).mockReturnValue(true);
    vi.mocked(globalRegistry.resolve).mockReturnValue(mockProvider as any);
    mockProvider.getSecret.mockResolvedValue('super-secret-value');

    const handlers = buildToolHandlers('/test/project');
    const result = await handlers.get_secret({ key: 'API_KEY', env: 'dev', show_value: false });

    expect(result.content[0].text).toContain('API_KEY');
    expect(result.content[0].text).not.toContain('super-secret-value');
  });

  it('get_secret returns actual value when show_value is true', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { parseConfig, globalRegistry } = await import('@apicenter/core');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('version: "1"\nprovider:\n  name: dotenv' as any);
    vi.mocked(parseConfig).mockReturnValue({
      version: '1',
      provider: { name: 'dotenv' },
      default_env: 'dev',
    } as any);
    vi.mocked(globalRegistry.has).mockReturnValue(true);
    vi.mocked(globalRegistry.resolve).mockReturnValue(mockProvider as any);
    mockProvider.getSecret.mockResolvedValue('super-secret-value');

    const handlers = buildToolHandlers('/test/project');
    const result = await handlers.get_secret({ key: 'API_KEY', env: 'dev', show_value: true });

    expect(result.content[0].text).toContain('super-secret-value');
  });

  it('set_secret calls provider.setSecret', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { parseConfig, globalRegistry } = await import('@apicenter/core');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('version: "1"\nprovider:\n  name: dotenv' as any);
    vi.mocked(parseConfig).mockReturnValue({
      version: '1',
      provider: { name: 'dotenv' },
      default_env: 'dev',
    } as any);
    vi.mocked(globalRegistry.has).mockReturnValue(true);
    vi.mocked(globalRegistry.resolve).mockReturnValue(mockProvider as any);
    mockProvider.setSecret.mockResolvedValue(undefined);

    const handlers = buildToolHandlers('/test/project');
    await handlers.set_secret({ key: 'NEW_KEY', value: 'new-value', env: 'dev' });

    expect(mockProvider.setSecret).toHaveBeenCalledWith('NEW_KEY', 'new-value', 'dev');
  });

  it('scan_project returns unique keys list', async () => {
    const { scanDirectory } = await import('@apicenter/core');
    vi.mocked(scanDirectory).mockResolvedValue({
      matches: [],
      uniqueKeys: ['DB_HOST', 'API_KEY', 'REDIS_URL'],
      fileCount: 5,
    });

    const handlers = buildToolHandlers('/test/project');
    const result = await handlers.scan_project({});

    expect(result.content[0].text).toContain('DB_HOST');
    expect(result.content[0].text).toContain('3 unique');
  });
});
```

**Step 3: 테스트 실행 (실패 확인)**
```bash
cd packages/mcp-server && pnpm test
```
Expected: FAIL

---

### Step 4: MCP Server 구현

Create `packages/mcp-server/src/index.ts`:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, globalRegistry, scanDirectory, type SecretProvider } from '@apicenter/core';
import { DotenvProvider } from '@apicenter/provider-dotenv';

// Register dotenv as built-in provider
globalRegistry.register(
  'dotenv',
  (cfg) => new DotenvProvider({ path: (cfg['path'] as string) ?? '.env' }),
);

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function loadConfig(cwd: string) {
  const configPath = join(cwd, 'apicenter.yaml');
  if (!existsSync(configPath)) {
    throw new Error('apicenter.yaml not found. Run `apicenter init` first.');
  }
  return parseConfig(readFileSync(configPath, 'utf-8'));
}

async function resolveProvider(
  cwd: string,
): Promise<{ provider: SecretProvider; config: ReturnType<typeof loadConfig> }> {
  const config = loadConfig(cwd);
  const { name, config: providerConfig } = config.provider;
  const pc = (providerConfig ?? {}) as Record<string, unknown>;

  let provider: SecretProvider;
  if (globalRegistry.has(name)) {
    provider = globalRegistry.resolve(name, pc);
  } else {
    try {
      const mod = await import(`@apicenter/provider-${name}`);
      const Cls = (mod.default ?? Object.values(mod)[0]) as new (c: unknown) => SecretProvider;
      provider = new Cls(pc);
    } catch {
      throw new Error(
        `Provider '${name}' is not installed. Run: npm install @apicenter/provider-${name}`,
      );
    }
  }

  return { provider, config };
}

/** Build tool handlers for a given project directory — exported for testing */
export function buildToolHandlers(cwd: string) {
  return {
    async list_secrets({ env }: { env?: string }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      const secrets = await provider.pullAll(targetEnv);
      const keys = Object.keys(secrets);
      return {
        content: [
          {
            type: 'text',
            text:
              keys.length === 0
                ? `No secrets found in '${targetEnv}' environment.`
                : `Found ${keys.length} secrets in '${targetEnv}':\n${keys.map((k) => `  - ${k}`).join('\n')}`,
          },
        ],
      };
    },

    async get_secret({
      key,
      env,
      show_value,
    }: {
      key: string;
      env?: string;
      show_value?: boolean;
    }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      const value = await provider.getSecret(key, targetEnv);

      if (value === undefined) {
        return { content: [{ type: 'text', text: `Secret '${key}' not found in '${targetEnv}'.` }] };
      }

      const display = show_value ? value : `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 4, 20))}`;
      return {
        content: [
          {
            type: 'text',
            text: `${key} = ${display}${!show_value ? '\n\n(Use show_value: true to reveal the full value)' : ''}`,
          },
        ],
      };
    },

    async set_secret({
      key,
      value,
      env,
    }: {
      key: string;
      value: string;
      env?: string;
    }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      await provider.setSecret(key, value, targetEnv);
      return {
        content: [{ type: 'text', text: `✅ Set '${key}' in '${targetEnv}' environment.` }],
      };
    },

    async pull_secrets({
      env,
      output_path,
    }: {
      env?: string;
      output_path?: string;
    }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      const secrets = await provider.pullAll(targetEnv);
      const count = Object.keys(secrets).length;
      const outPath = join(cwd, output_path ?? config.output?.path ?? '.env.local');
      const content = Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
      writeFileSync(outPath, content);
      return {
        content: [
          { type: 'text', text: `✅ Pulled ${count} secrets to ${outPath}` },
        ],
      };
    },

    async scan_project(_args: Record<string, unknown>): Promise<ToolResult> {
      const result = await scanDirectory({ cwd });
      return {
        content: [
          {
            type: 'text',
            text:
              `Found ${result.uniqueKeys.length} unique environment variables in ${result.fileCount} files:\n` +
              result.uniqueKeys.map((k) => `  - ${k}`).join('\n'),
          },
        ],
      };
    },
  };
}

/** Start the MCP server (stdio transport) */
export async function startServer(cwd: string): Promise<void> {
  const handlers = buildToolHandlers(cwd);

  const server = new McpServer({
    name: 'apicenter',
    version: '0.1.0',
  });

  server.tool(
    'list_secrets',
    'List all secret keys from the configured provider (values are NOT returned for security)',
    { env: z.string().optional().describe('Environment name (e.g., dev, staging, prod)') },
    async (args) => handlers.list_secrets(args),
  );

  server.tool(
    'get_secret',
    'Get the value of a specific secret. Values are masked by default.',
    {
      key: z.string().describe('Secret key name (e.g., DATABASE_URL)'),
      env: z.string().optional().describe('Environment name'),
      show_value: z.boolean().optional().describe('Set true to show the actual value (default: false)'),
    },
    async (args) => handlers.get_secret(args),
  );

  server.tool(
    'set_secret',
    'Set or update a secret value in the configured provider',
    {
      key: z.string().describe('Secret key name'),
      value: z.string().describe('Secret value'),
      env: z.string().optional().describe('Environment name'),
    },
    async (args) => handlers.set_secret(args),
  );

  server.tool(
    'pull_secrets',
    'Pull all secrets from the provider and save to a local .env file',
    {
      env: z.string().optional().describe('Environment name'),
      output_path: z.string().optional().describe('Output file path (default: .env.local)'),
    },
    async (args) => handlers.pull_secrets(args),
  );

  server.tool(
    'scan_project',
    'Scan the project source code to find all environment variable references',
    {},
    async (args) => handlers.scan_project(args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('apicenter MCP server running on stdio\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(process.cwd()).catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
```

**Step 5: CLI에 `apicenter mcp start` 명령어 추가**

Create `packages/cli/src/commands/mcp/start.ts`:
```typescript
import { Command } from '@oclif/core';
import { startServer } from '@apicenter/mcp-server';

export default class McpStart extends Command {
  static description = 'Claude Code용 MCP 서버 시작 (stdio 모드)';
  static examples = ['<%= config.bin %> mcp start'];
  static hidden = false;

  async run(): Promise<void> {
    await startServer(process.cwd());
  }
}
```

`packages/cli/package.json`의 `dependencies`에 추가:
```json
"@apicenter/mcp-server": "workspace:*"
```

**Step 6: pnpm install 후 테스트**
```bash
pnpm install && pnpm test
```
Expected: 5 new MCP server tests PASS

**Step 7: Commit**
```bash
git add packages/mcp-server/ packages/cli/src/commands/mcp/ packages/cli/package.json
git commit -m "feat: @apicenter/mcp-server + apicenter mcp start 명령어 (Claude Code 연동)"
```

---

## Task 6: CONTRIBUTING.md + 예제 프로젝트

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `examples/nextjs/apicenter.yaml`
- Create: `examples/nextjs/.env.example`
- Create: `examples/express/apicenter.yaml`
- Create: `examples/express/.env.example`

---

### Step 1: CONTRIBUTING.md 작성

Create `CONTRIBUTING.md`:
```markdown
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

## Building a New Provider

1. Copy the template:
```bash
cp -r packages/provider-doppler packages/provider-myservice
```

2. Update `package.json`:
   - Change `name` to `@apicenter/provider-myservice`
   - Replace `@1password/sdk` with your SDK

3. Implement `SecretProvider` interface in `src/index.ts`

4. Write tests in `src/index.test.ts` using `vi.mock()` for your SDK

5. Add your provider to `packages/core/src/config/schema.ts`:
```typescript
export const SUPPORTED_PROVIDERS = [
  'dotenv', 'infisical', 'vault', 'aws', 'doppler', '1password', 'myservice'
] as const;
```

See [docs/providers/creating-a-provider.md](docs/providers/creating-a-provider.md) for full guide.

## Running Tests

```bash
pnpm test                    # all packages
pnpm --filter @apicenter/core test  # specific package
```

## Commit Convention

```
feat: add new feature
fix: bug fix
docs: documentation
test: tests only
refactor: refactor without feature change
```

## Pull Request

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-feature`
3. Write tests first (TDD)
4. Run `pnpm test` and ensure all tests pass
5. Submit a PR with a clear description
```

---

### Step 2: 예제 프로젝트 생성

Create `examples/nextjs/apicenter.yaml`:
```yaml
# API Center — Next.js Example
version: "1"

provider:
  name: dotenv
  config:
    path: .env.local

environments:
  dev:
    provider_env: development
  staging:
    provider_env: staging
  prod:
    provider_env: production

default_env: dev

output:
  format: dotenv
  path: .env.local

scan:
  include:
    - "app/**"
    - "src/**"
    - "lib/**"
  exclude:
    - "node_modules/**"
    - ".next/**"
```

Create `examples/nextjs/.env.example`:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/myapp

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret

# APIs
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Optional
SENTRY_DSN=https://...@sentry.io/...
```

Create `examples/express/apicenter.yaml`:
```yaml
# API Center — Express.js Example
version: "1"

provider:
  name: dotenv
  config:
    path: .env

default_env: dev

output:
  format: dotenv
  path: .env

scan:
  include:
    - "src/**"
    - "routes/**"
    - "middleware/**"
  exclude:
    - "node_modules/**"
    - "dist/**"
```

Create `examples/express/.env.example`:
```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/expressapp

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# External APIs
SENDGRID_API_KEY=SG....
REDIS_URL=redis://localhost:6379
```

**Step 3: 전체 테스트 최종 확인**
```bash
pnpm test
```
Expected: all tests PASS (131 original + ~30 new = ~161+ total)

**Step 4: Commit**
```bash
git add CONTRIBUTING.md examples/
git commit -m "docs: CONTRIBUTING.md + nextjs/express 예제 프로젝트 추가"
```

---

## Claude Code MCP 설정 방법

Phase 4 완료 후 사용자가 프로젝트에 추가하는 방법:

**`.mcp.json` 또는 `.claude/settings.local.json`:**
```json
{
  "mcpServers": {
    "apicenter": {
      "command": "apicenter",
      "args": ["mcp", "start"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

**사용 예:**
```
"dev 환경 시크릿 목록 보여줘"       → list_secrets({ env: 'dev' })
"DATABASE_URL 값이 뭐야?"           → get_secret({ key: 'DATABASE_URL', show_value: true })
"API_KEY를 새 값으로 변경해줘"      → set_secret({ key: 'API_KEY', value: '...' })
"이 프로젝트에서 어떤 env 변수 써?" → scan_project()
"시크릿 파일 로컬에 다운받아줘"     → pull_secrets({ env: 'dev' })
```

---

## 완료 후 최종 상태

| 항목 | 내용 |
|------|------|
| Providers | dotenv, infisical, vault, aws, doppler, **1password** (6개) |
| CLI Commands | init, pull, push, diff, scan, run, doctor, rotate, **provider list/add, env list, config get/set, mcp start** (14개) |
| Packages | core, cli, provider-dotenv/infisical/vault/aws/doppler/**1password**, **mcp-server** (9개) |
| Tests | 131 → ~161+ |
| Claude Code | MCP Server 연동으로 음성 명령 시크릿 관리 가능 |
