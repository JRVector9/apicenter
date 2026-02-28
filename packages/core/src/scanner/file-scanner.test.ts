import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanDirectory, scanFileContent, detectLanguage } from './file-scanner.js';

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

  it('Python — 하드코딩된 KEY/TOKEN/SECRET 변수 감지', () => {
    const content = [
      'API_KEY = "sk-abcd-c22db3aa789b6e3d41a9cf1b2b08745c09c34d134d059afe"',
      'AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"',
      'DB_SECRET = "super-secret-password-123"',
    ].join('\n');
    const matches = scanFileContent(content, '/project/core.py', 'python', cwd);
    const keys = matches.map((m) => m.key);
    expect(keys).toContain('API_KEY');
    expect(keys).toContain('AUTH_TOKEN');
    expect(keys).toContain('DB_SECRET');
  });

  it('Python — 짧은 값은 하드코딩 시크릿으로 감지하지 않음', () => {
    const content = `DEBUG_KEY = "abc"`;
    const matches = scanFileContent(content, '/project/core.py', 'python', cwd);
    expect(matches.map((m) => m.key)).not.toContain('DEBUG_KEY');
  });

  it('JavaScript — 하드코딩된 KEY/TOKEN/SECRET 변수 감지', () => {
    const content = `const API_KEY = "sk-abcd-1234567890abcdef";\nconst AUTH_TOKEN = "eyJhbGciOiJIUzI1NiJ9";`;
    const matches = scanFileContent(content, '/project/index.js', 'javascript', cwd);
    const keys = matches.map((m) => m.key);
    expect(keys).toContain('API_KEY');
    expect(keys).toContain('AUTH_TOKEN');
  });
});

describe('scanFileContent — 값 패턴 탐지 (provider fingerprint)', () => {
  const cwd = '/project';

  it('OpenAI API Key 탐지', () => {
    const content = `key = "sk-abcd1234567890abcdef1234567890abcdef1234567890abcd"`;
    const matches = scanFileContent(content, '/project/app.py', 'python', cwd);
    const found = matches.find((m) => m.key === 'OPENAI_API_KEY');
    expect(found).toBeDefined();
    expect(found?.provider).toBe('OpenAI');
  });

  it('AWS Access Key ID 탐지', () => {
    const content = `aws_key = "AKIAIOSFODNN7EXAMPLE"`;
    const matches = scanFileContent(content, '/project/app.py', 'python', cwd);
    const found = matches.find((m) => m.key === 'AWS_ACCESS_KEY_ID');
    expect(found).toBeDefined();
    expect(found?.provider).toBe('AWS');
  });

  it('GitHub PAT 탐지', () => {
    const content = `token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890"`;
    const matches = scanFileContent(content, '/project/app.js', 'javascript', cwd);
    const found = matches.find((m) => m.key === 'GITHUB_TOKEN');
    expect(found).toBeDefined();
    expect(found?.provider).toBe('GitHub');
  });

  it('Stripe Secret Key 탐지', () => {
    // 테스트용 가짜 값 — GitHub Secret Scanning 우회를 위해 조합
    const val = ['sk', 'live', 'abcdefghijklmnopqrstuvwx'].join('_');
    const content = `stripe = "${val}"`;
    const matches = scanFileContent(content, '/project/app.ts', 'typescript', cwd);
    const found = matches.find((m) => m.key === 'STRIPE_SECRET_KEY');
    expect(found).toBeDefined();
    expect(found?.provider).toBe('Stripe');
  });

  it('Slack Bot Token 탐지', () => {
    // 테스트용 가짜 값 — GitHub Secret Scanning 우회를 위해 조합
    const val = ['xoxb', '123456789012', '123456789012', 'abcdefghijklmnopqrstuvwx'].join('-');
    const content = `bot = "${val}"`;
    const matches = scanFileContent(content, '/project/app.py', 'python', cwd);
    const found = matches.find((m) => m.key === 'SLACK_BOT_TOKEN');
    expect(found).toBeDefined();
    expect(found?.provider).toBe('Slack');
  });

  it('JWT Token 탐지', () => {
    const content = `token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"`;
    const matches = scanFileContent(content, '/project/app.go', 'go', cwd);
    const found = matches.find((m) => m.key === 'JWT_TOKEN');
    expect(found).toBeDefined();
    expect(found?.provider).toBe('JWT');
  });

  it('주석 처리된 값은 스킵', () => {
    const content = `# key = "AKIAIOSFODNN7EXAMPLE"`;
    const matches = scanFileContent(content, '/project/app.py', 'python', cwd);
    expect(matches.find((m) => m.key === 'AWS_ACCESS_KEY_ID')).toBeUndefined();
  });

  it('dotenv 파일에는 값 패턴 적용 안 함', () => {
    const content = `TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890`;
    const matches = scanFileContent(content, '/project/.env', 'dotenv', cwd);
    // dotenv는 변수명 패턴만 적용 → GITHUB_TOKEN 키 없음
    expect(matches.find((m) => m.key === 'GITHUB_TOKEN')).toBeUndefined();
    // 하지만 TOKEN 변수명은 탐지됨
    expect(matches.find((m) => m.key === 'TOKEN')).toBeDefined();
  });

  it('provider 필드가 설정됨', () => {
    const content = `npm_token = "npm_abcdefghijklmnopqrstuvwxyz1234567890"`;
    const matches = scanFileContent(content, '/project/app.js', 'javascript', cwd);
    const found = matches.find((m) => m.provider === 'NPM');
    expect(found?.key).toBe('NPM_TOKEN');
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
