# API Center — 오픈소스 범용 시크릿 관리 CLI 재설계

## 1. 설계 철학 변경

### 기존 설계의 문제점

| 항목 | 기존 (개인 도구) | 변경 (범용 오픈소스) |
|------|-----------------|-------------------|
| 시크릿 백엔드 | Infisical 하드코딩 | 플러그인 어댑터 방식 |
| 설정 파일 | `apicenter.yaml` 단일 포맷 | 다양한 출력 포맷 지원 |
| 인증 | Infisical 토큰만 | 백엔드별 인증 추상화 |
| 배포 | 로컬 사용 전제 | npm/brew/cargo 배포 |
| 문서 | 한국어 중심 | 영어 기본 + i18n |

### 핵심 원칙

1. **백엔드 불가지론(Backend Agnostic)**: Infisical, HashiCorp Vault, AWS Secrets Manager, Doppler, 1Password, `.env` 파일 등 어디든 붙을 수 있어야 함
2. **Zero Config 시작**: `apicenter init` 한 줄이면 기존 프로젝트에서 바로 사용 가능
3. **점진적 복잡성**: 간단한 `.env` 동기화부터 멀티 환경 시크릿 관리까지 필요에 따라 확장
4. **기존 워크플로우 존중**: 사용자가 쓰던 방식을 바꾸지 않고 위에 얹히는 도구

---

## 2. 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   CLI Interface                      │
│  init · scan · push · pull · inject · diff · rotate  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                    Core Engine                        │
│  ConfigParser · SecretResolver · SecureLogger         │
│  TemplateEngine · DiffEngine · SchemaValidator        │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│               Provider Adapter Layer                  │
│  ┌──────────┐ ┌───────┐ ┌─────┐ ┌───────┐ ┌──────┐ │
│  │Infisical │ │ Vault │ │ AWS │ │Doppler│ │ .env │ │
│  └──────────┘ └───────┘ └─────┘ └───────┘ └──────┘ │
│  ┌──────────┐ ┌───────────┐ ┌───────────────────┐   │
│  │1Password │ │ GCP Secret│ │ Azure Key Vault   │   │
│  └──────────┘ └───────────┘ └───────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Provider Adapter 인터페이스

```typescript
// 모든 시크릿 백엔드가 구현해야 하는 인터페이스
interface SecretProvider {
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
  
  // 메타데이터 (선택 구현)
  getEnvironments?(): Promise<string[]>;
  getHistory?(key: string): Promise<SecretHistory[]>;
  rotateSecret?(key: string): Promise<string>;
}
```

각 Provider는 독립 패키지로 분리하여 필요한 것만 설치:

```bash
npm install apicenter                          # 코어 + .env provider
npm install @apicenter/provider-infisical      # Infisical 어댑터
npm install @apicenter/provider-vault          # HashiCorp Vault 어댑터
npm install @apicenter/provider-aws            # AWS Secrets Manager 어댑터
```

---

## 3. 설정 파일 재설계: `apicenter.yaml`

```yaml
# apicenter.yaml — 프로젝트 루트에 위치
version: "1"

# 시크릿 백엔드 설정
provider:
  name: infisical              # infisical | vault | aws | doppler | dotenv | ...
  config:                      # provider별 설정
    project_id: "proj_xxx"
    host: "https://app.infisical.com"  # self-hosted 시 변경

# 환경 정의
environments:
  dev:
    provider_env: "development"    # provider 내부 환경 이름과 매핑
  staging:
    provider_env: "staging"
  prod:
    provider_env: "production"

# 기본 환경
default_env: dev

# 시크릿 그룹 (필수 아님, 프로젝트 규모가 클 때 유용)
groups:
  database:
    keys: [DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME]
  api:
    keys: [OPENAI_API_KEY, STRIPE_SECRET_KEY, SENDGRID_API_KEY]
  aws:
    keys: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]

# 출력 설정
output:
  format: dotenv               # dotenv | json | yaml | toml
  path: .env.local             # inject 시 생성할 파일 경로
  
# 스캔 설정 (scan 명령어용)
scan:
  include:
    - "src/**"
    - "app/**"
    - "lib/**"
    - "config/**"
  exclude:
    - "node_modules/**"
    - "dist/**"
    - ".git/**"
    - "*.lock"
  max_depth: 5
  
# 보안 설정
security:
  mask_in_logs: true           # 기본 true
  confirm_before_push: true    # push 전 확인 프롬프트
  gitignore_check: true        # .env가 .gitignore에 있는지 확인
```

