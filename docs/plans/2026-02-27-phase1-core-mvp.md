# Phase 1: Core MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** dotenv Provider로 동작하는 `apicenter` CLI MVP 구현 — `init`, `pull`, `push`, `diff` 명령어 완성

**Architecture:** Turborepo 모노레포 + pnpm workspace 구조로 `core`, `cli`, `provider-dotenv` 3개 패키지를 분리한다. oclif CLI 프레임워크를 사용해 명령어를 구현하고, `SecretProvider` 인터페이스로 Provider를 추상화한다.

**Tech Stack:** TypeScript 5, oclif v4, Turborepo, pnpm, Vitest, zod, js-yaml, dotenv

---

## 전체 패키지 구조 (완성 시)

```
apicenter/
├── packages/
│   ├── core/                    # @apicenter/core
│   │   ├── src/
│   │   │   ├── types/           # SecretProvider 인터페이스, 공유 타입
│   │   │   ├── config/          # apicenter.yaml 파서 + zod 스키마
│   │   │   ├── logger/          # SecureLogger
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── provider-dotenv/         # @apicenter/provider-dotenv
│   │   ├── src/
│   │   │   └── index.ts         # DotenvProvider implements SecretProvider
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/                     # apicenter (배포용)
│       ├── src/
│       │   └── commands/
│       │       ├── init.ts
│       │       ├── pull.ts
│       │       ├── push.ts
│       │       └── diff.ts
│       ├── package.json
│       └── tsconfig.json
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                 # root
└── tsconfig.base.json
```

---

## Task 1: Monorepo 기본 구조 세팅

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

**Step 1: root package.json 생성**

```json
{
  "name": "apicenter-monorepo",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: pnpm-workspace.yaml 생성**

```yaml
packages:
  - "packages/*"
```

**Step 3: turbo.json 생성**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Step 4: tsconfig.base.json 생성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

**Step 5: .gitignore 생성**

```
node_modules/
dist/
.env
.env.local
.env.*
!.env.example
*.env
.turbo/
coverage/
```

**Step 6: 패키지 디렉토리 생성**

```bash
mkdir -p packages/core/src/{types,config,logger}
mkdir -p packages/provider-dotenv/src
mkdir -p packages/cli/src/commands
```

**Step 7: pnpm 및 turbo 설치**

```bash
# root에서
npm install -g pnpm@9
pnpm install
```

**Step 8: Commit**

```bash
git init
git add .
git commit -m "chore: monorepo 기본 구조 세팅 (Turborepo + pnpm)"
```

---

## Task 2: @apicenter/core — 공유 타입 정의

**Files:**
- Create: `packages/core/src/types/index.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

**Step 1: packages/core/package.json 생성**

```json
{
  "name": "@apicenter/core",
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
    "dev": "tsc --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "zod": "^3.23.0"
  }
}
```

**Step 2: packages/core/tsconfig.json 생성**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: packages/core/src/types/index.ts 생성**

```typescript
// 시크릿 단건 항목
export interface SecretEntry {
  key: string;
  value: string;
  env?: string;
  source?: string;     // 어디서 왔는지 (파일 경로 등)
  updatedAt?: Date;
}

// 시크릿 값 (string 또는 undefined)
export type SecretValue = string | undefined;

// Provider 인증 설정 (Provider별로 다름)
export type AuthConfig = Record<string, unknown>;

// 히스토리 항목
export interface SecretHistory {
  key: string;
  value: string;
  changedAt: Date;
  changedBy?: string;
}

// 모든 시크릿 Provider가 구현해야 하는 인터페이스
export interface SecretProvider {
  name: string;

  // 인증
  authenticate(config: AuthConfig): Promise<void>;
  isAuthenticated(): Promise<boolean>;

  // CRUD
  getSecret(key: string, env?: string): Promise<SecretValue>;
  listSecrets(env?: string): Promise<SecretEntry[]>;
  setSecret(key: string, value: string, env?: string): Promise<void>;
  deleteSecret(key: string, env?: string): Promise<void>;

  // 벌크 작업
  pullAll(env?: string): Promise<Record<string, string>>;
  pushAll(secrets: Record<string, string>, env?: string): Promise<void>;

  // 선택 구현 (Optional)
  getEnvironments?(): Promise<string[]>;
  getHistory?(key: string): Promise<SecretHistory[]>;
  rotateSecret?(key: string): Promise<string>;
}

// diff 결과 항목
export type DiffStatus = 'added' | 'removed' | 'changed' | 'synced';

export interface DiffEntry {
  key: string;
  status: DiffStatus;
  localValue?: string;
  remoteValue?: string;
}

// apicenter 에러 타입
export class ApicenterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApicenterError';
  }
}
```

**Step 4: packages/core/src/index.ts 생성**

```typescript
export * from './types/index.js';
export * from './config/index.js';
export * from './logger/index.js';
```

**Step 5: Vitest 테스트 파일 생성 (types는 타입이므로 컴파일 검증)**

