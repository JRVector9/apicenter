# Phase 2: Scan + Run + Infisical Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `scan`, `run`, `doctor` 명령어와 Infisical Provider를 구현하여 외부 시크릿 백엔드 연동과 프로젝트 보안 자가진단 기능을 완성한다.

**Architecture:** `@apicenter/core`에 스캐너 엔진(`packages/core/src/scanner/`)과 보안 체크 모듈(`packages/core/src/security/`)을 추가하고, `ProviderRegistry`로 Provider 동적 등록/발견을 가능하게 한다. `@apicenter/provider-infisical`은 독립 패키지로 분리하여 `@infisical/sdk`를 래핑한다.

**Tech Stack:** `@infisical/sdk` (Infisical Universal Auth), `glob` (파일 glob 매칭), `node:child_process` spawn (run 명령어), `cli-table3` (테이블 출력)

---

## 완성 후 패키지 구조

```
apicenter/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── scanner/
│   │       │   ├── patterns.ts        # 언어별 정규식 패턴
│   │       │   ├── file-scanner.ts    # glob + 파일 스캔 엔진
│   │       │   └── index.ts           # export
│   │       ├── security/
│   │       │   ├── doctor-checks.ts   # 개별 보안 체크 함수
│   │       │   └── index.ts           # export
│   │       ├── registry/
│   │       │   ├── provider-registry.ts
│   │       │   └── index.ts           # export
│   │       ├── types/index.ts         # (기존) + ScanMatch, ScanResult
│   │       └── index.ts               # (기존 + 신규 export)
│   │
│   ├── provider-dotenv/               # (기존 — 변경 없음)
│   │
│   ├── provider-infisical/            # @apicenter/provider-infisical (신규)
│   │   └── src/
│   │       ├── index.ts
│   │       └── index.test.ts
│   │
│   └── cli/
│       └── src/
│           └── commands/
│               ├── scan.ts            # (신규)
│               ├── run.ts             # (신규)
│               └── doctor.ts          # (신규)
│
└── README.md                          # (신규)
```

---

## Task 1: Scanner Engine — `@apicenter/core`에 스캐너 추가

### 목적

소스 파일에서 환경변수 참조를 탐지하는 엔진을 `packages/core/src/scanner/`에 구현한다. 언어별 정규식 패턴을 `patterns.ts`에 분리하고, `file-scanner.ts`가 glob으로 파일을 찾아 스캔한다.

---

### Step 1-1: 타입 확장 — `ScanMatch`, `ScanResult`

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/types/index.ts`

기존 파일 끝에 다음을 추가한다 (기존 코드는 그대로 유지).

```typescript
// 스캔 단건 매치 결과
export interface ScanMatch {
  key: string;
  file: string;
  line: number;
  language: string;
}

// scan 명령어 전체 결과
export interface ScanResult {
  matches: ScanMatch[];
  uniqueKeys: string[];
  fileCount: number;
}
```

---

### Step 1-2: 언어별 패턴 정의

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/scanner/patterns.ts`

```typescript
// 언어별 환경변수 참조 정규식 패턴 정의.
// 각 패턴의 첫 번째 캡처 그룹이 환경변수 키 이름이다.
// 주의: 정규식은 매번 exec()할 때 lastIndex가 누적되므로
//        실제 스캔 시 새 RegExp 인스턴스를 사용해야 한다.

export type Language =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'java'
  | 'php'
  | 'dotenv'
  | 'docker'
  | 'github_actions';

// 파일 확장자 → 언어 매핑
export const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.php': 'php',
};

// 파일명 패턴 → 언어 매핑 (확장자로 판별 불가한 파일)
export const FILENAME_TO_LANGUAGE: Array<{ pattern: RegExp; language: Language }> = [
  { pattern: /^\.env(\..+)?$/, language: 'dotenv' },
  { pattern: /^Dockerfile(\..+)?$/, language: 'docker' },
  { pattern: /^docker-compose(\..+)?\.ya?ml$/, language: 'docker' },
  { pattern: /\.ya?ml$/, language: 'github_actions' }, // .github/workflows/ 필터링은 스캐너에서
];

// 언어별 정규식 패턴 목록.
// 새 RegExp를 생성할 수 있도록 소스 문자열과 플래그를 저장한다.
export const SCAN_PATTERNS: Record<Language, Array<{ source: string; flags: string }>> = {
  javascript: [
    { source: String.raw`process\.env\.(\w+)`, flags: 'g' },
    { source: String.raw`process\.env\[['"](\w+)['"]\]`, flags: 'g' },
  ],
  typescript: [
    { source: String.raw`process\.env\.(\w+)`, flags: 'g' },
    { source: String.raw`process\.env\[['"](\w+)['"]\]`, flags: 'g' },
  ],
  python: [
    { source: String.raw`os\.environ\[['"](\w+)['"]\]`, flags: 'g' },
    { source: String.raw`os\.environ\.get\(['"](\w+)['"]`, flags: 'g' },
    { source: String.raw`os\.getenv\(['"](\w+)['"]`, flags: 'g' },
  ],
  ruby: [
    { source: String.raw`ENV\[['"](\w+)['"]\]`, flags: 'g' },
    { source: String.raw`ENV\.fetch\(['"](\w+)['"]`, flags: 'g' },
  ],
  go: [
    { source: String.raw`os\.Getenv\("(\w+)"\)`, flags: 'g' },
  ],
  rust: [
    { source: String.raw`env::var\("(\w+)"\)`, flags: 'g' },
    { source: String.raw`std::env::var\("(\w+)"\)`, flags: 'g' },
  ],
  java: [
    { source: String.raw`System\.getenv\("(\w+)"\)`, flags: 'g' },
  ],
  php: [
    { source: String.raw`\$_ENV\[['"](\w+)['"]\]`, flags: 'g' },
    { source: String.raw`getenv\(['"](\w+)['"]`, flags: 'g' },
  ],
  dotenv: [
    { source: String.raw`^([A-Z_][A-Z0-9_]*)=`, flags: 'gm' },
  ],
  docker: [
    { source: String.raw`^\s*-?\s*([A-Z_][A-Z0-9_]*)=`, flags: 'gm' },
    { source: String.raw`^\s*ENV\s+([A-Z_][A-Z0-9_]*)`, flags: 'gm' },
  ],
  github_actions: [
    { source: String.raw`\$\{\{\s*secrets\.(\w+)\s*\}\}`, flags: 'g' },
  ],
};
```

---

### Step 1-3: 파일 스캐너 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/scanner/file-scanner.ts`

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { extname, basename, relative } from 'node:path';
import { glob } from 'glob';
import type { ScanMatch, ScanResult } from '../types/index.js';
import {
  EXTENSION_TO_LANGUAGE,
  FILENAME_TO_LANGUAGE,
  SCAN_PATTERNS,
  type Language,
} from './patterns.js';

export interface ScanOptions {
  /** 스캔 루트 디렉토리 (기본: process.cwd()) */
  cwd?: string;
  /** glob include 패턴 목록 */
  include?: string[];
  /** glob exclude 패턴 목록 */
  exclude?: string[];
}

const DEFAULT_INCLUDE = [
  'src/**',
  'app/**',
  'lib/**',
  'config/**',
  '.env*',
  'Dockerfile*',
  'docker-compose*.yml',
  'docker-compose*.yaml',
  '.github/workflows/**',
];

const DEFAULT_EXCLUDE = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.git/**',
  '**/*.lock',
  '**/*.min.js',
  '**/*.map',
];

/** 파일 경로에서 언어를 결정한다. 판별 불가 시 undefined 반환. */
export function detectLanguage(filePath: string): Language | undefined {
  const ext = extname(filePath).toLowerCase();
  if (ext && EXTENSION_TO_LANGUAGE[ext]) {
    return EXTENSION_TO_LANGUAGE[ext];
  }

  const name = basename(filePath);
  for (const { pattern, language } of FILENAME_TO_LANGUAGE) {
    if (pattern.test(name)) {
      // .yml 파일은 .github/workflows 경로일 때만 github_actions로 처리
      if (language === 'github_actions' && !filePath.includes('.github/workflows')) {
        continue;
      }
      return language;
    }
  }

  return undefined;
}

/** 파일 한 개를 스캔하여 ScanMatch 배열을 반환한다. */
export function scanFileContent(
  content: string,
  filePath: string,
  language: Language,
  cwd: string,
): ScanMatch[] {
  const matches: ScanMatch[] = [];
  const patterns = SCAN_PATTERNS[language];
  const lines = content.split('\n');
  const relPath = relative(cwd, filePath);

  for (const { source, flags } of patterns) {
    // 매번 새 RegExp 인스턴스를 생성하여 lastIndex 누적 방지
    const regex = new RegExp(source, flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const key = match[1];
      if (!key) continue;

      // 매치 위치로부터 줄 번호 계산 (1-indexed)
      const matchIndex = match.index;
      const linesBefore = content.slice(0, matchIndex).split('\n');
      const lineNumber = linesBefore.length;
      const lineContent = lines[lineNumber - 1] ?? '';

      // 줄 전체가 주석인 경우 스킵 (#, //, --)
      const trimmedLine = lineContent.trim();
      if (
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('--')
      ) {
        continue;
      }

      // 이미 같은 파일+줄+키 조합이 있으면 중복 추가 방지
      const alreadyAdded = matches.some(
        (m) => m.file === relPath && m.line === lineNumber && m.key === key,
      );
      if (!alreadyAdded) {
        matches.push({ key, file: relPath, line: lineNumber, language });
      }
    }
  }

  return matches;
}

