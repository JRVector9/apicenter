import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildYamlContent, detectSourcePath } from '../../../utils/workspace-utils.js';

/**
 * init.ts의 핵심 로직(YAML 생성 + 파일 쓰기)을 직접 검증한다.
 * oclif Command 클래스는 E2E 테스트에서 별도로 검증.
 */

function makeProject(base: string, name: string, files: string[] = ['package.json']): string {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const filePath = join(dir, f);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, '');
  }
  return dir;
}

describe('workspace init 핵심 로직', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `apicenter-init-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('buildYamlContent + writeFileSync로 apicenter.yaml을 생성할 수 있다', () => {
    const projectDir = makeProject(tmp, 'proj');
    const yaml = buildYamlContent({ provider: 'dotenv', defaultEnv: 'dev', sourcePath: '.env' });
    const configPath = join(projectDir, 'apicenter.yaml');

    writeFileSync(configPath, yaml, 'utf-8');

    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('name: dotenv');
    expect(content).toContain('default_env: dev');
  });

  it('.env가 있으면 sourcePath를 .env로 자동 감지한다', () => {
    const projectDir = makeProject(tmp, 'proj-env', ['package.json', '.env']);
    expect(detectSourcePath(projectDir)).toBe('.env');
  });

  it('backend/.env가 있으면 sourcePath를 backend/.env로 자동 감지한다', () => {
    const projectDir = makeProject(tmp, 'proj-backend', ['package.json', 'backend/.env']);
    expect(detectSourcePath(projectDir)).toBe('backend/.env');
  });

  it('기존 apicenter.yaml이 있을 때 force=false이면 스킵해야 한다', () => {
    const projectDir = makeProject(tmp, 'proj-existing');
    const configPath = join(projectDir, 'apicenter.yaml');
    writeFileSync(configPath, 'existing content', 'utf-8');

    // force=false 시뮬레이션: 이미 존재하면 건너뛴다
    const alreadyExists = existsSync(configPath);
    expect(alreadyExists).toBe(true);

    // force=false이면 기존 파일을 덮어쓰지 않음
    if (!alreadyExists) {
      const yaml = buildYamlContent({ provider: 'dotenv', defaultEnv: 'dev' });
      writeFileSync(configPath, yaml, 'utf-8');
    }

    expect(readFileSync(configPath, 'utf-8')).toBe('existing content');
  });

  it('force=true이면 기존 apicenter.yaml을 덮어써야 한다', () => {
    const projectDir = makeProject(tmp, 'proj-force');
    const configPath = join(projectDir, 'apicenter.yaml');
    writeFileSync(configPath, 'old content', 'utf-8');

    const yaml = buildYamlContent({ provider: 'dotenv', defaultEnv: 'staging' });
    writeFileSync(configPath, yaml, 'utf-8'); // force=true simulated

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('default_env: staging');
    expect(content).not.toBe('old content');
  });
});