`packages/core/src/types/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ApicenterError } from './index.js';

describe('ApicenterError', () => {
  it('code와 message를 가진 에러를 생성해야 한다', () => {
    const err = new ApicenterError('Provider not found', 'PROVIDER_NOT_FOUND');
    expect(err.message).toBe('Provider not found');
    expect(err.code).toBe('PROVIDER_NOT_FOUND');
    expect(err.name).toBe('ApicenterError');
  });

  it('Error를 상속해야 한다', () => {
    const err = new ApicenterError('test', 'TEST');
    expect(err).toBeInstanceOf(Error);
  });
});
```

**Step 6: 테스트 실행 (실패 확인 — 아직 파일 없음)**

```bash
cd packages/core && pnpm test
# Expected: FAIL (파일 없음)
```

**Step 7: 테스트 통과 확인**

```bash
pnpm build && pnpm test
# Expected: PASS
```

**Step 8: Commit**

```bash
git add packages/core/
git commit -m "feat: @apicenter/core 공유 타입 및 인터페이스 정의"
```

---

## Task 3: SecureLogger 구현

**Files:**
- Create: `packages/core/src/logger/index.ts`
- Create: `packages/core/src/logger/index.test.ts`

**Step 1: 테스트 먼저 작성**

`packages/core/src/logger/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SecureLogger } from './index.js';

describe('SecureLogger', () => {
  it('등록된 시크릿 값을 ***로 마스킹해야 한다', () => {
    const logger = new SecureLogger();
    logger.register('supersecret123');
    const result = logger.mask('DB_PASSWORD=supersecret123');
    expect(result).toBe('DB_PASSWORD=***');
    expect(result).not.toContain('supersecret123');
  });

  it('여러 시크릿을 모두 마스킹해야 한다', () => {
    const logger = new SecureLogger();
    logger.register('password1');
    logger.register('apikey2');
    const result = logger.mask('pw=password1 key=apikey2');
    expect(result).toBe('pw=*** key=***');
  });

  it('4자 미만 값은 등록되지 않아야 한다 (오탐 방지)', () => {
    const logger = new SecureLogger();
    logger.register('abc');
    const result = logger.mask('abc is short');
    expect(result).toBe('abc is short');
  });

  it('빈 문자열을 안전하게 처리해야 한다', () => {
    const logger = new SecureLogger();
    const result = logger.mask('');
    expect(result).toBe('');
  });

  it('clear() 호출 시 모든 시크릿이 제거되어야 한다', () => {
    const logger = new SecureLogger();
    logger.register('mysecret');
    logger.clear();
    const result = logger.mask('value=mysecret');
    expect(result).toBe('value=mysecret');
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
cd packages/core && pnpm test
# Expected: FAIL (SecureLogger not found)
```

**Step 3: SecureLogger 구현**

`packages/core/src/logger/index.ts`:

```typescript
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export class SecureLogger {
  private sensitiveValues: Set<string> = new Set();

  /** 마스킹할 시크릿 값 등록 */
  register(value: string): void {
    if (value.length >= 4) {
      this.sensitiveValues.add(value);
    }
  }

  /** 등록된 모든 시크릿을 *** 로 치환 */
  mask(text: string): string {
    let masked = text;
    for (const secret of this.sensitiveValues) {
      // 정규식 특수문자 이스케이프 후 전체 치환
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replaceAll(new RegExp(escaped, 'g'), '***');
    }
    return masked;
  }

  /** 등록된 시크릿 초기화 */
  clear(): void {
    this.sensitiveValues.clear();
  }

  /** 마스킹 후 콘솔 출력 */
  log(level: LogLevel, message: string): void {
    const safe = this.mask(message);
    console[level](safe);
  }
}
```

**Step 4: 테스트 통과 확인**

```bash
cd packages/core && pnpm test
# Expected: PASS (5 tests)
```

**Step 5: Commit**

```bash
git add packages/core/src/logger/
git commit -m "feat: SecureLogger 구현 — 시크릿 자동 마스킹"
```

---

## Task 4: apicenter.yaml 설정 파서 구현

**Files:**
- Create: `packages/core/src/config/schema.ts`
- Create: `packages/core/src/config/parser.ts`
- Create: `packages/core/src/config/index.ts`
- Create: `packages/core/src/config/index.test.ts`

**Step 1: 테스트 먼저 작성**

`packages/core/src/config/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseConfig, validateConfig } from './index.js';

const minimalYaml = `
version: "1"
provider:
  name: dotenv
  config:
    path: .env
`;

const fullYaml = `
version: "1"
provider:
  name: dotenv
  config:
    path: .env
environments:
  dev:
    provider_env: development
  prod:
    provider_env: production
default_env: dev
output:
  format: dotenv
  path: .env.local
`;

describe('parseConfig', () => {
  it('최소 설정 YAML을 파싱해야 한다', () => {
    const config = parseConfig(minimalYaml);
    expect(config.version).toBe('1');
    expect(config.provider.name).toBe('dotenv');
    expect(config.provider.config?.path).toBe('.env');
  });

  it('전체 설정 YAML을 파싱해야 한다', () => {
    const config = parseConfig(fullYaml);
    expect(config.default_env).toBe('dev');
    expect(config.environments?.dev?.provider_env).toBe('development');
    expect(config.output?.format).toBe('dotenv');
    expect(config.output?.path).toBe('.env.local');
  });

  it('잘못된 YAML에서 에러를 던져야 한다', () => {
    expect(() => parseConfig('invalid: yaml: [')).toThrow();
  });
});

describe('validateConfig', () => {
  it('필수 필드 누락 시 에러를 던져야 한다', () => {
    expect(() => validateConfig({ version: '1' })).toThrow();
  });

  it('지원하지 않는 provider name에서 에러를 던져야 한다', () => {
    expect(() =>
      validateConfig({ version: '1', provider: { name: 'unknown_provider' } }),
    ).toThrow();
  });

  it('유효한 설정을 통과시켜야 한다', () => {
    expect(() =>
      validateConfig({ version: '1', provider: { name: 'dotenv' } }),
    ).not.toThrow();
  });
});
```