### `.env`만 쓰는 간단한 프로젝트용 최소 설정

```yaml
version: "1"
provider:
  name: dotenv
  config:
    path: .env
```

### 멀티 Provider 설정 (고급)

```yaml
version: "1"

providers:
  primary:
    name: vault
    config:
      address: "https://vault.company.com"
      mount: "secret"
  
  aws_secrets:
    name: aws
    config:
      region: "ap-northeast-2"
      prefix: "myapp/"

# 키별로 어떤 provider에서 가져올지 매핑
secrets:
  DB_PASSWORD:
    provider: primary
    path: "database/credentials"
    field: "password"
  
  STRIPE_KEY:
    provider: aws_secrets
    key: "stripe-api-key"
  
  # 나머지는 기본 provider에서
  "*":
    provider: primary
```

---

## 4. CLI 명령어 재설계

### 4.1 `apicenter init`

프로젝트 초기 설정. 인터랙티브 위저드로 진행.

```bash
$ apicenter init

? Select your secret provider:
  ❯ dotenv (.env file — no external service)
    Infisical
    HashiCorp Vault
    AWS Secrets Manager
    Doppler
    1Password
    Other (manual config)

? Default environment: dev
? Output format: dotenv (.env.local)

✓ Created apicenter.yaml
✓ Added .env.local to .gitignore
✓ Ready! Run `apicenter scan` to detect existing secrets.
```

### 4.2 `apicenter scan`

기존 프로젝트에서 환경변수를 자동 탐지.

```bash
$ apicenter scan

Scanning project...
  ✓ .env                    — 12 secrets found
  ✓ .env.example            — 15 keys found (3 without values)
  ✓ src/**                  — 8 process.env references
  ✓ docker-compose.yml      — 4 environment variables
  ✓ .github/workflows/      — 2 env references

Results:
  ┌────────────────────────┬──────────┬────────────────────────┐
  │ Key                    │ Status   │ Source                 │
  ├────────────────────────┼──────────┼────────────────────────┤
  │ OPENAI_API_KEY         │ ✓ value  │ .env                   │
  │ DB_PASSWORD             │ ✓ value  │ .env                   │
  │ STRIPE_SECRET_KEY      │ ✓ value  │ .env                   │
  │ REDIS_URL              │ ⚠ ref    │ src/lib/cache.ts       │
  │ SENTRY_DSN             │ ⚠ ref    │ .env.example           │
  │ NODE_ENV               │ ○ skip   │ built-in               │
  └────────────────────────┴──────────┴────────────────────────┘

  ✓ value: 10 secrets with values (ready to push)
  ⚠ ref:    3 keys referenced but no value found
  ○ skip:   2 keys excluded (built-in env vars)

? Push 10 secrets to your provider? (Y/n)
? Add 3 missing keys to apicenter.yaml as placeholders? (Y/n)
```

**스캔 대상 언어별 패턴:**

```typescript
const SCAN_PATTERNS: Record<string, RegExp[]> = {
  javascript: [
    /process\.env\.(\w+)/g,
    /process\.env\[['"](\w+)['"]\]/g,
  ],
  python: [
    /os\.environ\[['"](\w+)['"]\]/g,
    /os\.environ\.get\(['"](\w+)['"]/g,
    /os\.getenv\(['"](\w+)['"]/g,
  ],
  ruby: [
    /ENV\[['"](\w+)['"]\]/g,
    /ENV\.fetch\(['"](\w+)['"]/g,
  ],
  go: [
    /os\.Getenv\("(\w+)"\)/g,
  ],
  rust: [
    /env::var\("(\w+)"\)/g,
    /std::env::var\("(\w+)"\)/g,
  ],
  java: [
    /System\.getenv\("(\w+)"\)/g,
  ],
  php: [
    /\$_ENV\[['"](\w+)['"]\]/g,
    /getenv\(['"](\w+)['"]\)/g,
    /env\(['"](\w+)['"]\)/g,
  ],
  dotenv: [           // .env, .env.* 파일
    /^([A-Z_][A-Z0-9_]*)=/gm,
  ],
  docker: [           // Dockerfile, docker-compose.yml
    /^\s*-?\s*([A-Z_][A-Z0-9_]*)=/gm,
    /^\s*ENV\s+([A-Z_][A-Z0-9_]*)/gm,
  ],
  github_actions: [   // .github/workflows/*.yml
    /\$\{\{\s*secrets\.(\w+)\s*\}\}/g,
  ],
};
```

