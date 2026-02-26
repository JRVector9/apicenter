import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlobalConfig } from './index.js';

describe('GlobalConfig', () => {
  let testDir: string;
  let cfg: GlobalConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `apicenter-test-${Date.now()}-${Math.random()}`);
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