**Step 2: zod 스키마 정의**

`packages/core/src/config/schema.ts`:

```typescript
import { z } from 'zod';

export const SUPPORTED_PROVIDERS = ['dotenv', 'infisical', 'vault', 'aws', 'doppler', '1password'] as const;
export type ProviderName = typeof SUPPORTED_PROVIDERS[number];

export const ConfigSchema = z.object({
  version: z.literal('1'),
  provider: z.object({
    name: z.enum(SUPPORTED_PROVIDERS),
    config: z.record(z.unknown()).optional(),
  }),
  environments: z
    .record(
      z.object({
        provider_env: z.string(),
      }),
    )
    .optional(),
  default_env: z.string().optional(),
  groups: z
    .record(
      z.object({
        keys: z.array(z.string()),
      }),
    )
    .optional(),
  output: z
    .object({
      format: z.enum(['dotenv', 'json', 'yaml', 'toml']).default('dotenv'),
      path: z.string().default('.env.local'),
    })
    .optional(),
  scan: z
    .object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
      max_depth: z.number().optional(),
    })
    .optional(),
  security: z
    .object({
      mask_in_logs: z.boolean().default(true),
      confirm_before_push: z.boolean().default(true),
      gitignore_check: z.boolean().default(true),
    })
    .optional(),
});

export type ApicenterConfig = z.infer<typeof ConfigSchema>;
```

**Step 3: 파서 구현**

`packages/core/src/config/parser.ts`:

```typescript
import yaml from 'js-yaml';
import { ConfigSchema, type ApicenterConfig } from './schema.js';
import { ApicenterError } from '../types/index.js';

export function parseConfig(content: string): ApicenterConfig {
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (e) {
    throw new ApicenterError(
      `apicenter.yaml 파싱 실패: ${(e as Error).message}`,
      'CONFIG_PARSE_ERROR',
    );
  }
  return validateConfig(raw);
}

export function validateConfig(raw: unknown): ApicenterConfig {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new ApicenterError(
      `apicenter.yaml 설정 오류:\n${messages}`,
      'CONFIG_VALIDATION_ERROR',
    );
  }
  return result.data;
}
```

**Step 4: config/index.ts 생성**

```typescript
export * from './schema.js';
export * from './parser.js';
```

**Step 5: 테스트 통과 확인**

```bash
cd packages/core && pnpm test
# Expected: PASS (모든 config 테스트 포함)
```

**Step 6: Commit**

```bash
git add packages/core/src/config/
git commit -m "feat: apicenter.yaml zod 스키마 + 파서 구현"
```

---

## Task 5: @apicenter/provider-dotenv 구현

**Files:**
- Create: `packages/provider-dotenv/package.json`
- Create: `packages/provider-dotenv/tsconfig.json`
- Create: `packages/provider-dotenv/src/index.ts`
- Create: `packages/provider-dotenv/src/index.test.ts`

**Step 1: provider-dotenv/package.json 생성**

```json
{
  "name": "@apicenter/provider-dotenv",
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
    "dev": "tsc --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@apicenter/core": "workspace:*",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: tsconfig.json 생성**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: 테스트 먼저 작성**

`packages/provider-dotenv/src/index.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { DotenvProvider } from './index.js';

const TEST_ENV_PATH = '/tmp/apicenter-test.env';