### 4.3 `apicenter pull`

Provider에서 시크릿을 가져와서 로컬 `.env` 파일 생성.

```bash
# 기본 환경 (dev) 시크릿 가져오기
$ apicenter pull

# 특정 환경
$ apicenter pull --env staging

# 특정 그룹만
$ apicenter pull --group database

# dry run (실제 파일 생성 없이 미리보기)
$ apicenter pull --dry-run

# 기존 로컬 값 우선 (provider 값으로 덮어쓰지 않음)
$ apicenter pull --merge=local-first

# provider 값 우선 (기본값)
$ apicenter pull --merge=remote-first
```

### 4.4 `apicenter push`

로컬의 시크릿을 Provider에 업로드.

```bash
# .env 파일에서 provider로 업로드
$ apicenter push

# scan 결과를 바로 push
$ apicenter scan --push

# 특정 환경으로
$ apicenter push --env production

# 특정 키만
$ apicenter push --keys DB_HOST,DB_PORT

# 확인 없이 (CI/CD용)
$ apicenter push --yes
```

### 4.5 `apicenter diff`

로컬과 Provider 간 차이 비교.

```bash
$ apicenter diff

  Comparing local (.env.local) ↔ remote (dev)

  + REDIS_URL          (remote only)
  - LEGACY_API_KEY     (local only)
  ~ DB_HOST            local: localhost → remote: db.prod.internal
  = OPENAI_API_KEY     (synced)
  
  3 differences found.
```

### 4.6 `apicenter run`

시크릿을 환경변수로 주입하면서 명령어 실행 (파일 생성 없음).

```bash
# .env 파일 생성 없이 시크릿을 환경변수로 주입하여 실행
$ apicenter run -- npm start
$ apicenter run --env staging -- python manage.py runserver
```

### 4.7 `apicenter doctor`

프로젝트 보안 상태 점검.

```bash
$ apicenter doctor

  ✓ .env.local is in .gitignore
  ✓ No secrets detected in git history
  ✗ .env file contains actual secrets (should use .env.example)
  ✗ 2 secrets referenced in code but not in apicenter.yaml
  ⚠ OPENAI_API_KEY hasn't been rotated in 90+ days

  Score: 3/5 — Run `apicenter doctor --fix` for recommendations.
```

---

## 5. 전체 명령어 요약

| 명령어 | 설명 | 핵심 플래그 |
|--------|------|-------------|
| `init` | 프로젝트 초기 설정 | `--provider`, `--template` |
| `scan` | 기존 환경변수 자동 탐지 | `--push`, `--format` |
| `pull` | Provider → 로컬 동기화 | `--env`, `--merge`, `--dry-run` |
| `push` | 로컬 → Provider 업로드 | `--env`, `--keys`, `--yes` |
| `diff` | 로컬 ↔ Provider 차이 비교 | `--env` |
| `run` | 시크릿 주입 후 명령 실행 | `--env` |
| `doctor` | 보안 상태 점검 | `--fix` |
| `provider list` | 설치된 Provider 목록 | — |
| `provider add` | Provider 어댑터 추가 설치 | — |
| `env list` | 설정된 환경 목록 | — |
| `config get/set` | 글로벌 설정 관리 | — |

---

## 6. Provider 어댑터 구현 가이드

새로운 Provider를 추가하려는 커뮤니티 기여자를 위한 구조:

