import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AwsProvider } from './index.js';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

vi.mock('@aws-sdk/client-secrets-manager', async () => {
  const actual = await vi.importActual('@aws-sdk/client-secrets-manager');
  return {
    ...actual,
    SecretsManagerClient: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
  };
});

function makeProvider(overrides: Partial<ConstructorParameters<typeof AwsProvider>[0]> = {}) {
  return new AwsProvider({ region: 'ap-northeast-2', ...overrides });
}

function getMockSend(provider: AwsProvider): ReturnType<typeof vi.fn> {
  // Access the internal client's send mock
  return (provider as any).client.send as ReturnType<typeof vi.fn>;
}

describe('AwsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when region is missing', () => {
    expect(() => new AwsProvider({ region: '' })).toThrow('config.region is required');
  });

  it('name is aws', () => {
    expect(makeProvider().name).toBe('aws');
  });

  it('isAuthenticated returns true on success', async () => {
    const p = makeProvider();
    getMockSend(p).mockResolvedValueOnce({ SecretList: [] });
    expect(await p.isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false on error', async () => {
    const p = makeProvider();
    getMockSend(p).mockRejectedValueOnce(new Error('no creds'));
    expect(await p.isAuthenticated()).toBe(false);
  });

  it('pullAll (bundle) returns parsed JSON from secret', async () => {
    const p = makeProvider({ prefix: 'myapp/' });
    getMockSend(p).mockResolvedValueOnce({
      SecretString: JSON.stringify({ DB_HOST: 'localhost', API_KEY: 'secret' }),
    });
    const result = await p.pullAll('dev');
    expect(result).toEqual({ DB_HOST: 'localhost', API_KEY: 'secret' });
  });

  it('pullAll (bundle) returns {} when secret not found', async () => {
    const p = makeProvider();
    getMockSend(p).mockRejectedValueOnce({ name: 'ResourceNotFoundException' });
    expect(await p.pullAll('dev')).toEqual({});
  });

  it('pushAll (bundle) calls PutSecretValue for existing secret', async () => {
    const p = makeProvider({ prefix: 'app/' });
    // First call: pullAll to read existing
    getMockSend(p)
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ EXISTING: 'old' }) })
      // Second call: PutSecretValue
      .mockResolvedValueOnce({});
    await p.pushAll({ NEW_KEY: 'new_val' }, 'dev');
    const calls = getMockSend(p).mock.calls;
    // Second call should be PutSecretValueCommand with merged secrets
    const putCall = calls[1][0];
    const parsed = JSON.parse(putCall.input.SecretString);
    expect(parsed).toMatchObject({ EXISTING: 'old', NEW_KEY: 'new_val' });
  });

  it('pushAll (bundle) calls CreateSecret when secret does not exist', async () => {
    const p = makeProvider();
    getMockSend(p)
      .mockRejectedValueOnce({ name: 'ResourceNotFoundException' }) // pullAll returns {}
      .mockRejectedValueOnce({ name: 'ResourceNotFoundException' }) // PutSecretValue fails
      .mockResolvedValueOnce({}); // CreateSecret succeeds
    await p.pushAll({ KEY: 'val' }, 'dev');
    expect(getMockSend(p)).toHaveBeenCalledTimes(3);
  });

  it('getSecret returns single value from bundle', async () => {
    const p = makeProvider();
    getMockSend(p).mockResolvedValueOnce({
      SecretString: JSON.stringify({ TARGET: 'found' }),
    });
    expect(await p.getSecret('TARGET', 'dev')).toBe('found');
  });

  it('getSecret returns undefined for missing key', async () => {
    const p = makeProvider();
    getMockSend(p).mockResolvedValueOnce({ SecretString: JSON.stringify({ OTHER: 'x' }) });
    expect(await p.getSecret('MISSING', 'dev')).toBeUndefined();
  });

  it('listSecrets returns SecretEntry array', async () => {
    const p = makeProvider();
    getMockSend(p).mockResolvedValueOnce({
      SecretString: JSON.stringify({ A: '1', B: '2' }),
    });
    const entries = await p.listSecrets('dev');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ key: 'A', value: '1' });
  });

  it('deleteSecret removes key from bundle', async () => {
    const p = makeProvider();
    getMockSend(p)
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ DEL: 'x', KEEP: 'y' }) })
      .mockResolvedValueOnce({});
    await p.deleteSecret('DEL', 'dev');
    const putCall = getMockSend(p).mock.calls[1][0];
    const stored = JSON.parse(putCall.input.SecretString);
    expect(stored).toEqual({ KEEP: 'y' });
    expect(stored['DEL']).toBeUndefined();
  });
});