describe('DotenvProvider', () => {
  let provider: DotenvProvider;

  beforeEach(() => {
    provider = new DotenvProvider({ path: TEST_ENV_PATH });
    // 테스트 .env 파일 생성
    writeFileSync(
      TEST_ENV_PATH,
      'DB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=secret123\n',
    );
  });

  afterEach(() => {
    if (existsSync(TEST_ENV_PATH)) unlinkSync(TEST_ENV_PATH);
  });

  it('name이 dotenv여야 한다', () => {
    expect(provider.name).toBe('dotenv');
  });

  it('항상 인증된 상태여야 한다 (.env는 인증 불필요)', async () => {
    expect(await provider.isAuthenticated()).toBe(true);
  });

  it('pullAll로 모든 시크릿을 가져와야 한다', async () => {
    const secrets = await provider.pullAll();
    expect(secrets['DB_HOST']).toBe('localhost');
    expect(secrets['DB_PORT']).toBe('5432');
    expect(secrets['API_KEY']).toBe('secret123');
  });

  it('getSecret으로 단건 시크릿을 가져와야 한다', async () => {
    expect(await provider.getSecret('DB_HOST')).toBe('localhost');
    expect(await provider.getSecret('NONEXISTENT')).toBeUndefined();
  });

  it('listSecrets로 SecretEntry 배열을 반환해야 한다', async () => {
    const entries = await provider.listSecrets();
    expect(entries.length).toBe(3);
    expect(entries.find((e) => e.key === 'DB_HOST')?.value).toBe('localhost');
  });

  it('pushAll로 .env 파일에 시크릿을 저장해야 한다', async () => {
    const newEnvPath = '/tmp/apicenter-push-test.env';
    const pushProvider = new DotenvProvider({ path: newEnvPath });
    await pushProvider.pushAll({ NEW_KEY: 'new_value', ANOTHER: '42' });
    const readback = new DotenvProvider({ path: newEnvPath });
    const secrets = await readback.pullAll();
    expect(secrets['NEW_KEY']).toBe('new_value');
    expect(secrets['ANOTHER']).toBe('42');
    if (existsSync(newEnvPath)) unlinkSync(newEnvPath);
  });

  it('setSecret으로 단건 값을 저장해야 한다', async () => {
    await provider.setSecret('NEW_KEY', 'hello');
    const val = await provider.getSecret('NEW_KEY');
    expect(val).toBe('hello');
  });

  it('deleteSecret으로 키를 삭제해야 한다', async () => {
    await provider.deleteSecret('DB_HOST');
    expect(await provider.getSecret('DB_HOST')).toBeUndefined();
  });

  it('.env 파일이 없으면 pullAll이 빈 객체를 반환해야 한다', async () => {
    const emptyProvider = new DotenvProvider({ path: '/tmp/nonexistent.env' });
    const secrets = await emptyProvider.pullAll();
    expect(secrets).toEqual({});
  });
});
```

**Step 4: DotenvProvider 구현**

`packages/provider-dotenv/src/index.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type {
  SecretProvider,
  SecretEntry,
  SecretValue,
  AuthConfig,
} from '@apicenter/core';

interface DotenvConfig {
  path: string;
}

export class DotenvProvider implements SecretProvider {
  readonly name = 'dotenv';
  private filePath: string;

  constructor(config: DotenvConfig) {
    this.filePath = config.path;
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    // dotenv는 인증 불필요
  }

  async isAuthenticated(): Promise<boolean> {
    return true;
  }

  async pullAll(_env?: string): Promise<Record<string, string>> {
    if (!existsSync(this.filePath)) return {};
    const content = readFileSync(this.filePath, 'utf-8');
    return this.parseEnvContent(content);
  }

  async pushAll(secrets: Record<string, string>, _env?: string): Promise<void> {
    const existing = await this.pullAll();
    const merged = { ...existing, ...secrets };
    const content = this.serializeToEnv(merged);
    writeFileSync(this.filePath, content, 'utf-8');
  }

  async getSecret(key: string, _env?: string): Promise<SecretValue> {
    const all = await this.pullAll();
    return all[key];
  }

  async listSecrets(_env?: string): Promise<SecretEntry[]> {
    const all = await this.pullAll();
    return Object.entries(all).map(([key, value]) => ({
      key,
      value,
      source: this.filePath,
    }));
  }

  async setSecret(key: string, value: string, _env?: string): Promise<void> {
    await this.pushAll({ [key]: value });
  }

  async deleteSecret(key: string, _env?: string): Promise<void> {
    const all = await this.pullAll();
    delete all[key];
    const content = this.serializeToEnv(all);
    writeFileSync(this.filePath, content, 'utf-8');
  }

  // .env 파일 파싱 (주석, 빈 줄 무시 / 따옴표 제거)
  private parseEnvContent(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // 따옴표 제거
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) result[key] = value;
    }
    return result;
  }

  // Record → .env 파일 문자열 직렬화
  private serializeToEnv(secrets: Record<string, string>): string {
    return (
      Object.entries(secrets)
        .map(([key, value]) => {
          // 공백이나 특수문자 포함 시 따옴표
          const needsQuote = /[\s#"'\\]/.test(value);
          const formatted = needsQuote ? `"${value.replace(/"/g, '\\"')}"` : value;
          return `${key}=${formatted}`;
        })
        .join('\n') + '\n'
    );
  }
}
```

**Step 5: 테스트 통과 확인**

```bash
# root에서
pnpm install && pnpm build
cd packages/provider-dotenv && pnpm test
# Expected: PASS (9 tests)
```

**Step 6: Commit**

```bash
git add packages/provider-dotenv/
git commit -m "feat: @apicenter/provider-dotenv — DotenvProvider 구현"
```

---

## Task 6: @apicenter/cli 패키지 세팅 (oclif)

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/base-command.ts`

**Step 1: packages/cli/package.json 생성**

```json
{
  "name": "apicenter",
  "version": "0.1.0",
  "description": "One CLI to manage secrets across any backend",
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "apicenter": "./bin/run.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "prepack": "pnpm build"
  },
  "dependencies": {
    "@apicenter/core": "workspace:*",
    "@apicenter/provider-dotenv": "workspace:*",
    "@oclif/core": "^4.0.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.9"
  },
  "oclif": {
    "bin": "apicenter",
    "dirname": "apicenter",
    "commands": "./dist/commands",
    "plugins": []
  },
  "files": [
    "bin",
    "dist"
  ],
  "keywords": ["secrets", "env", "cli", "dotenv", "vault"],
  "license": "MIT"
}
```

