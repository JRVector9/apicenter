import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@apicenter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apicenter/core')>();
  return {
    ...actual,
    parseConfig: vi.fn(),
    globalRegistry: {
      has: vi.fn(),
      register: vi.fn(),
      resolve: vi.fn(),
    },
    scanDirectory: vi.fn(),
  };
});

vi.mock('@apicenter/provider-dotenv', () => ({
  DotenvProvider: vi.fn(),
}));

describe('MCP tool handlers', () => {
  let mockProvider: {
    pullAll: ReturnType<typeof vi.fn>;
    getSecret: ReturnType<typeof vi.fn>;
    setSecret: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      pullAll: vi.fn(),
      getSecret: vi.fn(),
      setSecret: vi.fn(),
    };
  });

  async function setupMocks(secrets?: Record<string, string>) {
    const { existsSync, readFileSync } = await import('node:fs');
    const { parseConfig, globalRegistry } = await import('@apicenter/core');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('yaml' as any);
    vi.mocked(parseConfig).mockReturnValue({
      version: '1',
      provider: { name: 'dotenv' },
      default_env: 'dev',
    } as any);
    vi.mocked(globalRegistry.has).mockReturnValue(true);
    vi.mocked(globalRegistry.resolve).mockReturnValue(mockProvider as any);
    if (secrets) mockProvider.pullAll.mockResolvedValue(secrets);
  }

  it('list_secrets returns key list without values', async () => {
    await setupMocks({ DB_HOST: 'localhost', API_KEY: 'sk-real-key-xyz' });
    const { buildToolHandlers } = await import('./index.js');
    const handlers = buildToolHandlers('/test');
    const result = await handlers.list_secrets({ env: 'dev' });

    expect(result.content[0].text).toContain('DB_HOST');
    expect(result.content[0].text).toContain('API_KEY');
    expect(result.content[0].text).not.toContain('localhost');
    expect(result.content[0].text).not.toContain('sk-real-key-xyz');
  });

  it('get_secret masks value by default', async () => {
    await setupMocks();
    mockProvider.getSecret.mockResolvedValue('super-secret-value');
    const { buildToolHandlers } = await import('./index.js');
    const handlers = buildToolHandlers('/test');
    const result = await handlers.get_secret({ key: 'API_KEY', env: 'dev', show_value: false });

    expect(result.content[0].text).toContain('API_KEY');
    expect(result.content[0].text).not.toContain('super-secret-value');
  });

  it('get_secret reveals value when show_value is true', async () => {
    await setupMocks();
    mockProvider.getSecret.mockResolvedValue('super-secret-value');
    const { buildToolHandlers } = await import('./index.js');
    const handlers = buildToolHandlers('/test');
    const result = await handlers.get_secret({ key: 'API_KEY', env: 'dev', show_value: true });

    expect(result.content[0].text).toContain('super-secret-value');
  });

  it('set_secret calls provider.setSecret', async () => {
    await setupMocks();
    mockProvider.setSecret.mockResolvedValue(undefined);
    const { buildToolHandlers } = await import('./index.js');
    const handlers = buildToolHandlers('/test');
    await handlers.set_secret({ key: 'NEW_KEY', value: 'new-val', env: 'dev' });

    expect(mockProvider.setSecret).toHaveBeenCalledWith('NEW_KEY', 'new-val', 'dev');
  });

  it('scan_project returns unique keys', async () => {
    const { scanDirectory } = await import('@apicenter/core');
    vi.mocked(scanDirectory).mockResolvedValue({
      matches: [],
      uniqueKeys: ['DB_HOST', 'API_KEY', 'REDIS_URL'],
      fileCount: 5,
    });
    const { buildToolHandlers } = await import('./index.js');
    const handlers = buildToolHandlers('/test');
    const result = await handlers.scan_project({});

    expect(result.content[0].text).toContain('DB_HOST');
    expect(result.content[0].text).toContain('3 unique');
  });
});
