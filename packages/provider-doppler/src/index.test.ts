import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DopplerProvider } from './index.js';

function makeFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

function makeProvider(overrides: Partial<ConstructorParameters<typeof DopplerProvider>[0]> = {}) {
  const p = new DopplerProvider({ project: 'my-project', token: 'dp.st.test', ...overrides });
  return p;
}

describe('DopplerProvider', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws when project is missing', () => {
    expect(() => new DopplerProvider({ project: '' })).toThrow('config.project is required');
  });

  it('name is doppler', () => {
    expect(makeProvider().name).toBe('doppler');
  });

  it('isAuthenticated returns true when /me returns ok', async () => {
    const p = makeProvider();
    p._setFetch(makeFetch(200, { workplace: {} }));
    expect(await p.isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false on error', async () => {
    const p = makeProvider();
    p._setFetch(vi.fn().mockRejectedValue(new Error('network error')));
    expect(await p.isAuthenticated()).toBe(false);
  });

  it('pullAll fetches and maps secrets correctly', async () => {
    const p = makeProvider();
    p._setFetch(makeFetch(200, {
      secrets: {
        DB_HOST: { raw: 'localhost', computed: 'localhost' },
        API_KEY: { raw: 'secret', computed: 'secret' },
      },
    }));
    const result = await p.pullAll('dev');
    expect(result).toEqual({ DB_HOST: 'localhost', API_KEY: 'secret' });
  });

  it('pullAll uses env param as Doppler config name', async () => {
    const p = makeProvider();
    const fetchMock = makeFetch(200, { secrets: {} });
    p._setFetch(fetchMock);
    await p.pullAll('staging');
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('config=staging');
  });

  it('pullAll uses default config when env not specified', async () => {
    const p = makeProvider({ config: 'production' });
    const fetchMock = makeFetch(200, { secrets: {} });
    p._setFetch(fetchMock);
    await p.pullAll();
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('config=production');
  });

  it('pullAll throws on non-ok response', async () => {
    const p = makeProvider();
    p._setFetch(makeFetch(401, { error: 'Unauthorized' }));
    await expect(p.pullAll('dev')).rejects.toThrow('pullAll failed (401)');
  });

  it('pushAll sends correct payload', async () => {
    const p = makeProvider();
    const fetchMock = makeFetch(200, { secrets: {} });
    p._setFetch(fetchMock);
    await p.pushAll({ NEW_KEY: 'new_val' }, 'dev');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.secrets.NEW_KEY.value).toBe('new_val');
  });

  it('pushAll throws on non-ok response', async () => {
    const p = makeProvider();
    p._setFetch(makeFetch(400, { error: 'bad request' }));
    await expect(p.pushAll({ K: 'v' }, 'dev')).rejects.toThrow('pushAll failed (400)');
  });

  it('getSecret returns single value', async () => {
    const p = makeProvider();
    p._setFetch(makeFetch(200, { secret: { raw: 'val', computed: 'val' } }));
    expect(await p.getSecret('MY_KEY', 'dev')).toBe('val');
  });

  it('getSecret returns undefined on 404', async () => {
    const p = makeProvider();
    p._setFetch(makeFetch(404, {}));
    expect(await p.getSecret('MISSING', 'dev')).toBeUndefined();
  });

  it('listSecrets returns SecretEntry array', async () => {
    const p = makeProvider();
    p._setFetch(makeFetch(200, {
      secrets: { A: { computed: '1', raw: '1' }, B: { computed: '2', raw: '2' } },
    }));
    const entries = await p.listSecrets('dev');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ key: 'A', value: '1' });
  });

  it('deleteSecret sends DELETE request', async () => {
    const p = makeProvider();
    const fetchMock = makeFetch(200, {});
    p._setFetch(fetchMock);
    await p.deleteSecret('OLD_KEY', 'dev');
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('DELETE');
  });

  it('throws when token is missing', async () => {
    const p = new DopplerProvider({ project: 'proj' });
    await expect(p.pullAll()).rejects.toThrow('No token provided');
  });
});