**Step 2: tsconfig.json 생성**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: bin/run.js 생성 (oclif 진입점)**

```bash
mkdir -p packages/cli/bin
```

`packages/cli/bin/run.js`:

```javascript
#!/usr/bin/env node

import { execute } from '@oclif/core';

await execute({ dir: import.meta.url });
```

**Step 4: base-command 생성 (공통 로직)**

`packages/cli/src/base-command.ts`:

```typescript
import { Command } from '@oclif/core';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, type ApicenterConfig } from '@apicenter/core';
import { DotenvProvider } from '@apicenter/provider-dotenv';
import type { SecretProvider } from '@apicenter/core';

export abstract class BaseCommand extends Command {
  protected config_!: ApicenterConfig;
  protected provider!: SecretProvider;

  /** apicenter.yaml 로드 및 Provider 초기화 */
  protected async loadConfig(): Promise<void> {
    const configPath = join(process.cwd(), 'apicenter.yaml');
    if (!existsSync(configPath)) {
      this.error(
        '❌ apicenter.yaml 파일을 찾을 수 없습니다. `apicenter init`을 먼저 실행하세요.',
        { exit: 1 },
      );
    }
    const content = readFileSync(configPath, 'utf-8');
    this.config_ = parseConfig(content);
    this.provider = this.resolveProvider();
  }

  /** provider name에 따라 Provider 인스턴스 반환 */
  private resolveProvider(): SecretProvider {
    const { name, config } = this.config_.provider;
    switch (name) {
      case 'dotenv':
        return new DotenvProvider({
          path: (config?.path as string) ?? '.env',
        });
      default:
        this.error(`Provider '${name}'은 아직 지원되지 않습니다.`, { exit: 1 });
    }
  }

  /** 출력 경로 (output.path 또는 기본값 .env.local) */
  protected get outputPath(): string {
    return this.config_.output?.path ?? '.env.local';
  }

  /** 기본 환경 (default_env 또는 dev) */
  protected get defaultEnv(): string {
    return this.config_.default_env ?? 'dev';
  }
}
```

**Step 5: Commit**

```bash
git add packages/cli/
git commit -m "chore: @apicenter/cli oclif 프레임워크 세팅 + BaseCommand"
```

---

## Task 7: `apicenter init` 명령어 구현

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/init.test.ts`

**Step 1: 테스트 먼저 작성**

`packages/cli/src/commands/init.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { generateConfig } from '../utils/config-generator.js';

const TEST_OUTPUT = '/tmp/apicenter-test-init.yaml';

describe('generateConfig (init 핵심 로직)', () => {
  afterEach(() => {
    if (existsSync(TEST_OUTPUT)) unlinkSync(TEST_OUTPUT);
  });

  it('dotenv provider 최소 설정을 생성해야 한다', () => {
    const yaml = generateConfig({ provider: 'dotenv', defaultEnv: 'dev' });
    expect(yaml).toContain('name: dotenv');
    expect(yaml).toContain('version: "1"');
  });

  it('output path가 포함되어야 한다', () => {
    const yaml = generateConfig({
      provider: 'dotenv',
      defaultEnv: 'dev',
      outputPath: '.env.local',
    });
    expect(yaml).toContain('.env.local');
  });
});
```

**Step 2: utils/config-generator.ts 생성**

`packages/cli/src/utils/config-generator.ts`:

```typescript
interface GenerateConfigOptions {
  provider: string;
  defaultEnv: string;
  outputPath?: string;
  sourcePath?: string;
}

export function generateConfig(opts: GenerateConfigOptions): string {
  const { provider, defaultEnv, outputPath = '.env.local', sourcePath = '.env' } = opts;

  return `version: "1"

provider:
  name: ${provider}
  config:
    path: ${sourcePath}

environments:
  dev:
    provider_env: development
  staging:
    provider_env: staging
  prod:
    provider_env: production

default_env: ${defaultEnv}

output:
  format: dotenv
  path: ${outputPath}

security:
  mask_in_logs: true
  confirm_before_push: true
  gitignore_check: true
`;
}
```

**Step 3: init.ts 구현**

`packages/cli/src/commands/init.ts`:

```typescript
import { Command, Flags } from '@oclif/core';
import { writeFileSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateConfig } from '../utils/config-generator.js';

export default class Init extends Command {
  static description = '프로젝트 시크릿 관리 초기 설정';
  static examples = ['<%= config.bin %> init', '<%= config.bin %> init --provider dotenv'];