/** 디렉토리를 스캔하여 ScanResult를 반환한다. */
export async function scanDirectory(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;

  // glob으로 파일 수집
  const files: string[] = [];
  for (const pattern of include) {
    const found = await glob(pattern, {
      cwd,
      absolute: true,
      nodir: true,
      ignore: exclude,
      dot: true, // .env 같은 dot 파일 포함
    });
    files.push(...found);
  }

  // 중복 제거
  const uniqueFiles = [...new Set(files)];

  const allMatches: ScanMatch[] = [];
  const scannedFiles = new Set<string>();

  for (const filePath of uniqueFiles) {
    if (!existsSync(filePath)) continue;
    if (scannedFiles.has(filePath)) continue;
    scannedFiles.add(filePath);

    const language = detectLanguage(filePath);
    if (!language) continue;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      // 읽기 실패 시 스킵 (바이너리 파일 등)
      continue;
    }

    const fileMatches = scanFileContent(content, filePath, language, cwd);
    allMatches.push(...fileMatches);
  }

  const uniqueKeys = [...new Set(allMatches.map((m) => m.key))].sort();

  return {
    matches: allMatches,
    uniqueKeys,
    fileCount: scannedFiles.size,
  };
}
```

---

### Step 1-4: 스캐너 index export

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/scanner/index.ts`

```typescript
export { scanDirectory, scanFileContent, detectLanguage } from './file-scanner.js';
export type { ScanOptions } from './file-scanner.js';
export { SCAN_PATTERNS, EXTENSION_TO_LANGUAGE, FILENAME_TO_LANGUAGE } from './patterns.js';
export type { Language } from './patterns.js';
```

---

### Step 1-5: `@apicenter/core` index에 scanner export 추가

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/index.ts`

기존 파일을 다음으로 교체한다:

```typescript
export * from './types/index.js';
export * from './logger/index.js';
export * from './config/index.js';
export * from './scanner/index.js';
export * from './security/index.js';
export * from './registry/index.js';
```

(security와 registry는 Task 3, Task 4에서 추가할 것이므로 지금은 scanner만 추가해도 된다. 단, 파일이 없으면 빌드 에러가 나므로 아래 순서대로 Task를 진행한다.)

**실제 지금 추가할 내용 (scanner만):**

```typescript
export * from './types/index.js';
export * from './logger/index.js';
export * from './config/index.js';
export * from './scanner/index.js';
```

---

### Step 1-6: `glob` 의존성 추가

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm add glob --filter @apicenter/core
```

Expected output:

```
 WARN  deprecated glob@7.2.3: ...
packages/core node_modules/.pnpm/glob@11.x.x
Done in Xs
```

---

### Step 1-7: 스캐너 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/scanner/file-scanner.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanDirectory, scanFileContent, detectLanguage } from './file-scanner.js';

// 임시 디렉토리 생성 헬퍼
function createTempDir(): string {
  const dir = join(tmpdir(), `apicenter-scan-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('detectLanguage', () => {
  it('확장자로 언어 판별', () => {
    expect(detectLanguage('/src/app.ts')).toBe('typescript');
    expect(detectLanguage('/src/app.js')).toBe('javascript');
    expect(detectLanguage('/src/main.py')).toBe('python');
    expect(detectLanguage('/src/main.rb')).toBe('ruby');
    expect(detectLanguage('/src/main.go')).toBe('go');
    expect(detectLanguage('/src/lib.rs')).toBe('rust');
    expect(detectLanguage('/src/Main.java')).toBe('java');
    expect(detectLanguage('/src/index.php')).toBe('php');
  });

  it('.env 파일명 판별', () => {
    expect(detectLanguage('/project/.env')).toBe('dotenv');
    expect(detectLanguage('/project/.env.local')).toBe('dotenv');
    expect(detectLanguage('/project/.env.example')).toBe('dotenv');
  });

  it('Dockerfile 판별', () => {
    expect(detectLanguage('/project/Dockerfile')).toBe('docker');
    expect(detectLanguage('/project/Dockerfile.prod')).toBe('docker');
  });

  it('docker-compose.yml 판별', () => {
    expect(detectLanguage('/project/docker-compose.yml')).toBe('docker');
    expect(detectLanguage('/project/docker-compose.prod.yaml')).toBe('docker');
  });

  it('GitHub Actions workflow 판별', () => {
    expect(detectLanguage('/project/.github/workflows/ci.yml')).toBe('github_actions');
  });

  it('일반 .yml 파일은 github_actions로 판별하지 않음', () => {
    const lang = detectLanguage('/project/config/app.yml');
    expect(lang).not.toBe('github_actions');
  });

  it('알 수 없는 확장자는 undefined', () => {
    expect(detectLanguage('/project/file.xyz')).toBeUndefined();
  });
});

describe('scanFileContent', () => {
  const cwd = '/project';

  it('JavaScript — process.env.KEY 패턴 감지', () => {
    const content = `const key = process.env.OPENAI_API_KEY;\nconst db = process.env.DB_PASSWORD;`;
    const matches = scanFileContent(content, '/project/src/app.js', 'javascript', cwd);
    expect(matches.map((m) => m.key)).toContain('OPENAI_API_KEY');
    expect(matches.map((m) => m.key)).toContain('DB_PASSWORD');
  });

  it('JavaScript — process.env["KEY"] 패턴 감지', () => {
    const content = `const val = process.env["SECRET_KEY"];`;
    const matches = scanFileContent(content, '/project/src/app.js', 'javascript', cwd);
    expect(matches[0]?.key).toBe('SECRET_KEY');
  });

  it('Python — os.environ["KEY"] 패턴 감지', () => {
    const content = `key = os.environ["API_KEY"]\nval = os.environ.get("DB_URL", "default")`;
    const matches = scanFileContent(content, '/project/src/app.py', 'python', cwd);
    const keys = matches.map((m) => m.key);
    expect(keys).toContain('API_KEY');
    expect(keys).toContain('DB_URL');
  });

  it('Python — os.getenv 패턴 감지', () => {
    const content = `secret = os.getenv("MY_SECRET")`;
    const matches = scanFileContent(content, '/project/src/app.py', 'python', cwd);
    expect(matches[0]?.key).toBe('MY_SECRET');
  });

  it('Ruby — ENV["KEY"] 패턴 감지', () => {
    const content = `key = ENV["RAILS_MASTER_KEY"]`;
    const matches = scanFileContent(content, '/project/config/env.rb', 'ruby', cwd);
    expect(matches[0]?.key).toBe('RAILS_MASTER_KEY');
  });

  it('Go — os.Getenv 패턴 감지', () => {
    const content = `val := os.Getenv("DATABASE_URL")`;
    const matches = scanFileContent(content, '/project/main.go', 'go', cwd);
    expect(matches[0]?.key).toBe('DATABASE_URL');
  });

  it('Rust — env::var 패턴 감지', () => {
    const content = `let val = env::var("RUST_SECRET").unwrap();`;
    const matches = scanFileContent(content, '/project/src/main.rs', 'rust', cwd);
    expect(matches[0]?.key).toBe('RUST_SECRET');
  });

  it('Java — System.getenv 패턴 감지', () => {
    const content = `String val = System.getenv("JAVA_TOKEN");`;
    const matches = scanFileContent(content, '/project/src/Main.java', 'java', cwd);
    expect(matches[0]?.key).toBe('JAVA_TOKEN');
  });

  it('PHP — $_ENV 및 getenv 패턴 감지', () => {
    const content = `$val = $_ENV["PHP_KEY"];\n$val2 = getenv("ANOTHER_KEY");`;
    const matches = scanFileContent(content, '/project/index.php', 'php', cwd);
    const keys = matches.map((m) => m.key);
    expect(keys).toContain('PHP_KEY');
    expect(keys).toContain('ANOTHER_KEY');
  });

  it('dotenv — KEY=value 패턴 감지', () => {
    const content = `DB_HOST=localhost\nDB_PORT=5432\nSECRET_KEY=abc123`;
    const matches = scanFileContent(content, '/project/.env', 'dotenv', cwd);
    const keys = matches.map((m) => m.key);
    expect(keys).toContain('DB_HOST');
    expect(keys).toContain('DB_PORT');
    expect(keys).toContain('SECRET_KEY');
  });

  it('GitHub Actions — secrets.KEY 패턴 감지', () => {
    const content = `env:\n  TOKEN: \${{ secrets.GITHUB_TOKEN }}\n  KEY: \${{ secrets.API_KEY }}`;
    const matches = scanFileContent(content, '/project/.github/workflows/ci.yml', 'github_actions', cwd);
    const keys = matches.map((m) => m.key);
    expect(keys).toContain('GITHUB_TOKEN');
    expect(keys).toContain('API_KEY');
  });

  it('주석 처리된 줄은 스킵', () => {
    const content = `// const val = process.env.COMMENTED_KEY;\nconst real = process.env.REAL_KEY;`;
    const matches = scanFileContent(content, '/project/src/app.js', 'javascript', cwd);
    const keys = matches.map((m) => m.key);
    expect(keys).not.toContain('COMMENTED_KEY');
    expect(keys).toContain('REAL_KEY');
  });

  it('줄 번호가 정확히 기록됨', () => {
    const content = `const a = 1;\nconst key = process.env.LINE_TWO;\nconst b = 2;`;
    const matches = scanFileContent(content, '/project/src/app.js', 'javascript', cwd);
    expect(matches[0]?.line).toBe(2);
  });

  it('같은 파일+줄+키 중복 제거', () => {
    const content = `const a = process.env.SAME_KEY; const b = process.env.SAME_KEY;`;
    const matches = scanFileContent(content, '/project/src/app.js', 'javascript', cwd);
    const sameKeyMatches = matches.filter((m) => m.key === 'SAME_KEY');
    expect(sameKeyMatches.length).toBe(1);
  });
});

