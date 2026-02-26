import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findProjectDirectories, detectSourcePath, buildYamlContent } from '../../../utils/workspace-utils.js';

function makeDir(base: string, ...parts: string[]): string {
  const p = join(base, ...parts);
  mkdirSync(p, { recursive: true });
  return p;
}

describe('findProjectDirectories', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdirSync(join(tmpdir(), `apicenter-test-${Date.now()}`), { recursive: true }) as unknown as string
      ?? join(tmpdir(), `apicenter-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('package.json이 있는 디렉토리를 프로젝트로 인식한다', () => {
    const projA = makeDir(tmp, 'projectA');
    writeFileSync(join(projA, 'package.json'), '{}');

    const found = findProjectDirectories(tmp);
    expect(found).toContain(projA);
  });

  it('requirements.txt가 있는 디렉토리를 프로젝트로 인식한다', () => {
    const projB = makeDir(tmp, 'projectB');
    writeFileSync(join(projB, 'requirements.txt'), '');

    const found = findProjectDirectories(tmp);
    expect(found).toContain(projB);
  });

  it('마커가 없는 디렉토리는 포함하지 않는다', () => {
    const emptyDir = makeDir(tmp, 'emptyDir');
    const found = findProjectDirectories(tmp);
    expect(found).not.toContain(emptyDir);
  });

  it('node_modules 안을 탐색하지 않는다', () => {
    const proj = makeDir(tmp, 'proj');
    writeFileSync(join(proj, 'package.json'), '{}');
    const inner = makeDir(tmp, 'node_modules', 'inner');
    writeFileSync(join(inner, 'package.json'), '{}');

    const found = findProjectDirectories(tmp);
    expect(found).toContain(proj);
    expect(found).not.toContain(inner);
  });

  it('프로젝트 내부에 중첩된 서브 프로젝트는 탐색하지 않는다', () => {
    const parent = makeDir(tmp, 'parent');
    writeFileSync(join(parent, 'package.json'), '{}');
    const child = makeDir(tmp, 'parent', 'child');
    writeFileSync(join(child, 'package.json'), '{}');

    const found = findProjectDirectories(tmp);
    expect(found).toContain(parent);
    expect(found).not.toContain(child); // nesting prevented
  });

  it('maxDepth 초과 디렉토리는 탐색하지 않는다', () => {
    const deep = makeDir(tmp, 'a', 'b', 'c');
    writeFileSync(join(deep, 'package.json'), '{}');

    const found = findProjectDirectories(tmp, 2);
    expect(found).not.toContain(deep);
  });

  it('여러 프로젝트를 동시에 반환한다', () => {
    const a = makeDir(tmp, 'alpha');
    writeFileSync(join(a, 'package.json'), '{}');
    const b = makeDir(tmp, 'beta');
    writeFileSync(join(b, 'go.mod'), '');

    const found = findProjectDirectories(tmp);
    expect(found).toContain(a);
    expect(found).toContain(b);
  });
});

describe('detectSourcePath', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `apicenter-detect-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('.env가 있으면 .env를 반환한다', () => {
    writeFileSync(join(tmp, '.env'), '');
    expect(detectSourcePath(tmp)).toBe('.env');
  });

  it('.env가 없고 backend/.env가 있으면 backend/.env를 반환한다', () => {
    mkdirSync(join(tmp, 'backend'), { recursive: true });
    writeFileSync(join(tmp, 'backend', '.env'), '');
    expect(detectSourcePath(tmp)).toBe('backend/.env');
  });

  it('아무것도 없으면 기본값 .env를 반환한다', () => {
    expect(detectSourcePath(tmp)).toBe('.env');
  });
});

describe('buildYamlContent', () => {
  it('provider 이름과 defaultEnv가 포함된 YAML을 생성한다', () => {
    const yaml = buildYamlContent({ provider: 'dotenv', defaultEnv: 'dev' });
    expect(yaml).toContain('name: dotenv');
    expect(yaml).toContain('default_env: dev');
  });

  it('sourcePath가 포함된다', () => {
    const yaml = buildYamlContent({ provider: 'dotenv', defaultEnv: 'dev', sourcePath: 'backend/.env' });
    expect(yaml).toContain('backend/.env');
  });
});