  static flags = {
    provider: Flags.string({
      char: 'p',
      description: '시크릿 Provider 선택',
      options: ['dotenv', 'infisical', 'vault', 'aws', 'doppler'],
      default: 'dotenv',
    }),
    env: Flags.string({
      char: 'e',
      description: '기본 환경',
      default: 'dev',
    }),
    force: Flags.boolean({
      char: 'f',
      description: '기존 apicenter.yaml 덮어쓰기',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const configPath = join(process.cwd(), 'apicenter.yaml');

    if (existsSync(configPath) && !flags.force) {
      this.error(
        '이미 apicenter.yaml이 존재합니다. 덮어쓰려면 --force 플래그를 사용하세요.',
        { exit: 1 },
      );
    }

    const yaml = generateConfig({
      provider: flags.provider,
      defaultEnv: flags.env,
    });

    writeFileSync(configPath, yaml, 'utf-8');
    this.log(`✓ apicenter.yaml 생성 완료`);

    // .gitignore에 .env.local 추가
    this.ensureGitignore();

    this.log(`✓ .env.local을 .gitignore에 추가했습니다`);
    this.log(`\n🚀 준비 완료! 다음 명령어로 시작하세요:`);
    this.log(`   apicenter pull    # 시크릿 동기화`);
    this.log(`   apicenter diff    # 변경사항 확인`);
  }

  private ensureGitignore(): void {
    const gitignorePath = join(process.cwd(), '.gitignore');
    const entries = ['.env.local', '.env', '*.env'];

    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, entries.join('\n') + '\n');
      return;
    }

    const existing = readFileSync(gitignorePath, 'utf-8');
    const toAdd = entries.filter((e) => !existing.includes(e));
    if (toAdd.length > 0) {
      appendFileSync(gitignorePath, '\n# apicenter\n' + toAdd.join('\n') + '\n');
    }
  }
}
```

**Step 4: 테스트 통과 확인**

```bash
cd packages/cli && pnpm test
# Expected: PASS
```

**Step 5: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/src/utils/
git commit -m "feat: apicenter init 명령어 구현"
```

---

## Task 8: `apicenter pull` 명령어 구현

**Files:**
- Create: `packages/cli/src/commands/pull.ts`
- Create: `packages/cli/src/commands/pull.test.ts`

**Step 1: 테스트 먼저 작성**

`packages/cli/src/commands/pull.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { DotenvProvider } from '@apicenter/provider-dotenv';
import { writeDotenvFile, readDotenvFile } from '../utils/dotenv-io.js';

describe('writeDotenvFile', () => {
  const testPath = '/tmp/apicenter-pull-test.env';

  afterEach(() => {
    if (existsSync(testPath)) unlinkSync(testPath);
  });

  it('Record를 .env 파일로 저장해야 한다', () => {
    writeDotenvFile(testPath, { DB_HOST: 'localhost', PORT: '3000' });
    const content = readFileSync(testPath, 'utf-8');
    expect(content).toContain('DB_HOST=localhost');
    expect(content).toContain('PORT=3000');
  });

  it('readDotenvFile로 다시 읽어야 한다', () => {
    writeDotenvFile(testPath, { KEY: 'value' });
    const result = readDotenvFile(testPath);
    expect(result['KEY']).toBe('value');
  });
});
```

**Step 2: utils/dotenv-io.ts 생성**

`packages/cli/src/utils/dotenv-io.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function writeDotenvFile(
  path: string,
  secrets: Record<string, string>,
): void {
  const lines = Object.entries(secrets).map(([k, v]) => {
    const needsQuote = /[\s#"'\\]/.test(v);
    const formatted = needsQuote ? `"${v.replace(/"/g, '\\"')}"` : v;
    return `${k}=${formatted}`;
  });
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

export function readDotenvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}
```

**Step 3: pull.ts 구현**

`packages/cli/src/commands/pull.ts`:

```typescript
import { Flags } from '@oclif/core';
import { join } from 'node:path';
import { BaseCommand } from '../base-command.js';
import { writeDotenvFile } from '../utils/dotenv-io.js';

export default class Pull extends BaseCommand {
  static description = 'Provider에서 시크릿을 가져와 로컬 .env 파일 생성';
  static examples = [
    '<%= config.bin %> pull',
    '<%= config.bin %> pull --env staging',
    '<%= config.bin %> pull --dry-run',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '대상 환경 (기본: default_env)',
    }),
    'dry-run': Flags.boolean({
      description: '실제 파일 생성 없이 미리보기',
      default: false,
    }),
    output: Flags.string({
      char: 'o',
      description: '출력 파일 경로 (기본: output.path in apicenter.yaml)',
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { flags } = await this.parse(Pull);

    const env = flags.env ?? this.defaultEnv;
    const outputPath = join(process.cwd(), flags.output ?? this.outputPath);

    this.log(`🔄 ${env} 환경에서 시크릿 가져오는 중...`);

    const secrets = await this.provider.pullAll(env);
    const count = Object.keys(secrets).length;

    if (count === 0) {
      this.log('⚠️  가져온 시크릿이 없습니다.');
      return;
    }

    if (flags['dry-run']) {
      this.log(`\n📋 Dry Run — 실제 파일은 생성되지 않습니다:\n`);
      for (const [key, value] of Object.entries(secrets)) {
        this.log(`  ${key}=${value.slice(0, 3)}***`);
      }
      this.log(`\n총 ${count}개 시크릿 (출력 경로: ${outputPath})`);
      return;
    }

    writeDotenvFile(outputPath, secrets);
    this.log(`✅ ${count}개 시크릿을 ${outputPath}에 저장했습니다.`);
  }
}
```

**Step 4: 테스트 통과 확인**

```bash
cd packages/cli && pnpm test
# Expected: PASS
```

**Step 5: Commit**

```bash
git add packages/cli/src/commands/pull.ts packages/cli/src/utils/dotenv-io.ts
git commit -m "feat: apicenter pull 명령어 구현"
```

---

## Task 9: `apicenter push` 명령어 구현

**Files:**
- Create: `packages/cli/src/commands/push.ts`

**Step 1: push.ts 구현**

`packages/cli/src/commands/push.ts`:

```typescript
import { Flags } from '@oclif/core';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { BaseCommand } from '../base-command.js';
import { readDotenvFile } from '../utils/dotenv-io.js';