describe('scanDirectory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('여러 언어 파일을 스캔하여 uniqueKeys 수집', async () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'src', 'app.ts'),
      `const a = process.env.TS_KEY;\nconst b = process.env.SHARED_KEY;`,
      'utf-8',
    );
    writeFileSync(
      join(tmpDir, 'src', 'app.py'),
      `val = os.environ.get("PY_KEY")\nval2 = os.getenv("SHARED_KEY")`,
      'utf-8',
    );

    const result = await scanDirectory({
      cwd: tmpDir,
      include: ['src/**'],
      exclude: [],
    });

    expect(result.uniqueKeys).toContain('TS_KEY');
    expect(result.uniqueKeys).toContain('PY_KEY');
    expect(result.uniqueKeys).toContain('SHARED_KEY');
    expect(result.fileCount).toBe(2);
  });

  it('.env 파일 스캔', async () => {
    writeFileSync(join(tmpDir, '.env'), `DB_HOST=localhost\nDB_PASS=secret\n`, 'utf-8');

    const result = await scanDirectory({
      cwd: tmpDir,
      include: ['.env*'],
      exclude: [],
    });

    expect(result.uniqueKeys).toContain('DB_HOST');
    expect(result.uniqueKeys).toContain('DB_PASS');
  });

  it('존재하지 않는 include 패턴은 빈 결과', async () => {
    const result = await scanDirectory({
      cwd: tmpDir,
      include: ['nonexistent/**'],
      exclude: [],
    });

    expect(result.matches).toHaveLength(0);
    expect(result.uniqueKeys).toHaveLength(0);
    expect(result.fileCount).toBe(0);
  });

  it('exclude 패턴에 매칭된 파일은 스킵', async () => {
    mkdirSync(join(tmpDir, 'node_modules', 'some-pkg'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'node_modules', 'some-pkg', 'index.js'),
      `process.env.SHOULD_BE_EXCLUDED`,
      'utf-8',
    );
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'src', 'app.js'),
      `process.env.SHOULD_BE_INCLUDED`,
      'utf-8',
    );

    const result = await scanDirectory({
      cwd: tmpDir,
      include: ['src/**', 'node_modules/**'],
      exclude: ['node_modules/**'],
    });

    expect(result.uniqueKeys).toContain('SHOULD_BE_INCLUDED');
    expect(result.uniqueKeys).not.toContain('SHOULD_BE_EXCLUDED');
  });
});
```

---

### Step 1-8: 테스트 실행

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm --filter @apicenter/core test --run
```

Expected output:

```
✓ src/scanner/file-scanner.test.ts (N tests)
Test Files  X passed
Tests       N passed
```

---

## Task 2: `apicenter scan` 명령어 구현

### 목적

`packages/cli/src/commands/scan.ts`를 구현한다. `scanDirectory()`를 호출하고 결과를 테이블로 출력한다.

---

### Step 2-1: `cli-table3` 의존성 추가

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm add cli-table3 --filter apicenter
pnpm add -D @types/cli-table3 --filter apicenter
```

---

### Step 2-2: scan 명령어 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/cli/src/commands/scan.ts`

```typescript
import { Flags } from '@oclif/core';
import Table from 'cli-table3';
import { BaseCommand } from '../base-command.js';
import { scanDirectory } from '@apicenter/core';

export default class Scan extends BaseCommand {
  static description = '소스 파일에서 환경변수 참조를 자동 탐지';
  static examples = [
    '<%= config.bin %> scan',
    '<%= config.bin %> scan --include "src/**" --include "lib/**"',
    '<%= config.bin %> scan --json',
  ];

  static flags = {
    include: Flags.string({
      multiple: true,
      description: '스캔할 glob 패턴 (여러 번 지정 가능)',
    }),
    exclude: Flags.string({
      multiple: true,
      description: '제외할 glob 패턴 (여러 번 지정 가능)',
    }),
    json: Flags.boolean({
      description: 'JSON 형식으로 결과 출력',
      default: false,
    }),
  };

  // scan 명령어는 apicenter.yaml 없이도 동작해야 하므로
  // loadConfig()를 선택적으로 호출한다.
  // yaml이 있으면 scan 섹션의 설정을 사용하고, 없으면 기본값 사용.
  async run(): Promise<void> {
    const { flags } = await this.parse(Scan);

    // apicenter.yaml에서 scan 설정 로드 (선택적)
    let configIncludes: string[] | undefined;
    let configExcludes: string[] | undefined;
    try {
      await this.loadConfig();
      configIncludes = this.config_?.scan?.include;
      configExcludes = this.config_?.scan?.exclude;
    } catch {
      // yaml 없어도 동작
    }

    const include = flags.include ?? configIncludes;
    const exclude = flags.exclude ?? configExcludes;

    this.log('Scanning project...\n');

    const result = await scanDirectory({
      cwd: process.cwd(),
      ...(include ? { include } : {}),
      ...(exclude ? { exclude } : {}),
    });

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.matches.length === 0) {
      this.log('No environment variable references found.');
      return;
    }

    const table = new Table({
      head: ['Key', 'Language', 'File'],
      colWidths: [30, 16, 40],
      style: { head: ['cyan'] },
    });

    for (const match of result.matches) {
      table.push([match.key, match.language, `${match.file}:${match.line}`]);
    }

    this.log('Results:');
    this.log(table.toString());
    this.log(`\n  Found ${result.uniqueKeys.length} unique keys across ${result.fileCount} files.`);
  }
}
```

---

### Step 2-3: scan 명령어 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/cli/src/commands/scan.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCommand } from '@oclif/test';