```
packages/
├── core/                          # @apicenter/core
│   ├── src/
│   │   ├── cli/                   # 명령어 핸들러
│   │   ├── engine/                # ConfigParser, SecretResolver 등
│   │   ├── logger/                # SecureLogger (마스킹)
│   │   ├── scanner/               # 소스코드 스캔 엔진
│   │   └── types/                 # 공유 인터페이스
│   └── package.json
│
├── provider-dotenv/               # @apicenter/provider-dotenv (기본 내장)
├── provider-infisical/            # @apicenter/provider-infisical
├── provider-vault/                # @apicenter/provider-vault
├── provider-aws/                  # @apicenter/provider-aws
├── provider-doppler/              # @apicenter/provider-doppler
└── provider-1password/            # @apicenter/provider-1password
```

### Provider 구현 최소 템플릿

```typescript
// packages/provider-example/src/index.ts
import { SecretProvider, AuthConfig, SecretEntry } from '@apicenter/core';

export class ExampleProvider implements SecretProvider {
  name = 'example';
  
  async authenticate(config: AuthConfig): Promise<void> {
    // 인증 로직
  }
  
  async isAuthenticated(): Promise<boolean> {
    return true;
  }
  
  async getSecret(key: string, env?: string): Promise<string> {
    // 개별 시크릿 조회
  }
  
  async listSecrets(env?: string): Promise<SecretEntry[]> {
    // 시크릿 목록 조회
  }
  
  async setSecret(key: string, value: string, env?: string): Promise<void> {
    // 시크릿 저장
  }
  
  async deleteSecret(key: string, env?: string): Promise<void> {
    // 시크릿 삭제
  }
  
  async pullAll(env?: string): Promise<Record<string, string>> {
    // 전체 시크릿 조회
  }
  
  async pushAll(secrets: Record<string, string>, env?: string): Promise<void> {
    // 전체 시크릿 업로드
  }
}
```

---

## 7. 보안 설계

### SecureLogger (Phase 1부터 내장)

```typescript
class SecureLogger {
  private sensitiveValues: Set<string> = new Set();
  
  register(value: string): void {
    if (value.length >= 4) {
      this.sensitiveValues.add(value);
    }
  }
  
  mask(text: string): string {
    let masked = text;
    for (const secret of this.sensitiveValues) {
      masked = masked.replaceAll(secret, '***');
    }
    return masked;
  }
  
  log(level: LogLevel, message: string): void {
    const safe = this.mask(message);
    console[level](safe);
  }
}
```

### 보안 체크리스트 (doctor 명령어에 내장)

- `.env*` 파일이 `.gitignore`에 포함되어 있는지
- git history에 시크릿이 커밋된 적 있는지
- `apicenter.yaml`에 실제 값이 하드코딩되어 있지 않은지
- Provider 인증 토큰이 안전하게 저장되어 있는지
- 시크릿 로테이션 주기 확인

### 인증 정보 저장

```
~/.config/apicenter/
├── config.yaml          # 글로벌 설정
├── credentials/         # provider별 인증 정보 (OS keychain 우선)
│   ├── infisical.enc
│   └── vault.enc
└── cache/               # 오프라인 폴백 (암호화)
    └── secrets.enc
```

- OS Keychain(macOS Keychain, Windows Credential Manager, Linux Secret Service) 우선 사용
- Keychain 불가 시 AES-256 암호화 파일로 폴백
- CI/CD 환경에서는 환경변수(`APICENTER_TOKEN`)로 인증

---

## 8. 개발 로드맵

### Phase 1: Core MVP (2-3주)

**목표: `dotenv` Provider로 기본 워크플로우 완성**

- [ ] 프로젝트 구조 세팅 (monorepo, turborepo/nx)
- [ ] `apicenter.yaml` 스키마 정의 + 파서
- [ ] SecureLogger 구현
- [ ] Provider 인터페이스 정의
- [ ] `dotenv` Provider 구현 (기본 내장)
- [ ] CLI 프레임워크 세팅 (Commander.js 또는 oclif)
- [ ] `init`, `pull`, `push`, `diff` 명령어
- [ ] 기본 테스트 + CI 세팅

**Phase 1 완료 시 가능한 것:**
```bash
apicenter init          # dotenv provider로 초기화
apicenter pull          # .env → .env.local 동기화
apicenter diff          # 차이 확인
```