export default class Push extends BaseCommand {
  static description = '로컬 .env 파일의 시크릿을 Provider에 업로드';
  static examples = [
    '<%= config.bin %> push',
    '<%= config.bin %> push --env production',
    '<%= config.bin %> push --keys DB_HOST,DB_PORT',
    '<%= config.bin %> push --yes',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '대상 환경',
    }),
    source: Flags.string({
      char: 's',
      description: '업로드할 .env 파일 경로 (기본: provider config의 path)',
    }),
    keys: Flags.string({
      char: 'k',
      description: '업로드할 키 목록 (쉼표 구분)',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: '확인 없이 바로 실행 (CI/CD용)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { flags } = await this.parse(Push);

    const env = flags.env ?? this.defaultEnv;
    const sourcePath = join(
      process.cwd(),
      flags.source ?? (this.config_.provider.config?.path as string) ?? '.env',
    );

    if (!existsSync(sourcePath)) {
      this.error(`소스 파일을 찾을 수 없습니다: ${sourcePath}`, { exit: 1 });
    }

    let secrets = readDotenvFile(sourcePath);

    // --keys 필터링
    if (flags.keys) {
      const keyList = flags.keys.split(',').map((k) => k.trim());
      secrets = Object.fromEntries(
        Object.entries(secrets).filter(([k]) => keyList.includes(k)),
      );
    }

    const count = Object.keys(secrets).length;

    if (count === 0) {
      this.log('⚠️  업로드할 시크릿이 없습니다.');
      return;
    }

    this.log(`📤 ${count}개 시크릿을 ${env} 환경으로 업로드합니다.`);
    this.log(`   소스: ${sourcePath}`);

    if (!flags.yes && this.config_.security?.confirm_before_push) {
      this.log('\n계속하려면 --yes 플래그를 사용하거나 confirm_before_push를 false로 설정하세요.');
      this.log('(현재 버전에서는 --yes 플래그로 확인을 건너뜁니다)');
      return;
    }

    await this.provider.pushAll(secrets, env);
    this.log(`✅ ${count}개 시크릿 업로드 완료.`);
  }
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/commands/push.ts
git commit -m "feat: apicenter push 명령어 구현"
```

---

## Task 10: `apicenter diff` 명령어 구현

**Files:**
- Create: `packages/cli/src/commands/diff.ts`
- Create: `packages/cli/src/utils/diff-engine.ts`
- Create: `packages/cli/src/utils/diff-engine.test.ts`

**Step 1: diff 엔진 테스트 먼저 작성**

`packages/cli/src/utils/diff-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeDiff } from './diff-engine.js';

describe('computeDiff', () => {
  it('remote에만 있는 키는 added로 분류해야 한다', () => {
    const result = computeDiff({}, { NEW_KEY: 'value' });
    expect(result.find((d) => d.key === 'NEW_KEY')?.status).toBe('added');
  });

  it('local에만 있는 키는 removed로 분류해야 한다', () => {
    const result = computeDiff({ OLD_KEY: 'value' }, {});
    expect(result.find((d) => d.key === 'OLD_KEY')?.status).toBe('removed');
  });

  it('값이 다른 키는 changed로 분류해야 한다', () => {
    const result = computeDiff({ HOST: 'localhost' }, { HOST: 'db.prod' });
    expect(result.find((d) => d.key === 'HOST')?.status).toBe('changed');
    expect(result.find((d) => d.key === 'HOST')?.localValue).toBe('localhost');
    expect(result.find((d) => d.key === 'HOST')?.remoteValue).toBe('db.prod');
  });

  it('값이 같은 키는 synced로 분류해야 한다', () => {
    const result = computeDiff({ KEY: 'same' }, { KEY: 'same' });
    expect(result.find((d) => d.key === 'KEY')?.status).toBe('synced');
  });

  it('빈 local과 remote는 빈 배열을 반환해야 한다', () => {
    expect(computeDiff({}, {})).toEqual([]);
  });
});
```

**Step 2: diff-engine.ts 구현**

`packages/cli/src/utils/diff-engine.ts`:

```typescript
import type { DiffEntry } from '@apicenter/core';

export function computeDiff(
  local: Record<string, string>,
  remote: Record<string, string>,
): DiffEntry[] {
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const result: DiffEntry[] = [];

  for (const key of allKeys) {
    const localVal = local[key];
    const remoteVal = remote[key];

    if (localVal === undefined && remoteVal !== undefined) {
      result.push({ key, status: 'added', remoteValue: remoteVal });
    } else if (localVal !== undefined && remoteVal === undefined) {
      result.push({ key, status: 'removed', localValue: localVal });
    } else if (localVal !== remoteVal) {
      result.push({ key, status: 'changed', localValue: localVal, remoteValue: remoteVal });
    } else {
      result.push({ key, status: 'synced', localValue: localVal });
    }
  }

  return result.sort((a, b) => a.key.localeCompare(b.key));
}
```

**Step 3: diff.ts 구현**

`packages/cli/src/commands/diff.ts`:

```typescript
import { Flags } from '@oclif/core';
import { join } from 'node:path';
import { BaseCommand } from '../base-command.js';
import { readDotenvFile } from '../utils/dotenv-io.js';
import { computeDiff } from '../utils/diff-engine.js';