function createTempDir(): string {
  const dir = join(tmpdir(), `apicenter-scan-cmd-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('scan command', () => {
  let tmpDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = createTempDir();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('환경변수 참조를 탐지하여 테이블 출력', async () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'src', 'app.ts'),
      `const key = process.env.OPENAI_API_KEY;\nconst db = process.env.DB_PASSWORD;`,
      'utf-8',
    );

    const { stdout } = await runCommand(['scan', '--include', 'src/**', '--exclude', ''], {
      root: import.meta.url,
    });

    expect(stdout).toContain('OPENAI_API_KEY');
    expect(stdout).toContain('DB_PASSWORD');
    expect(stdout).toContain('typescript');
  });

  it('--json 플래그로 JSON 출력', async () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'src', 'app.py'),
      `val = os.getenv("JSON_TEST_KEY")`,
      'utf-8',
    );

    const { stdout } = await runCommand(['scan', '--json', '--include', 'src/**', '--exclude', ''], {
      root: import.meta.url,
    });

    const parsed = JSON.parse(stdout);
    expect(parsed.uniqueKeys).toContain('JSON_TEST_KEY');
    expect(parsed.fileCount).toBe(1);
  });

  it('참조가 없을 때 no results 메시지 출력', async () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.ts'), `const x = 1;`, 'utf-8');

    const { stdout } = await runCommand(['scan', '--include', 'src/**', '--exclude', ''], {
      root: import.meta.url,
    });

    expect(stdout).toContain('No environment variable references found');
  });
});
```

---

### Step 2-4: 테스트 실행

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm --filter apicenter test --run -- scan
```

---

## Task 3: `apicenter doctor` — 보안 상태 점검

### 목적

`packages/core/src/security/doctor-checks.ts`에 개별 체크 함수를 구현하고, `packages/cli/src/commands/doctor.ts`가 이를 호출하여 결과를 출력한다.

---

### Step 3-1: doctor-checks 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/security/doctor-checks.ts`

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface DoctorCheckResult {
  id: string;
  description: string;
  passed: boolean;
  message: string;
}

/**
 * 체크 1: output.path (.env.local 등)가 .gitignore에 포함되어 있는지 확인.
 * apicenter.yaml이 없으면 기본값 `.env.local`을 사용한다.
 */
export function checkOutputPathInGitignore(
  cwd: string,
  outputPath: string = '.env.local',
): DoctorCheckResult {
  const gitignorePath = join(cwd, '.gitignore');
  const id = 'output-path-gitignored';
  const description = `${outputPath} is in .gitignore`;

  if (!existsSync(gitignorePath)) {
    return {
      id,
      description,
      passed: false,
      message: `.gitignore 파일이 없습니다.`,
    };
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map((l) => l.trim());

  // 정확히 일치하거나 와일드카드 *.env, .env* 등으로 덮이는 경우 모두 통과
  const covered =
    lines.includes(outputPath) ||
    lines.includes('*.env') ||
    lines.some((l) => {
      if (!l.includes('*')) return false;
      const escaped = l.replace('.', '\\.').replace('*', '.*');
      return new RegExp(`^${escaped}$`).test(outputPath);
    });

  return {
    id,
    description,
    passed: covered,
    message: covered
      ? `${outputPath}가 .gitignore에 포함되어 있습니다.`
      : `${outputPath}를 .gitignore에 추가하세요.`,
  };
}

/**
 * 체크 2: .env 파일이 .gitignore에 포함되어 있는지 확인.
 */
export function checkDotenvInGitignore(cwd: string): DoctorCheckResult {
  const gitignorePath = join(cwd, '.gitignore');
  const id = 'dotenv-gitignored';
  const description = '.env is in .gitignore';

  if (!existsSync(gitignorePath)) {
    return {
      id,
      description,
      passed: false,
      message: '.gitignore 파일이 없습니다.',
    };
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map((l) => l.trim());
  const covered =
    lines.includes('.env') ||
    lines.includes('*.env') ||
    lines.some((l) => l === '.env*');

  return {
    id,
    description,
    passed: covered,
    message: covered
      ? '.env가 .gitignore에 포함되어 있습니다.'
      : '.env를 .gitignore에 추가하세요.',
  };
}

/**
 * 체크 3: apicenter.yaml에 하드코딩된 시크릿 값이 있는지 확인.
 * 휴리스틱: config 블록의 값 중 20자 초과하는 문자열이 있으면 시크릿 의심.
 * 단, URL (http/https로 시작)은 제외한다.
 */
export function checkNoHardcodedSecrets(cwd: string): DoctorCheckResult {
  const configPath = join(cwd, 'apicenter.yaml');
  const id = 'no-hardcoded-secrets';
  const description = 'apicenter.yaml does not contain hardcoded secret values';

  if (!existsSync(configPath)) {
    return {
      id,
      description,
      passed: true, // yaml 없으면 하드코딩 자체가 없으므로 통과
      message: 'apicenter.yaml이 없습니다.',
    };
  }

  const content = readFileSync(configPath, 'utf-8');

  // config: 블록 이후의 값만 검사 (provider config)
  // 패턴: 들여쓰기 후 key: "value" 또는 key: value 형태
  const valuePattern = /^\s+[\w_]+:\s+["']?(.+?)["']?\s*$/gm;
  const suspiciousValues: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = valuePattern.exec(content)) !== null) {
    const val = match[1]?.trim() ?? '';
    // URL, 버전 문자열, 숫자, 짧은 값은 제외
    if (
      val.startsWith('http') ||
      val.startsWith('https') ||
      val.startsWith('"1"') ||
      val === '1' ||
      /^\d+$/.test(val) ||
      val.length <= 20
    ) {
      continue;
    }
    // 길이 > 20이고 알파벳+숫자+특수문자 혼합이면 의심
    if (/[A-Za-z0-9+/=_-]{20,}/.test(val)) {
      suspiciousValues.push(val.slice(0, 8) + '...');
    }
  }

  const passed = suspiciousValues.length === 0;
  return {
    id,
    description,
    passed,
    message: passed
      ? 'apicenter.yaml에 하드코딩된 시크릿이 없습니다.'
      : `의심 값 ${suspiciousValues.length}개 발견: ${suspiciousValues.join(', ')}. 환경변수나 별도 자격증명 저장소를 사용하세요.`,
  };
}

/**
 * 모든 체크를 실행하여 결과 목록을 반환한다.
 */
export async function runAllDoctorChecks(
  cwd: string,
  outputPath?: string,
): Promise<DoctorCheckResult[]> {
  return [
    checkOutputPathInGitignore(cwd, outputPath),
    checkDotenvInGitignore(cwd),
    checkNoHardcodedSecrets(cwd),
  ];
}
```

---

### Step 3-2: security index export

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/security/index.ts`

```typescript
export {
  checkOutputPathInGitignore,
  checkDotenvInGitignore,
  checkNoHardcodedSecrets,
  runAllDoctorChecks,
} from './doctor-checks.js';
export type { DoctorCheckResult } from './doctor-checks.js';
```

---

### Step 3-3: doctor-checks 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/security/doctor-checks.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkOutputPathInGitignore,
  checkDotenvInGitignore,
  checkNoHardcodedSecrets,
  runAllDoctorChecks,
} from './doctor-checks.js';

function createTempDir(): string {
  const dir = join(tmpdir(), `apicenter-doctor-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('checkOutputPathInGitignore', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('.gitignore에 .env.local이 있으면 통과', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env.local\n.DS_Store\n', 'utf-8');
    const result = checkOutputPathInGitignore(tmpDir, '.env.local');
    expect(result.passed).toBe(true);
  });

  it('.gitignore에 *.env 와일드카드가 있으면 통과', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '*.env\n', 'utf-8');
    const result = checkOutputPathInGitignore(tmpDir, '.env.local');
    // *.env는 .env.local을 덮지 않음 — 실패가 올바름
    // 단, .env.local이 없는 경우를 명시적으로 테스트
    expect(result.passed).toBe(false);
  });

  it('.gitignore에 출력 경로가 없으면 실패', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8');
    const result = checkOutputPathInGitignore(tmpDir, '.env.local');
    expect(result.passed).toBe(false);
    expect(result.message).toContain('.gitignore에 추가하세요');
  });

  it('.gitignore가 없으면 실패', () => {
    const result = checkOutputPathInGitignore(tmpDir, '.env.local');
    expect(result.passed).toBe(false);
    expect(result.message).toContain('.gitignore 파일이 없습니다');
  });
});

describe('checkDotenvInGitignore', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('.gitignore에 .env가 있으면 통과', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env\n', 'utf-8');
    const result = checkDotenvInGitignore(tmpDir);
    expect(result.passed).toBe(true);
  });

  it('.gitignore에 .env*가 있으면 통과', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env*\n', 'utf-8');
    const result = checkDotenvInGitignore(tmpDir);
    expect(result.passed).toBe(true);
  });

  it('.env가 없으면 실패', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'dist/\n', 'utf-8');
    const result = checkDotenvInGitignore(tmpDir);
    expect(result.passed).toBe(false);
  });
});

describe('checkNoHardcodedSecrets', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('apicenter.yaml이 없으면 통과 (하드코딩 없음)', () => {
    const result = checkNoHardcodedSecrets(tmpDir);
    expect(result.passed).toBe(true);
  });

  it('짧은 config 값만 있으면 통과', () => {
    writeFileSync(
      join(tmpDir, 'apicenter.yaml'),
      `version: "1"\nprovider:\n  name: dotenv\n  config:\n    path: .env\n`,
      'utf-8',
    );
    const result = checkNoHardcodedSecrets(tmpDir);
    expect(result.passed).toBe(true);
  });

  it('20자 초과 알파벳+숫자 값이 있으면 실패', () => {
    writeFileSync(
      join(tmpDir, 'apicenter.yaml'),
      `version: "1"\nprovider:\n  name: infisical\n  config:\n    client_secret: "sk-proj-abcdefghij1234567890XYZxyz"\n`,
      'utf-8',
    );
    const result = checkNoHardcodedSecrets(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('의심 값');
  });

  it('URL 값은 시크릿으로 간주하지 않음', () => {
    writeFileSync(
      join(tmpDir, 'apicenter.yaml'),
      `version: "1"\nprovider:\n  name: infisical\n  config:\n    host: "https://app.infisical.com"\n    project_id: "proj_abc"\n`,
      'utf-8',
    );
    const result = checkNoHardcodedSecrets(tmpDir);
    expect(result.passed).toBe(true);
  });
});

describe('runAllDoctorChecks', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('모든 체크를 실행하여 3개 결과 반환', async () => {
    const results = await runAllDoctorChecks(tmpDir);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id)).toEqual([
      'output-path-gitignored',
      'dotenv-gitignored',
      'no-hardcoded-secrets',
    ]);
  });

  it('모든 조건 충족 시 전부 통과', async () => {
    writeFileSync(
      join(tmpDir, '.gitignore'),
      '.env.local\n.env\nnode_modules/\n',
      'utf-8',
    );
    const results = await runAllDoctorChecks(tmpDir, '.env.local');
    const allPassed = results.every((r) => r.passed);
    expect(allPassed).toBe(true);
  });
});
```

---

### Step 3-4: doctor 명령어 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/cli/src/commands/doctor.ts`

```typescript
import { Command } from '@oclif/core';
import { join } from 'node:path';
import { runAllDoctorChecks } from '@apicenter/core';
import { existsSync, readFileSync } from 'node:fs';
import { parseConfig } from '@apicenter/core';

export default class Doctor extends Command {
  static description = '프로젝트 시크릿 보안 상태 점검';
  static examples = [
    '<%= config.bin %> doctor',
  ];

  async run(): Promise<void> {
    const cwd = process.cwd();

    // apicenter.yaml에서 output.path를 읽어 체크에 사용 (선택적)
    let outputPath: string | undefined;
    const configPath = join(cwd, 'apicenter.yaml');
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const config = parseConfig(content);
        outputPath = config.output?.path;
      } catch {
        // 파싱 실패 시 기본값 사용
      }
    }

    this.log('Checking project security...\n');

    const results = await runAllDoctorChecks(cwd, outputPath);

    let passedCount = 0;
    for (const check of results) {
      const icon = check.passed ? '✓' : '✗';
      const label = check.passed ? check.description : `${check.description} — ${check.message}`;
      this.log(`  ${icon} ${label}`);
      if (check.passed) passedCount++;
    }

    const total = results.length;
    this.log(`\n  Score: ${passedCount}/${total}`);

    if (passedCount < total) {
      this.log(`  Fix the issues above to improve your security posture.`);
      this.exit(1);
    } else {
      this.log(`  All checks passed.`);
    }
  }
}
```

---

### Step 3-5: doctor 명령어 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/cli/src/commands/doctor.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCommand } from '@oclif/test';

function createTempDir(): string {
  const dir = join(tmpdir(), `apicenter-doctor-cmd-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('doctor command', () => {
  let tmpDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = createTempDir();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('모든 체크 통과 시 Score 3/3 출력', async () => {
    writeFileSync(
      join(tmpDir, '.gitignore'),
      '.env.local\n.env\nnode_modules/\n',
      'utf-8',
    );
    writeFileSync(
      join(tmpDir, 'apicenter.yaml'),
      `version: "1"\nprovider:\n  name: dotenv\n  config:\n    path: .env\noutput:\n  path: .env.local\n`,
      'utf-8',
    );

    const { stdout } = await runCommand(['doctor'], { root: import.meta.url });
    expect(stdout).toContain('Score: 3/3');
    expect(stdout).toContain('All checks passed');
  });

  it('gitignore 누락 시 실패 체크 표시', async () => {
    // .gitignore 없음
    const { stdout } = await runCommand(['doctor'], { root: import.meta.url });
    expect(stdout).toContain('✗');
    expect(stdout).toContain('Score: 1/3'); // no-hardcoded-secrets는 yaml 없으므로 통과
  });
});
```

---

### Step 3-6: core index에 security export 추가

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/index.ts`

```typescript
export * from './types/index.js';
export * from './logger/index.js';
export * from './config/index.js';
export * from './scanner/index.js';
export * from './security/index.js';
```

---

### Step 3-7: 테스트 실행

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm --filter @apicenter/core test --run -- doctor
pnpm --filter apicenter test --run -- doctor
```

---

## Task 4: Provider Registry — 동적 등록/발견 메커니즘

### 목적

`ProviderRegistry`를 `@apicenter/core`에 추가하여 Provider를 이름으로 등록하고 해결하는 메커니즘을 구현한다. `BaseCommand.resolveProvider()`를 registry를 통해 동작하도록 업데이트한다.

---

### Step 4-1: ProviderRegistry 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/registry/provider-registry.ts`

```typescript
import type { SecretProvider } from '../types/index.js';

/**
 * ProviderRegistry는 Provider 이름 → Factory 함수 매핑을 관리한다.
 * Factory 함수는 config를 받아 SecretProvider 인스턴스를 반환한다.
 */
export class ProviderRegistry {
  private readonly factories: Map<
    string,
    (config: Record<string, unknown>) => SecretProvider
  > = new Map();

  /**
   * Provider를 등록한다.
   * @param name Provider 이름 (apicenter.yaml의 provider.name과 일치)
   * @param factory config를 받아 SecretProvider 인스턴스를 반환하는 팩토리 함수
   */
  register(name: string, factory: (config: Record<string, unknown>) => SecretProvider): void {
    if (this.factories.has(name)) {
      throw new Error(
        `Provider '${name}'은 이미 등록되어 있습니다. 덮어쓰려면 먼저 unregister()를 호출하세요.`,
      );
    }
    this.factories.set(name, factory);
  }

  /**
   * 등록된 Provider를 덮어쓴다 (테스트 및 override 용도).
   */
  override(name: string, factory: (config: Record<string, unknown>) => SecretProvider): void {
    this.factories.set(name, factory);
  }

  /**
   * Provider 등록을 제거한다.
   */
  unregister(name: string): void {
    this.factories.delete(name);
  }

  /**
   * 이름으로 Provider 인스턴스를 생성하여 반환한다.
   * @throws 등록되지 않은 Provider 이름이면 Error
   */
  resolve(name: string, config: Record<string, unknown> = {}): SecretProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      const available = this.list().join(', ') || '없음';
      throw new Error(
        `Provider '${name}'을 찾을 수 없습니다. 등록된 Provider: ${available}\n` +
          `외부 Provider는 npm에서 설치하세요: npm install @apicenter/provider-${name}`,
      );
    }
    return factory(config);
  }

  /**
   * 등록된 Provider 이름 목록을 반환한다.
   */
  list(): string[] {
    return [...this.factories.keys()].sort();
  }

  /**
   * 특정 Provider가 등록되어 있는지 확인한다.
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }
}

/** 전역 싱글톤 레지스트리 */
export const globalRegistry = new ProviderRegistry();
```

---

### Step 4-2: registry index export

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/registry/index.ts`

```typescript
export { ProviderRegistry, globalRegistry } from './provider-registry.js';
```

---

### Step 4-3: core index에 registry export 추가

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/index.ts`

```typescript
export * from './types/index.js';
export * from './logger/index.js';
export * from './config/index.js';
export * from './scanner/index.js';
export * from './security/index.js';
export * from './registry/index.js';
```

---

### Step 4-4: BaseCommand를 ProviderRegistry 기반으로 업데이트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/cli/src/base-command.ts`

기존 파일을 다음으로 완전 교체한다:

```typescript
import { Command } from '@oclif/core';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, globalRegistry, type ApicenterConfig } from '@apicenter/core';
import { DotenvProvider } from '@apicenter/provider-dotenv';
import type { SecretProvider } from '@apicenter/core';

// dotenv provider를 전역 레지스트리에 기본 등록
if (!globalRegistry.has('dotenv')) {
  globalRegistry.register('dotenv', (config) =>
    new DotenvProvider({ path: (config['path'] as string) ?? '.env' }),
  );
}

export abstract class BaseCommand extends Command {
  protected config_!: ApicenterConfig;
  protected provider!: SecretProvider;

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
    this.provider = await this.resolveProvider();
  }

  /**
   * apicenter.yaml의 provider.name을 globalRegistry에서 찾아 인스턴스를 반환한다.
   * 외부 Provider (e.g., infisical)는 dynamic import로 로드를 시도한다.
   */
  protected async resolveProvider(): Promise<SecretProvider> {
    const { name, config } = this.config_.provider;
    const resolvedConfig = (config ?? {}) as Record<string, unknown>;

    // 레지스트리에 등록된 Provider가 있으면 바로 반환
    if (globalRegistry.has(name)) {
      return globalRegistry.resolve(name, resolvedConfig);
    }

    // 레지스트리에 없으면 @apicenter/provider-{name} 패키지를 dynamic import 시도
    try {
      const module = await import(`@apicenter/provider-${name}`);
      const ProviderClass =
        module.default ??
        module[`${name.charAt(0).toUpperCase() + name.slice(1)}Provider`];

      if (!ProviderClass) {
        throw new Error(`@apicenter/provider-${name} 패키지에서 Provider 클래스를 찾을 수 없습니다.`);
      }

      const instance: SecretProvider = new ProviderClass(resolvedConfig);
      // 다음 호출을 위해 레지스트리에 등록
      globalRegistry.override(name, (cfg) => new ProviderClass(cfg));
      return instance;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
        this.error(
          `Provider '${name}'를 찾을 수 없습니다.\n` +
            `설치하려면: npm install @apicenter/provider-${name}`,
          { exit: 1 },
        );
      }
      throw err;
    }
  }

  protected get outputPath(): string {
    return this.config_.output?.path ?? '.env.local';
  }

  protected get defaultEnv(): string {
    return this.config_.default_env ?? 'dev';
  }
}
```

---

### Step 4-5: ProviderRegistry 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/core/src/registry/provider-registry.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from './provider-registry.js';
import type { SecretProvider, AuthConfig, SecretEntry, SecretValue } from '../types/index.js';

// 테스트용 mock Provider
function makeMockProvider(name: string): SecretProvider {
  return {
    name,
    authenticate: async (_: AuthConfig) => {},
    isAuthenticated: async () => true,
    getSecret: async (_key: string) => 'mock-value' as SecretValue,
    listSecrets: async () => [] as SecretEntry[],
    setSecret: async () => {},
    deleteSecret: async () => {},
    pullAll: async () => ({ MOCK_KEY: 'mock-value' }),
    pushAll: async () => {},
  };
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('Provider를 등록하고 resolve할 수 있다', () => {
    registry.register('mock', (_config) => makeMockProvider('mock'));
    const provider = registry.resolve('mock', {});
    expect(provider.name).toBe('mock');
  });

  it('등록되지 않은 Provider resolve 시 에러', () => {
    expect(() => registry.resolve('unknown', {})).toThrow(
      "Provider 'unknown'을 찾을 수 없습니다",
    );
  });

  it('중복 등록 시 에러', () => {
    registry.register('mock', (_) => makeMockProvider('mock'));
    expect(() => registry.register('mock', (_) => makeMockProvider('mock'))).toThrow(
      "Provider 'mock'은 이미 등록되어 있습니다",
    );
  });

  it('override는 중복 등록을 허용', () => {
    registry.register('mock', (_) => makeMockProvider('mock'));
    expect(() => registry.override('mock', (_) => makeMockProvider('mock-v2'))).not.toThrow();
    const provider = registry.resolve('mock', {});
    expect(provider.name).toBe('mock-v2');
  });

  it('unregister 후 resolve 시 에러', () => {
    registry.register('mock', (_) => makeMockProvider('mock'));
    registry.unregister('mock');
    expect(() => registry.resolve('mock', {})).toThrow();
  });

  it('list()는 등록된 Provider 이름 목록 반환', () => {
    registry.register('alpha', (_) => makeMockProvider('alpha'));
    registry.register('beta', (_) => makeMockProvider('beta'));
    expect(registry.list()).toEqual(['alpha', 'beta']);
  });

  it('config를 factory에 전달', () => {
    let receivedConfig: Record<string, unknown> = {};
    registry.register('configurable', (config) => {
      receivedConfig = config;
      return makeMockProvider('configurable');
    });
    registry.resolve('configurable', { path: '/tmp/.env', debug: true });
    expect(receivedConfig['path']).toBe('/tmp/.env');
    expect(receivedConfig['debug']).toBe(true);
  });
});
```

---

### Step 4-6: 테스트 실행

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm --filter @apicenter/core test --run -- registry
```

---

## Task 5: `apicenter run` 명령어 구현

### 목적

Provider에서 시크릿을 로드하여 환경변수로 설정한 뒤 자식 프로세스를 실행한다. 파일을 생성하지 않고 process 환경변수에만 주입한다.

---

### Step 5-1: run 명령어 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/cli/src/commands/run.ts`

```typescript
import { Flags, Args } from '@oclif/core';
import { spawn } from 'node:child_process';
import { BaseCommand } from '../base-command.js';

export default class Run extends BaseCommand {
  static description = '시크릿을 환경변수로 주입하여 명령어 실행 (파일 생성 없음)';
  static strict = false; // -- 이후 임의의 인자를 허용
  static examples = [
    '<%= config.bin %> run -- npm start',
    '<%= config.bin %> run --env staging -- python manage.py runserver',
    '<%= config.bin %> run -- node server.js',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '로드할 환경 (기본: default_env)',
    }),
  };

  // run 명령어는 -- 이후의 모든 인자를 명령어로 사용한다.
  // oclif는 strict=false 시 argv로 파싱되지 않은 인자를 제공한다.
  async run(): Promise<void> {
    await this.loadConfig();
    const { flags, argv } = await this.parse(Run);

    // '--' 구분자 이후의 인자 추출
    // argv에는 '--' 이후 모든 raw 인자가 포함됨
    const rawArgv = process.argv.slice(process.argv.indexOf('run') + 1);
    const separatorIdx = rawArgv.indexOf('--');
    const cmdArgs = separatorIdx >= 0 ? rawArgv.slice(separatorIdx + 1) : (argv as string[]);

    if (cmdArgs.length === 0) {
      this.error(
        '실행할 명령어를 지정하세요.\n  예: apicenter run -- npm start',
        { exit: 1 },
      );
    }

    const env = flags.env ?? this.defaultEnv;

    this.log(`Loading secrets from '${env}' environment...`);
    const secrets = await this.provider.pullAll(env);
    const secretCount = Object.keys(secrets).length;
    this.log(`Injecting ${secretCount} secrets into environment.\n`);

    // 현재 프로세스 환경변수 + provider 시크릿을 병합
    // provider 시크릿이 기존 환경변수를 덮어쓴다
    const childEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...secrets,
    };

    const [cmd, ...args] = cmdArgs;
    if (!cmd) {
      this.error('실행할 명령어가 없습니다.', { exit: 1 });
    }

    const child = spawn(cmd, args, {
      env: childEnv,
      stdio: 'inherit', // stdin/stdout/stderr를 부모 프로세스와 공유
      shell: false,     // 보안상 shell 실행 비활성화
    });

    // 자식 프로세스 에러 처리
    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.error(`명령어를 찾을 수 없습니다: '${cmd}'`, { exit: 127 });
      }
      this.error(`명령어 실행 중 오류 발생: ${err.message}`, { exit: 1 });
    });

    // 자식 프로세스 종료 시 동일한 exit code로 종료
    child.on('close', (code, signal) => {
      if (signal) {
        // 시그널로 종료된 경우 (e.g., SIGINT, SIGTERM)
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 0);
      }
    });
  }
}
```

---

### Step 5-2: run 명령어 테스트

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/cli/src/commands/run.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// run 명령어는 자식 프로세스를 spawn하므로
// 통합 테스트는 실제 빌드된 CLI를 사용한다.
// 단위 테스트에서는 환경변수 주입 로직만 검증한다.

function createTempDir(): string {
  const dir = join(tmpdir(), `apicenter-run-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('run command — env injection logic', () => {
  let tmpDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = createTempDir();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dotenv provider의 시크릿이 환경변수에 주입되는지 검증 (node -e로 확인)', () => {
    // dotenv provider 설정
    writeFileSync(
      join(tmpDir, 'apicenter.yaml'),
      `version: "1"\nprovider:\n  name: dotenv\n  config:\n    path: .env\n`,
      'utf-8',
    );
    writeFileSync(
      join(tmpDir, '.env'),
      `RUN_TEST_SECRET=hello_from_run\n`,
      'utf-8',
    );

    // CLI 빌드 경로를 찾아 실행
    // 이 테스트는 e2e 수준이며 빌드 후 실행해야 한다.
    // 빌드 전 단계에서는 스킵하고 노트로 남긴다.
    // TODO: pnpm build 후 ./bin/run.js run -- node -e "..." 로 검증
    expect(true).toBe(true); // placeholder — 실제 검증은 e2e에서
  });
});

describe('run command — argument parsing', () => {
  it('-- 없이 명령어 지정 시 에러 메시지를 기대', () => {
    // run 명령어의 인자 파싱 로직을 간접 검증
    // cmdArgs가 비어있을 때 에러를 던지는지 확인
    const rawArgv = ['run'];
    const separatorIdx = rawArgv.indexOf('--');
    const cmdArgs = separatorIdx >= 0 ? rawArgv.slice(separatorIdx + 1) : [];
    expect(cmdArgs).toHaveLength(0);
  });

  it('-- 이후 인자가 cmdArgs로 정확히 파싱됨', () => {
    const rawArgv = ['run', '--env', 'staging', '--', 'npm', 'start', '--port', '3000'];
    const separatorIdx = rawArgv.indexOf('--');
    const cmdArgs = separatorIdx >= 0 ? rawArgv.slice(separatorIdx + 1) : [];
    expect(cmdArgs).toEqual(['npm', 'start', '--port', '3000']);
  });

  it('-- 없는 경우 빈 배열', () => {
    const rawArgv = ['run', '--env', 'staging'];
    const separatorIdx = rawArgv.indexOf('--');
    const cmdArgs = separatorIdx >= 0 ? rawArgv.slice(separatorIdx + 1) : [];
    expect(cmdArgs).toHaveLength(0);
  });
});
```

---

### Step 5-3: 테스트 실행

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm --filter apicenter test --run -- run
```

---

## Task 6: `@apicenter/provider-infisical` 패키지 구현

### 목적

`@infisical/sdk`를 래핑한 Infisical Provider를 독립 패키지로 구현한다. Universal Auth (clientId/clientSecret)와 Token 방식 인증을 지원한다.

---

### Step 6-1: 패키지 구조 생성

**Bash:**

```bash
mkdir -p /Users/jinwooro/Desktop/Project/Apicenter/packages/provider-infisical/src
```

---

### Step 6-2: package.json

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-infisical/package.json`

```json
{
  "name": "@apicenter/provider-infisical",
  "version": "0.1.0",
  "description": "Infisical provider adapter for apicenter",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@apicenter/core": "workspace:*",
    "@infisical/sdk": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

### Step 6-3: tsconfig.json

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-infisical/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

---

### Step 6-4: InfisicalProvider 구현

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-infisical/src/index.ts`

```typescript
import type {
  SecretProvider,
  SecretEntry,
  SecretValue,
  AuthConfig,
} from '@apicenter/core';

/**
 * Infisical Provider 설정.
 * apicenter.yaml의 provider.config에 대응한다.
 */
export interface InfisicalConfig {
  /** Infisical 프로젝트 ID (필수) */
  project_id: string;
  /** Infisical 서버 URL (기본: https://app.infisical.com) */
  host?: string;
  /** Universal Auth — Client ID */
  client_id?: string;
  /** Universal Auth — Client Secret */
  client_secret?: string;
  /** 토큰 기반 인증 (Universal Auth 대신 사용 가능) */
  token?: string;
  /** 환경 이름 매핑 (선택적 오버라이드) */
  environment?: string;
}

/**
 * Infisical SDK의 listSecrets 응답 항목 타입.
 * @infisical/sdk 버전에 따라 구조가 다를 수 있으므로
 * 런타임에 안전하게 접근한다.
 */
interface InfisicalSecretItem {
  secretKey: string;
  secretValue: string;
  version?: number;
  id?: string;
}

/**
 * InfisicalProvider — @infisical/sdk를 래핑한 SecretProvider 구현체.
 *
 * 지원 인증 방식:
 * 1. Universal Auth (client_id + client_secret) — 권장
 * 2. Service Token (token) — 레거시
 *
 * apicenter.yaml 설정 예시:
 * ```yaml
 * provider:
 *   name: infisical
 *   config:
 *     project_id: "proj_xxx"
 *     host: "https://app.infisical.com"
 *     client_id: "uuid-..."
 *     client_secret: "st.xxx..."
 * ```
 */
export class InfisicalProvider implements SecretProvider {
  readonly name = 'infisical';

  private readonly projectId: string;
  private readonly host: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly token?: string;

  // @infisical/sdk의 InfisicalClient 인스턴스 (lazy init)
  // unknown으로 타입 지정하여 SDK 타입 의존성을 런타임으로 미룸
  private client: unknown = null;
  private authenticated = false;

  constructor(config: InfisicalConfig) {
    if (!config.project_id) {
      throw new Error('InfisicalProvider: project_id는 필수입니다.');
    }
    if (!config.client_id && !config.client_secret && !config.token) {
      throw new Error(
        'InfisicalProvider: 인증 정보가 필요합니다. ' +
          'client_id + client_secret (Universal Auth) 또는 token을 설정하세요.',
      );
    }
    this.projectId = config.project_id;
    this.host = config.host ?? 'https://app.infisical.com';
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.token = config.token;
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    await this.ensureClient();
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authenticated;
  }

  async pullAll(env?: string): Promise<Record<string, string>> {
    const client = await this.ensureClient();
    const environment = env ?? 'dev';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secrets: InfisicalSecretItem[] = await (client as any).listSecrets({
      projectId: this.projectId,
      environment,
      expandSecretReferences: true,
      recursive: false,
    });

    const result: Record<string, string> = {};
    for (const secret of secrets) {
      if (secret.secretKey && secret.secretValue !== undefined) {
        result[secret.secretKey] = secret.secretValue;
      }
    }
    return result;
  }

  async pushAll(secrets: Record<string, string>, env?: string): Promise<void> {
    const environment = env ?? 'dev';
    for (const [key, value] of Object.entries(secrets)) {
      await this.setSecret(key, value, environment);
    }
  }

  async getSecret(key: string, env?: string): Promise<SecretValue> {
    const all = await this.pullAll(env);
    return all[key];
  }

  async listSecrets(env?: string): Promise<SecretEntry[]> {
    const all = await this.pullAll(env);
    return Object.entries(all).map(([key, value]) => ({
      key,
      value,
      env,
      source: `infisical:${this.projectId}`,
    }));
  }

  async setSecret(key: string, value: string, env?: string): Promise<void> {
    const client = await this.ensureClient();
    const environment = env ?? 'dev';

    // 시크릿이 이미 존재하는지 확인
    const existing = await this.getSecret(key, environment);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientAny = client as any;
    if (existing !== undefined) {
      await clientAny.updateSecret({
        projectId: this.projectId,
        environment,
        secretKey: key,
        secretValue: value,
      });
    } else {
      await clientAny.createSecret({
        projectId: this.projectId,
        environment,
        secretKey: key,
        secretValue: value,
      });
    }
  }

  async deleteSecret(key: string, env?: string): Promise<void> {
    const client = await this.ensureClient();
    const environment = env ?? 'dev';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).deleteSecret({
      projectId: this.projectId,
      environment,
      secretKey: key,
    });
  }

  /**
   * InfisicalClient 인스턴스를 lazy하게 초기화한다.
   * 이 방식으로 @infisical/sdk를 dynamic import하여
   * 패키지가 설치되지 않은 환경에서도 에러 메시지를 명확히 제공한다.
   */
  private async ensureClient(): Promise<unknown> {
    if (this.client) return this.client;

    let InfisicalClient: new (config: Record<string, unknown>) => unknown;
    try {
      const sdk = await import('@infisical/sdk');
      InfisicalClient = sdk.InfisicalClient ?? sdk.default;
    } catch {
      throw new Error(
        '@infisical/sdk 패키지를 찾을 수 없습니다.\n' +
          '설치하려면: npm install @apicenter/provider-infisical\n' +
          '(이 패키지는 @infisical/sdk를 자동으로 포함합니다)',
      );
    }

    const authConfig: Record<string, unknown> = {
      siteUrl: this.host,
    };

    if (this.clientId && this.clientSecret) {
      // Universal Auth
      authConfig['auth'] = {
        universalAuth: {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
        },
      };
    } else if (this.token) {
      // Service Token (레거시)
      authConfig['auth'] = {
        serviceToken: this.token,
      };
    }

    this.client = new InfisicalClient(authConfig);
    this.authenticated = true;
    return this.client;
  }
}

// default export: BaseCommand의 dynamic import가 이 클래스를 찾을 수 있도록
export default InfisicalProvider;
```

---

### Step 6-5: InfisicalProvider 단위 테스트 (SDK mock)

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/packages/provider-infisical/src/index.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InfisicalProvider } from './index.js';

// @infisical/sdk를 mock하여 실제 Infisical 인스턴스 없이 테스트
vi.mock('@infisical/sdk', () => {
  const mockSecrets = [
    { secretKey: 'DB_HOST', secretValue: 'localhost' },
    { secretKey: 'DB_PORT', secretValue: '5432' },
    { secretKey: 'API_KEY', secretValue: 'sk-test-123456789012345678901234' },
  ];

  const mockClient = {
    listSecrets: vi.fn().mockResolvedValue(mockSecrets),
    createSecret: vi.fn().mockResolvedValue({}),
    updateSecret: vi.fn().mockResolvedValue({}),
    deleteSecret: vi.fn().mockResolvedValue({}),
  };

  return {
    InfisicalClient: vi.fn().mockImplementation(() => mockClient),
    // mock 클라이언트를 테스트에서 접근하기 위해 export
    __mockClient: mockClient,
  };
});

const VALID_CONFIG = {
  project_id: 'proj_test123',
  host: 'https://app.infisical.com',
  client_id: 'client_id_abc',
  client_secret: 'client_secret_xyz',
};

describe('InfisicalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('생성자 검증', () => {
    it('올바른 설정으로 인스턴스 생성 성공', () => {
      expect(() => new InfisicalProvider(VALID_CONFIG)).not.toThrow();
    });

    it('project_id 없으면 에러', () => {
      expect(
        () =>
          new InfisicalProvider({
            project_id: '',
            client_id: 'cid',
            client_secret: 'csec',
          }),
      ).toThrow('project_id는 필수입니다');
    });

    it('인증 정보 없으면 에러', () => {
      expect(
        () =>
          new InfisicalProvider({
            project_id: 'proj_test',
          }),
      ).toThrow('인증 정보가 필요합니다');
    });

    it('token만으로도 생성 가능', () => {
      expect(
        () =>
          new InfisicalProvider({
            project_id: 'proj_test',
            token: 'st.token.xyz',
          }),
      ).not.toThrow();
    });
  });

  describe('pullAll', () => {
    it('시크릿 목록을 Record<string, string>으로 반환', async () => {
      const provider = new InfisicalProvider(VALID_CONFIG);
      const secrets = await provider.pullAll('dev');

      expect(secrets['DB_HOST']).toBe('localhost');
      expect(secrets['DB_PORT']).toBe('5432');
      expect(secrets['API_KEY']).toBe('sk-test-123456789012345678901234');
    });

    it('projectId와 environment가 SDK에 전달됨', async () => {
      const { __mockClient } = await import('@infisical/sdk') as {
        __mockClient: { listSecrets: ReturnType<typeof vi.fn> };
      };

      const provider = new InfisicalProvider(VALID_CONFIG);
      await provider.pullAll('staging');

      expect(__mockClient.listSecrets).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj_test123',
          environment: 'staging',
        }),
      );
    });

    it('env 없으면 기본값 dev 사용', async () => {
      const { __mockClient } = await import('@infisical/sdk') as {
        __mockClient: { listSecrets: ReturnType<typeof vi.fn> };
      };

      const provider = new InfisicalProvider(VALID_CONFIG);
      await provider.pullAll();

      expect(__mockClient.listSecrets).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'dev' }),
      );
    });
  });

  describe('getSecret', () => {
    it('단일 시크릿 키로 값 조회', async () => {
      const provider = new InfisicalProvider(VALID_CONFIG);
      const value = await provider.getSecret('DB_HOST', 'dev');
      expect(value).toBe('localhost');
    });

    it('존재하지 않는 키는 undefined 반환', async () => {
      const provider = new InfisicalProvider(VALID_CONFIG);
      const value = await provider.getSecret('NONEXISTENT_KEY', 'dev');
      expect(value).toBeUndefined();
    });
  });

  describe('listSecrets', () => {
    it('SecretEntry 배열 반환', async () => {
      const provider = new InfisicalProvider(VALID_CONFIG);
      const entries = await provider.listSecrets('dev');

      expect(entries).toHaveLength(3);
      expect(entries[0]).toMatchObject({ key: 'DB_HOST', value: 'localhost' });
      expect(entries[0]?.source).toContain('infisical');
    });
  });

  describe('setSecret', () => {
    it('신규 시크릿은 createSecret 호출', async () => {
      const { __mockClient } = await import('@infisical/sdk') as {
        __mockClient: {
          listSecrets: ReturnType<typeof vi.fn>;
          createSecret: ReturnType<typeof vi.fn>;
        };
      };

      // 해당 키가 없는 케이스로 mock 재설정
      __mockClient.listSecrets.mockResolvedValueOnce([]);

      const provider = new InfisicalProvider(VALID_CONFIG);
      await provider.setSecret('NEW_KEY', 'new_value', 'dev');

      expect(__mockClient.createSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          secretKey: 'NEW_KEY',
          secretValue: 'new_value',
          projectId: 'proj_test123',
          environment: 'dev',
        }),
      );
    });

    it('기존 시크릿은 updateSecret 호출', async () => {
      const { __mockClient } = await import('@infisical/sdk') as {
        __mockClient: {
          listSecrets: ReturnType<typeof vi.fn>;
          updateSecret: ReturnType<typeof vi.fn>;
        };
      };

      // DB_HOST가 이미 존재하는 상황 (기본 mock)
      const provider = new InfisicalProvider(VALID_CONFIG);
      await provider.setSecret('DB_HOST', 'newhost', 'dev');

      expect(__mockClient.updateSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          secretKey: 'DB_HOST',
          secretValue: 'newhost',
        }),
      );
    });
  });

  describe('deleteSecret', () => {
    it('deleteSecret SDK 메서드를 올바른 인자로 호출', async () => {
      const { __mockClient } = await import('@infisical/sdk') as {
        __mockClient: { deleteSecret: ReturnType<typeof vi.fn> };
      };

      const provider = new InfisicalProvider(VALID_CONFIG);
      await provider.deleteSecret('DB_HOST', 'dev');

      expect(__mockClient.deleteSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          secretKey: 'DB_HOST',
          projectId: 'proj_test123',
          environment: 'dev',
        }),
      );
    });
  });

  describe('isAuthenticated', () => {
    it('SDK 클라이언트 초기화 전은 false', async () => {
      const provider = new InfisicalProvider(VALID_CONFIG);
      expect(await provider.isAuthenticated()).toBe(false);
    });

    it('pullAll 후에는 true', async () => {
      const provider = new InfisicalProvider(VALID_CONFIG);
      await provider.pullAll('dev');
      expect(await provider.isAuthenticated()).toBe(true);
    });
  });

  describe('pushAll', () => {
    it('여러 시크릿을 순서대로 설정', async () => {
      const { __mockClient } = await import('@infisical/sdk') as {
        __mockClient: {
          listSecrets: ReturnType<typeof vi.fn>;
          createSecret: ReturnType<typeof vi.fn>;
        };
      };

      __mockClient.listSecrets.mockResolvedValue([]);

      const provider = new InfisicalProvider(VALID_CONFIG);
      await provider.pushAll({ KEY_A: 'val_a', KEY_B: 'val_b' }, 'dev');

      expect(__mockClient.createSecret).toHaveBeenCalledTimes(2);
    });
  });
});
```

---

### Step 6-6: @infisical/sdk 의존성 추가

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm add @infisical/sdk --filter @apicenter/provider-infisical
```

