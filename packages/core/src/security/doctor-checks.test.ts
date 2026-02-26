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

  it('.gitignore에 경로가 있으면 passed: true', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env.local\n');
    const result = checkOutputPathInGitignore(tmpDir, '.env.local');
    expect(result.passed).toBe(true);
  });

  it('.gitignore에 경로가 없으면 passed: false', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n');
    const result = checkOutputPathInGitignore(tmpDir, '.env.local');
    expect(result.passed).toBe(false);
    expect(result.fix).toBeDefined();
  });

  it('.gitignore가 없으면 passed: false', () => {
    const result = checkOutputPathInGitignore(tmpDir, '.env.local');
    expect(result.passed).toBe(false);
  });

  it('*.env 패턴으로도 통과', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '*.env\n');
    const result = checkOutputPathInGitignore(tmpDir, 'test.env');
    expect(result.passed).toBe(true);
  });
});

describe('checkDotenvInGitignore', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('.env가 .gitignore에 있으면 passed: true', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env\n');
    expect(checkDotenvInGitignore(tmpDir).passed).toBe(true);
  });

  it('.env*가 .gitignore에 있으면 passed: true', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env*\n');
    expect(checkDotenvInGitignore(tmpDir).passed).toBe(true);
  });

  it('.env가 없으면 passed: false', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'dist/\n');
    expect(checkDotenvInGitignore(tmpDir).passed).toBe(false);
  });
});

describe('checkNoHardcodedSecrets', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('짧은 값은 통과', () => {
    writeFileSync(
      join(tmpDir, 'apicenter.yaml'),
      'version: "1"\nprovider:\n  name: dotenv\n  config:\n    path: .env\n',
    );
    expect(checkNoHardcodedSecrets(tmpDir).passed).toBe(true);
  });

  it('apicenter.yaml이 없으면 통과 (검사 스킵)', () => {
    expect(checkNoHardcodedSecrets(tmpDir).passed).toBe(true);
  });
});

describe('runAllDoctorChecks', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('3개의 결과를 반환해야 한다', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env\n.env.local\n');
    const results = runAllDoctorChecks(tmpDir, '.env.local');
    expect(results).toHaveLength(3);
  });

  it('모든 통과 시 all passed: true', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.env\n.env.local\n');
    writeFileSync(
      join(tmpDir, 'apicenter.yaml'),
      'version: "1"\nprovider:\n  name: dotenv\n  config:\n    path: .env\n',
    );
    const results = runAllDoctorChecks(tmpDir, '.env.local');
    expect(results.every((r) => r.passed)).toBe(true);
  });
});