export default class Diff extends BaseCommand {
  static description = '로컬 .env ↔ Provider 간 시크릿 차이 비교';
  static examples = [
    '<%= config.bin %> diff',
    '<%= config.bin %> diff --env staging',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '비교 대상 환경',
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { flags } = await this.parse(Diff);

    const env = flags.env ?? this.defaultEnv;
    const localPath = join(process.cwd(), this.outputPath);

    this.log(`🔍 로컬 (${localPath}) ↔ remote (${env}) 비교 중...\n`);

    const local = readDotenvFile(localPath);
    const remote = await this.provider.pullAll(env);
    const diffs = computeDiff(local, remote);

    if (diffs.length === 0) {
      this.log('✅ 차이 없음 — 완전히 동기화되어 있습니다.');
      return;
    }

    const statusSymbol: Record<string, string> = {
      added: '+',
      removed: '-',
      changed: '~',
      synced: '=',
    };

    const statusLabel: Record<string, string> = {
      added: '(remote only)',
      removed: '(local only)',
      changed: '',
      synced: '(synced)',
    };

    for (const diff of diffs) {
      const sym = statusSymbol[diff.status];
      const label = statusLabel[diff.status];
      if (diff.status === 'changed') {
        this.log(
          `  ${sym} ${diff.key.padEnd(30)} local: ${diff.localValue?.slice(0, 20)} → remote: ${diff.remoteValue?.slice(0, 20)}`,
        );
      } else {
        this.log(`  ${sym} ${diff.key.padEnd(30)} ${label}`);
      }
    }

    const added = diffs.filter((d) => d.status === 'added').length;
    const removed = diffs.filter((d) => d.status === 'removed').length;
    const changed = diffs.filter((d) => d.status === 'changed').length;
    const synced = diffs.filter((d) => d.status === 'synced').length;

    this.log(`\n  + added: ${added}  - removed: ${removed}  ~ changed: ${changed}  = synced: ${synced}`);
  }
}
```

**Step 4: 테스트 통과 확인**

```bash
cd packages/cli && pnpm test
# Expected: PASS (diff-engine 5 tests)
```

**Step 5: Commit**

```bash
git add packages/cli/src/commands/diff.ts packages/cli/src/utils/diff-engine.ts packages/cli/src/utils/diff-engine.test.ts
git commit -m "feat: apicenter diff 명령어 구현"
```

---

## Task 11: CLI 진입점 + 빌드 검증

**Files:**
- Create: `packages/cli/src/index.ts`

**Step 1: CLI 진입점 생성**

`packages/cli/src/index.ts`:

```typescript
export { run } from '@oclif/core';
```

**Step 2: 전체 빌드 실행**

```bash
# root에서
pnpm install
pnpm build

# Expected: packages/core, provider-dotenv, cli 모두 빌드 성공
```

**Step 3: 로컬 CLI 실행 테스트**

```bash
cd packages/cli
node bin/run.js --help

# Expected:
# apicenter CLI 도움말 표시
# init, pull, push, diff 명령어 목록

node bin/run.js init --help
node bin/run.js pull --help
```

**Step 4: 실제 동작 E2E 테스트**

```bash
# 임시 디렉토리에서 실제 흐름 테스트
mkdir /tmp/apicenter-e2e-test && cd /tmp/apicenter-e2e-test
echo "DB_HOST=localhost\nAPI_KEY=mysecretkey" > .env

node /path/to/packages/cli/bin/run.js init --provider dotenv --yes
# Expected: apicenter.yaml 생성

node /path/to/packages/cli/bin/run.js pull
# Expected: .env.local 생성

node /path/to/packages/cli/bin/run.js diff
# Expected: 차이 없음

echo "NEW_KEY=newvalue" >> .env
node /path/to/packages/cli/bin/run.js diff
# Expected: ~ NEW_KEY 변경사항 표시
```

**Step 5: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "chore: CLI 진입점 완성 + Phase 1 빌드 검증"
```

---

## Task 12: GitHub Actions CI 세팅

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: ci.yml 생성**

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm build

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test
```

**Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/
git commit -m "ci: GitHub Actions CI 파이프라인 추가"
```

---

## 최종 검증 체크리스트

```bash
# root에서 전체 실행
pnpm install
pnpm build      # 모든 패키지 빌드 성공
pnpm typecheck  # TypeScript 오류 없음
pnpm test       # 모든 테스트 통과

# Phase 1 완료 기준:
# ✅ apicenter init  — apicenter.yaml 생성
# ✅ apicenter pull  — .env → .env.local 동기화
# ✅ apicenter push  — .env.local → .env 업로드
# ✅ apicenter diff  — 로컬 ↔ remote 차이 비교
# ✅ SecureLogger    — 시크릿 자동 마스킹
# ✅ 전체 테스트 통과
# ✅ CI 파이프라인 동작
```
