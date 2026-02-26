import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecretCache } from './index.js';

describe('SecretCache', () => {
  let cacheDir: string;
  let cache: SecretCache;

  beforeEach(() => {
    cacheDir = join(tmpdir(), `apicenter-cache-test-${Date.now()}-${Math.random()}`);
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
    cache.save('test', 'dev', { SECRET_KEY: 'super-secret-value' });
    const raw = readFileSync(join(cacheDir, 'test-dev.enc'));
    expect(raw.toString()).not.toContain('super-secret-value');
  });

  it('clear removes specific cache file', () => {
    cache.save('doppler', 'dev', { KEY: 'val' });
    cache.clear('doppler', 'dev');
    expect(cache.load('doppler', 'dev')).toBeNull();
  });

  it('clearAll removes all cache files', () => {
    cache.save('a', 'dev', { K: 'v' });
    cache.save('b', 'dev', { K: 'v' });
    cache.clearAll();
    expect(cache.load('a', 'dev')).toBeNull();
    expect(cache.load('b', 'dev')).toBeNull();
  });

  it('returns null for corrupted cache', () => {
    writeFileSync(join(cacheDir, 'bad-dev.enc'), Buffer.from('corrupted data'));
    expect(cache.load('bad', 'dev')).toBeNull();
  });
});
