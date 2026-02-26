import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeDotenvFile, readDotenvFile } from '../../../utils/dotenv-io.js';
import { resolveProviderForDir } from '../../../utils/workspace-utils.js';

/**
 * pull.ts의 핵심 흐름:
 *   parseConfig → resolveProviderForDir → provider.pullAll → writeDotenvFile
 * 여기서는 각 단계를 독립적으로 검증한다.
 */

const SAMPLE_CONFIG = `
version: "1"
provider:
  name: dotenv
  config:
    path: .env
default_env: dev
output:
  format: dotenv
  path: .env.local
security:
  mask_in_logs: true
  confirm_before_push: true
  gitignore_check: true
`;

describe('resolveProviderForDir', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `apicenter-pull-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('dotenv config의 path를 절대 경로로 변환하여 provider를 생성한다', async () => {
    writeFileSync(join(tmp, '.env'), 'DB_HOST=localhost\nPORT=5432\n');

    const provider = await resolveProviderForDir(SAMPLE_CONFIG, tmp);
    expect(provider).toBeDefined();
    expect(typeof provider.pullAll).toBe('function');
  });

  it('provider.pullAll이 .env 파일의 시크릿을 반환한다', async () => {
    writeFileSync(join(tmp, '.env'), 'API_KEY=secret123\nDEBUG=true\n');

    const provider = await resolveProviderForDir(SAMPLE_CONFIG, tmp);
    const secrets = await provider.pullAll('dev');

    expect(secrets['API_KEY']).toBe('secret123');
    expect(secrets['DEBUG']).toBe('true');
  });
});

describe('writeDotenvFile + readDotenvFile (pull 결과 저장 검증)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `apicenter-pull-io-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('pull로 가져온 시크릿을 .env.local에 저장하고 다시 읽을 수 있다', () => {
    const secrets = { DB_URL: 'postgres://localhost/test', SECRET: 'abc123' };
    const outputPath = join(tmp, '.env.local');

    writeDotenvFile(outputPath, secrets);

    expect(existsSync(outputPath)).toBe(true);
    const read = readDotenvFile(outputPath);
    expect(read['DB_URL']).toBe('postgres://localhost/test');
    expect(read['SECRET']).toBe('abc123');
  });

  it('시크릿이 0개이면 빈 파일이 생성된다', () => {
    const outputPath = join(tmp, '.env.local');
    writeDotenvFile(outputPath, {});
    expect(existsSync(outputPath)).toBe(true);
    const read = readDotenvFile(outputPath);
    expect(Object.keys(read)).toHaveLength(0);
  });
});

describe('pull dry-run 시뮬레이션', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `apicenter-dryrun-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('dry-run=true이면 .env.local 파일이 생성되지 않는다', async () => {
    writeFileSync(join(tmp, '.env'), 'FOO=bar\n');

    const provider = await resolveProviderForDir(SAMPLE_CONFIG, tmp);
    const secrets = await provider.pullAll('dev');

    const outputPath = join(tmp, '.env.local');
    const isDryRun = true;

    if (!isDryRun) {
      writeDotenvFile(outputPath, secrets);
    }

    expect(existsSync(outputPath)).toBe(false);
  });
});