### Phase 2: Scan + 첫 번째 외부 Provider (2주)

- [ ] `scan` 명령어 + 언어별 패턴 매칭
- [ ] `run` 명령어 (시크릿 주입 실행)
- [ ] Infisical Provider 구현
- [ ] Provider 등록/발견 메커니즘
- [ ] `doctor` 명령어 기본 버전
- [ ] README + 기여 가이드 작성

### Phase 3: 생태계 확장 (3주)

- [ ] HashiCorp Vault Provider
- [ ] AWS Secrets Manager Provider
- [ ] Doppler Provider
- [ ] `apicenter.yaml` JSON Schema 배포 (IDE 자동완성)
- [ ] Provider 개발 문서 + 템플릿
- [ ] npm/brew/scoop 배포 파이프라인

### Phase 4: 고급 기능 (4주)

- [ ] 멀티 Provider 지원 (키별로 다른 백엔드)
- [ ] 시크릿 로테이션 (`rotate` 명령어)
- [ ] MCP Server (Claude Code 연동)
- [ ] GitHub Actions 통합
- [ ] 오프라인 캐시 + 동기화
- [ ] 플러그인 시스템 (커스텀 스캔 패턴, 출력 포맷 등)

---

## 9. 오픈소스 배포 준비

### 저장소 구조

```
apicenter/
├── .github/
│   ├── workflows/           # CI/CD
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── packages/
│   ├── core/
│   ├── cli/
│   ├── provider-dotenv/
│   ├── provider-infisical/
│   └── ...
├── docs/
│   ├── getting-started.md
│   ├── configuration.md
│   ├── providers/
│   │   ├── dotenv.md
│   │   ├── infisical.md
│   │   └── creating-a-provider.md
│   └── security.md
├── examples/
│   ├── nextjs/
│   ├── express/
│   ├── django/
│   └── rails/
├── CONTRIBUTING.md
├── LICENSE                  # MIT
├── README.md
└── turbo.json
```

### README 핵심 메시지 (포지셔닝)

```markdown
# API Center

One CLI to manage secrets across any backend.
Stop copy-pasting .env files. Start syncing secrets.

## Why API Center?

- 🔌 **Any backend**: Infisical, Vault, AWS, Doppler, 1Password, or just .env files
- 🔍 **Auto-detect**: Scan existing projects to find all env vars instantly
- 🔒 **Secure by default**: Secrets never appear in logs, git, or terminal output
- 🚀 **Zero config start**: Works with .env files out of the box, upgrade to a vault when ready
```

### 기술 스택 권장

| 영역 | 선택 | 이유 |
|------|------|------|
| 언어 | TypeScript | npm 생태계, 넓은 기여자 풀 |
| CLI 프레임워크 | oclif | 플러그인 시스템 내장, Salesforce가 유지보수 |
| 모노레포 | Turborepo | 빠른 빌드, Vercel 유지보수 |
| 테스트 | Vitest | 빠르고 TypeScript 네이티브 |
| 배포 | npm + brew + scoop | 3대 OS 커버 |
| 문서 | Docusaurus 또는 VitePress | 검색 가능한 정적 사이트 |

---

## 10. 기존 설계와 달라진 점 요약

| 변경 포인트 | 이유 |
|-------------|------|
| `inject` → `pull` 로 명칭 변경 | git pull처럼 직관적, 업계 관행 |
| Infisical 종속 제거 | 범용성 확보 |
| Provider 플러그인 시스템 | 커뮤니티 기여로 백엔드 확장 |
| `dotenv` Provider 기본 내장 | 외부 서비스 없이도 바로 사용 가능 |
| `scan` 다국어 패턴 | 어떤 언어 프로젝트든 사용 가능 |
| `run` 명령어 추가 | 파일 생성 없이 시크릿 주입 (보안↑) |
| `doctor` 명령어 추가 | 보안 상태 자가 진단 |
| `diff` 명령어 추가 | 동기화 전 변경 사항 확인 |
| 멀티 Provider 지원 | 대규모 프로젝트 대응 |
| 영어 기본 문서화 | 글로벌 커뮤니티 접근성 |