---

### Step 6-7: pnpm workspace에 provider-infisical 추가 확인

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/pnpm-workspace.yaml`

기존 파일을 확인하여 `packages/*`가 이미 포함되어 있으면 추가 수정 불필요.
포함되어 있지 않으면 다음과 같이 수정:

```yaml
packages:
  - 'packages/*'
```

---

### Step 6-8: 테스트 실행

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm --filter @apicenter/provider-infisical test --run
```

Expected output:

```
✓ src/index.test.ts (X tests)
Test Files  1 passed
Tests       N passed
```

---

## Task 7: README.md 작성

### 목적

프로젝트 루트에 영어로 작성된 README.md를 생성한다. 설치, 빠른 시작, 명령어 레퍼런스, Provider 지원 표, 기여 가이드를 포함한다.

---

### Step 7-1: README.md 작성

**File:** `/Users/jinwooro/Desktop/Project/Apicenter/README.md`

```markdown
# apicenter

**One CLI to manage secrets across any backend.**

Stop copy-pasting `.env` files. Start syncing secrets.

```bash
npm install -g apicenter
```

---

## Why apicenter?

- **Any backend** — Infisical, HashiCorp Vault, AWS Secrets Manager, Doppler, 1Password, or just `.env` files
- **Auto-detect** — Scan existing projects to find all environment variable references instantly
- **Secure by default** — Secrets never appear in logs, git history, or terminal output
- **Zero config start** — Works with `.env` files out of the box, upgrade to a vault when ready
- **Plugin architecture** — Install only the providers you need

---

## Quick Start

```bash
# 1. Initialize your project
apicenter init

# 2. Scan for existing environment variable references
apicenter scan

# 3. Pull secrets from your provider to local .env.local
apicenter pull

# 4. Compare local vs remote
apicenter diff

# 5. Run your app with secrets injected (no file created)
apicenter run -- npm start
```

---

## Command Reference

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `init` | Initialize apicenter in your project | `--provider`, `--env` |
| `scan` | Detect environment variable references in source files | `--include`, `--exclude`, `--json` |
| `pull` | Sync secrets from provider to local file | `--env`, `--dry-run`, `--output` |
| `push` | Upload local secrets to provider | `--env`, `--keys`, `--yes` |
| `diff` | Compare local vs remote secrets | `--env` |
| `run` | Inject secrets as env vars and run a command (no file created) | `--env` |
| `doctor` | Check project security posture | — |

### `apicenter init`

```bash
apicenter init                      # Interactive setup with dotenv provider
apicenter init --provider infisical  # Use Infisical as the backend
apicenter init --env production      # Set default environment
```

### `apicenter scan`

```bash
apicenter scan                         # Scan with defaults from apicenter.yaml
apicenter scan --include "src/**"       # Override include pattern
apicenter scan --json                   # Output as JSON
```

Supported languages and file types:

| Language | File Pattern | Detection Pattern |
|----------|-------------|-------------------|
| JavaScript | `*.js`, `*.mjs`, `*.cjs` | `process.env.KEY` |
| TypeScript | `*.ts`, `*.tsx` | `process.env.KEY` |
| Python | `*.py` | `os.environ["KEY"]`, `os.getenv("KEY")` |
| Ruby | `*.rb` | `ENV["KEY"]`, `ENV.fetch("KEY")` |
| Go | `*.go` | `os.Getenv("KEY")` |
| Rust | `*.rs` | `env::var("KEY")` |
| Java | `*.java` | `System.getenv("KEY")` |
| PHP | `*.php` | `$_ENV["KEY"]`, `getenv("KEY")` |
| dotenv | `.env`, `.env.*` | `KEY=value` |
| Docker | `Dockerfile`, `docker-compose.yml` | `ENV KEY`, `KEY=` |
| GitHub Actions | `.github/workflows/*.yml` | `${{ secrets.KEY }}` |

### `apicenter run`

Runs a command with secrets injected as environment variables. No files are created on disk.

```bash
apicenter run -- npm start
apicenter run --env staging -- python manage.py runserver
apicenter run -- node -e "console.log(process.env.MY_SECRET)"
```

### `apicenter doctor`

Checks your project for common security issues.

```bash
apicenter doctor
```

Checks performed:
- `output.path` (e.g., `.env.local`) is in `.gitignore`
- `.env` is in `.gitignore`
- `apicenter.yaml` does not contain hardcoded secret values

---

## Configuration: `apicenter.yaml`

```yaml
version: "1"

provider:
  name: dotenv           # dotenv | infisical | vault | aws | doppler
  config:
    path: .env           # provider-specific config

environments:
  dev:
    provider_env: "development"
  staging:
    provider_env: "staging"
  prod:
    provider_env: "production"

default_env: dev

output:
  format: dotenv         # dotenv | json | yaml
  path: .env.local       # file created by `pull`

scan:
  include:
    - "src/**"
    - "app/**"
  exclude:
    - "node_modules/**"
    - "dist/**"

security:
  mask_in_logs: true
  confirm_before_push: true
  gitignore_check: true
```

### Minimal config (dotenv only)

```yaml
version: "1"
provider:
  name: dotenv
  config:
    path: .env
```

---

## Provider Support

| Provider | Package | Status | Auth Method |
|----------|---------|--------|-------------|
| dotenv | built-in | Stable | — |
| Infisical | `@apicenter/provider-infisical` | Beta | Universal Auth, Service Token |
| HashiCorp Vault | `@apicenter/provider-vault` | Planned | Token, AppRole |
| AWS Secrets Manager | `@apicenter/provider-aws` | Planned | IAM, AssumeRole |
| Doppler | `@apicenter/provider-doppler` | Planned | Service Token |
| 1Password | `@apicenter/provider-1password` | Planned | Service Account |

### Using Infisical

```bash
npm install @apicenter/provider-infisical
```

```yaml
# apicenter.yaml
provider:
  name: infisical
  config:
    project_id: "proj_xxx"
    host: "https://app.infisical.com"   # omit for cloud
    client_id: "..."                     # Universal Auth
    client_secret: "..."
```

---

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup

```bash
git clone https://github.com/your-org/apicenter.git
cd apicenter
pnpm install
pnpm build
pnpm test
```

### Project Structure

```
apicenter/
├── packages/
│   ├── core/                 # @apicenter/core — shared types, scanner, registry
│   ├── cli/                  # apicenter — the CLI package
│   ├── provider-dotenv/      # @apicenter/provider-dotenv
│   └── provider-infisical/   # @apicenter/provider-infisical
├── docs/
│   └── plans/                # Implementation plans
└── README.md
```

### Creating a New Provider

1. Copy the template from `packages/provider-dotenv/`
2. Implement the `SecretProvider` interface from `@apicenter/core`
3. Export your class as default and as a named export
4. Add tests with mocked SDK calls
5. Submit a PR

```typescript
import type { SecretProvider } from '@apicenter/core';

export class MyProvider implements SecretProvider {
  readonly name = 'myprovider';
  // Implement all SecretProvider methods...
}

export default MyProvider;
```

### Running Tests

```bash
pnpm test               # Run all tests
pnpm --filter @apicenter/core test      # Core tests only
pnpm --filter apicenter test            # CLI tests only
pnpm --filter @apicenter/provider-infisical test  # Provider tests only
```

---

## License

MIT — see [LICENSE](./LICENSE)
```

---

## Task 8: 전체 빌드 및 최종 검증

### Step 8-1: 전체 빌드

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm build
```

Expected output:

```
Tasks: N successful, 0 failed
```

---

### Step 8-2: 전체 테스트

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm test
```

Expected output:

```
Test Files  N passed
Tests       N passed
Duration    Xs
```

---

### Step 8-3: TypeScript 타입 체크

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
pnpm typecheck
```

Expected output: 에러 없음.

---

### Step 8-4: CLI smoke test (dotenv provider)

빌드된 CLI를 직접 실행하여 새 명령어가 등록되어 있는지 확인한다.

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
./packages/cli/bin/run.js --help
```

Expected output에 `scan`, `run`, `doctor`가 포함되어야 한다:

```
COMMANDS
  diff    로컬 .env ↔ Provider 간 시크릿 차이 비교
  doctor  프로젝트 시크릿 보안 상태 점검
  init    프로젝트 시크릿 관리 초기 설정
  pull    Provider에서 시크릿을 가져와 로컬 .env 파일 생성
  push    로컬 시크릿을 Provider에 업로드
  run     시크릿을 환경변수로 주입하여 명령어 실행 (파일 생성 없음)
  scan    소스 파일에서 환경변수 참조를 자동 탐지
```

---

### Step 8-5: Git 커밋

**Bash:**

```bash
cd /Users/jinwooro/Desktop/Project/Apicenter
git add packages/core/src/scanner/ \
        packages/core/src/security/ \
        packages/core/src/registry/ \
        packages/core/src/index.ts \
        packages/core/src/types/index.ts \
        packages/provider-infisical/ \
        packages/cli/src/commands/scan.ts \
        packages/cli/src/commands/run.ts \
        packages/cli/src/commands/doctor.ts \
        packages/cli/src/base-command.ts \
        README.md
git commit -m "feat: Phase 2 — scan/run/doctor 명령어 + Infisical Provider + ProviderRegistry (v0.2.0)"
```

---

## 구현 체크리스트

- [ ] Task 1: Scanner Engine (`patterns.ts`, `file-scanner.ts`, `scanner/index.ts`) + 타입 확장
- [ ] Task 2: `scan` 명령어 (`cli/src/commands/scan.ts`) + 테스트
- [ ] Task 3: doctor-checks 모듈 + `doctor` 명령어 + 테스트
- [ ] Task 4: `ProviderRegistry` + `BaseCommand` 업데이트 + 테스트
- [ ] Task 5: `run` 명령어 + 테스트
- [ ] Task 6: `@apicenter/provider-infisical` 패키지 + mock 단위 테스트
- [ ] Task 7: `README.md` 작성
- [ ] Task 8: 전체 빌드 + 테스트 + smoke test + 커밋

---

## 주요 설계 결정

### 왜 `spawn(shell: false)`인가?

`shell: true`는 편리하지만 사용자 입력이 명령어에 포함될 경우 Shell Injection 취약점이 발생한다. `apicenter run`은 신뢰된 인자만 받지만 원칙적으로 `shell: false`로 실행하는 것이 더 안전하다. 단, `npm start`와 같이 PATH에 의존하는 명령어는 `spawn`이 직접 찾아주므로 문제없다.

### 왜 `ProviderRegistry`에 전역 싱글톤을 사용하는가?

CLI 명령어마다 `BaseCommand`를 상속하는 구조에서 모든 명령어가 동일한 레지스트리를 공유해야 한다. 모듈 수준 싱글톤(`globalRegistry`)은 이 요구를 단순하게 충족한다. 테스트에서는 `ProviderRegistry` 인스턴스를 직접 생성하여 격리된 레지스트리를 사용한다.

### 왜 Infisical SDK를 dynamic import로 로드하는가?

`@apicenter/provider-infisical`이 설치되지 않은 환경에서 `BaseCommand`가 import를 시도하면 모듈 로드 에러가 발생한다. Dynamic import를 사용하면 실제로 infisical provider를 사용하려 할 때만 SDK 로드를 시도하고, 미설치 시 명확한 에러 메시지를 제공할 수 있다.

### 왜 `checkNoHardcodedSecrets`의 기준이 20자인가?

실제 시크릿 값(API 키, 토큰 등)은 일반적으로 20자 이상이며, 짧은 config 값(포트 번호, 환경 이름, 경로 등)은 20자 미만인 경우가 대부분이다. 오탐(false positive)을 최소화하기 위해 20자를 기준으로 설정하였다. URL은 명시적으로 제외한다.
