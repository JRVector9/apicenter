import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultProvider } from './index.js';

const mockRead = vi.fn();
const mockWrite = vi.fn();
const mockTokenLookupSelf = vi.fn();

vi.mock('node-vault', () => ({
  default: vi.fn(() => ({
    read: mockRead,
    write: mockWrite,
    tokenLookupSelf: mockTokenLookupSelf,
  })),
}));

const makeProvider = (overrides: Record<string, unknown> = {}) =>
  new VaultProvider({
    address: 'https://vault.example.com',
    token: 'test-token',
    mount: 'secret',
    ...overrides,
  } as ConstructorParameters<typeof VaultProvider>[0]);

describe('VaultProvider', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws if address is missing', () => {
    expect(() => new VaultProvider({ address: '' })).toThrow(
      'config.address is required',
    );
  });

  it('name is vault', () => {
    expect(makeProvider().name).toBe('vault');
  });

  it('isAuthenticated returns true on success', async () => {
    mockTokenLookupSelf.mockResolvedValueOnce({ data: { id: 'tok' } });
    expect(await makeProvider().isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false on error', async () => {
    mockTokenLookupSelf.mockRejectedValueOnce(new Error('denied'));
    expect(await makeProvider().isAuthenticated()).toBe(false);
  });

  it('pullAll reads from correct KV v2 path with prefix', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { DB_HOST: 'localhost' } } });
    const p = makeProvider({ path_prefix: 'myapp' });
    const result = await p.pullAll('dev');
    expect(mockRead).toHaveBeenCalledWith('secret/data/myapp/dev');
    expect(result).toEqual({ DB_HOST: 'localhost' });
  });

  it('pullAll returns {} on 404', async () => {
    mockRead.mockRejectedValueOnce(new Error('Status 404'));
    expect(await makeProvider().pullAll('dev')).toEqual({});
  });

  it('pullAll uses path without prefix when not set', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: {} } });
    await makeProvider().pullAll('staging');
    expect(mockRead).toHaveBeenCalledWith('secret/data/staging');
  });

  it('pullAll throws wrapped error on non-404 failure', async () => {
    mockRead.mockRejectedValueOnce(new Error('connection refused'));
    await expect(makeProvider().pullAll('dev')).rejects.toThrow(
      'Failed to pull secrets',
    );
  });

  it('pushAll writes to correct KV v2 path', async () => {
    mockWrite.mockResolvedValueOnce({});
    const p = makeProvider({ path_prefix: 'myapp' });
    await p.pushAll({ API_KEY: 'abc' }, 'prod');
    expect(mockWrite).toHaveBeenCalledWith('secret/data/myapp/prod', {
      data: { API_KEY: 'abc' },
    });
  });

  it('pushAll throws on write failure', async () => {
    mockWrite.mockRejectedValueOnce(new Error('forbidden'));
    await expect(makeProvider().pushAll({ K: 'v' }, 'dev')).rejects.toThrow(
      'Failed to push secrets',
    );
  });

  it('getSecret returns single value', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { DB_PASS: 'secret' } } });
    expect(await makeProvider().getSecret('DB_PASS', 'dev')).toBe('secret');
  });

  it('getSecret throws when key missing', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { OTHER: 'val' } } });
    await expect(makeProvider().getSecret('MISSING', 'dev')).rejects.toThrow(
      'Key "MISSING" not found',
    );
  });

  it('listSecrets returns SecretEntry array', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { A: '1', B: '2' } } });
    const entries = await makeProvider().listSecrets('dev');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ key: 'A', value: '1', env: 'dev' });
  });

  it('setSecret merges into existing secrets', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { EXISTING: 'old' } } });
    mockWrite.mockResolvedValueOnce({});
    await makeProvider().setSecret('NEW', 'new_val', 'dev');
    expect(mockWrite).toHaveBeenCalledWith(expect.any(String), {
      data: { EXISTING: 'old', NEW: 'new_val' },
    });
  });

  it('deleteSecret removes key', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { DEL: 'x', KEEP: 'y' } } });
    mockWrite.mockResolvedValueOnce({});
    await makeProvider().deleteSecret('DEL', 'dev');
    expect(mockWrite).toHaveBeenCalledWith(expect.any(String), {
      data: { KEEP: 'y' },
    });
  });

  it('deleteSecret throws for non-existent key', async () => {
    mockRead.mockResolvedValueOnce({ data: { data: { KEEP: 'y' } } });
    await expect(makeProvider().deleteSecret('GHOST', 'dev')).rejects.toThrow(
      'Key "GHOST" not found',
    );
  });
});
