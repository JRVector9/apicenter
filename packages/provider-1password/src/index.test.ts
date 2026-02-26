import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnePasswordProvider } from './index.js';

vi.mock('@1password/sdk', () => ({
  createClient: vi.fn(),
}));

describe('OnePasswordProvider', () => {
  let provider: OnePasswordProvider;
  let mockClient: {
    vaults: { listAll: ReturnType<typeof vi.fn> };
    items: {
      listAll: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      vaults: { listAll: vi.fn() },
      items: {
        listAll: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        put: vi.fn(),
      },
    };

    provider = new OnePasswordProvider({
      service_account_token: 'test-token',
      vault: 'TestVault',
    });
    provider._setClient(mockClient as any);
  });

  it('should return name as "1password"', () => {
    expect(provider.name).toBe('1password');
  });

  it('isAuthenticated returns true when client is set', async () => {
    expect(await provider.isAuthenticated()).toBe(true);
  });

  it('pullAll returns empty object when vault not found', async () => {
    async function* emptyVaults() {}
    mockClient.vaults.listAll.mockReturnValue(emptyVaults());

    const result = await provider.pullAll('dev');
    expect(result).toEqual({});
  });

  it('pullAll returns empty object when item not found', async () => {
    async function* mockVaults() { yield { id: 'vault-1', name: 'TestVault' }; }
    async function* emptyItems() {}
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(emptyItems());

    const result = await provider.pullAll('dev');
    expect(result).toEqual({});
  });

  it('pullAll returns key-value map from item fields', async () => {
    async function* mockVaults() { yield { id: 'vault-1', name: 'TestVault' }; }
    async function* mockItems() { yield { id: 'item-1', title: 'dev' }; }

    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({
      id: 'item-1',
      title: 'dev',
      fields: [
        { label: 'DB_HOST', value: 'localhost' },
        { label: 'DB_PORT', value: '5432' },
        { label: '', value: 'ignored' },
        { label: 'EMPTY', value: '' },
      ],
    });

    const result = await provider.pullAll('dev');
    expect(result).toEqual({ DB_HOST: 'localhost', DB_PORT: '5432' });
  });

  it('getSecret returns value for a specific key', async () => {
    async function* mockVaults() { yield { id: 'vault-1', name: 'TestVault' }; }
    async function* mockItems() { yield { id: 'item-1', title: 'dev' }; }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({
      fields: [{ label: 'API_KEY', value: 'secret123' }],
    });

    expect(await provider.getSecret('API_KEY', 'dev')).toBe('secret123');
  });

  it('getSecret returns undefined when key not found', async () => {
    async function* mockVaults() { yield { id: 'vault-1', name: 'TestVault' }; }
    async function* mockItems() { yield { id: 'item-1', title: 'dev' }; }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({ fields: [] });

    expect(await provider.getSecret('MISSING', 'dev')).toBeUndefined();
  });

  it('listSecrets returns SecretEntry array', async () => {
    async function* mockVaults() { yield { id: 'vault-1', name: 'TestVault' }; }
    async function* mockItems() { yield { id: 'item-1', title: 'staging' }; }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({
      fields: [{ label: 'REDIS_URL', value: 'redis://localhost' }],
    });

    const entries = await provider.listSecrets('staging');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: 'REDIS_URL', value: 'redis://localhost', env: 'staging' });
  });

  it('pushAll creates new item when none exists', async () => {
    async function* mockVaults() { yield { id: 'vault-1', name: 'TestVault' }; }
    async function* emptyItems() {}
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(emptyItems());
    mockClient.items.create.mockResolvedValue({ id: 'new-item' });

    await provider.pushAll({ DB_HOST: 'localhost', DB_PORT: '5432' }, 'dev');
    expect(mockClient.items.create).toHaveBeenCalledOnce();
    const createArg = mockClient.items.create.mock.calls[0][0];
    expect(createArg.title).toBe('dev');
    expect(createArg.vaultId).toBe('vault-1');
    const labels = createArg.fields.map((f: any) => f.label);
    expect(labels).toContain('DB_HOST');
    expect(labels).toContain('DB_PORT');
  });

  it('pushAll updates existing item when found', async () => {
    async function* mockVaults() { yield { id: 'vault-1', name: 'TestVault' }; }
    async function* mockItems() { yield { id: 'item-existing', title: 'dev' }; }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.put.mockResolvedValue({ id: 'item-existing' });

    await provider.pushAll({ NEW_KEY: 'new-value' }, 'dev');
    expect(mockClient.items.put).toHaveBeenCalledOnce();
    expect(mockClient.items.create).not.toHaveBeenCalled();
  });

  it('setSecret delegates to pushAll with merged secrets', async () => {
    const pullAllSpy = vi.spyOn(provider, 'pullAll').mockResolvedValue({ EXISTING: 'val' });
    const pushAllSpy = vi.spyOn(provider, 'pushAll').mockResolvedValue(undefined);

    await provider.setSecret('NEW_KEY', 'new-val', 'dev');
    expect(pushAllSpy).toHaveBeenCalledWith({ EXISTING: 'val', NEW_KEY: 'new-val' }, 'dev');
  });

  it('deleteSecret removes key and pushes remaining', async () => {
    vi.spyOn(provider, 'pullAll').mockResolvedValue({ KEY_A: 'a', KEY_B: 'b' });
    const pushAllSpy = vi.spyOn(provider, 'pushAll').mockResolvedValue(undefined);

    await provider.deleteSecret('KEY_A', 'dev');
    expect(pushAllSpy).toHaveBeenCalledWith({ KEY_B: 'b' }, 'dev');
  });

  it('uses item_prefix when configured', async () => {
    const prefixedProvider = new OnePasswordProvider({
      service_account_token: 'tok',
      vault: 'TestVault',
      item_prefix: 'myapp',
    });
    prefixedProvider._setClient(mockClient as any);

    async function* mockVaults() { yield { id: 'v1', name: 'TestVault' }; }
    async function* mockItems() { yield { id: 'i1', title: 'myapp/dev' }; }
    mockClient.vaults.listAll.mockReturnValue(mockVaults());
    mockClient.items.listAll.mockReturnValue(mockItems());
    mockClient.items.get.mockResolvedValue({ fields: [{ label: 'K', value: 'V' }] });

    const result = await prefixedProvider.pullAll('dev');
    expect(result).toEqual({ K: 'V' });
  });
});
