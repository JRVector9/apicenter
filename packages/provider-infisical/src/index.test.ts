import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InfisicalProvider } from './index.js';

// @infisical/sdk를 모킹
const mockClient = {
  listSecrets: vi.fn(),
  createSecret: vi.fn(),
  updateSecret: vi.fn(),
  deleteSecret: vi.fn(),
};

const MockInfisicalClient = vi.fn(() => mockClient);

vi.mock('@infisical/sdk', () => ({
  InfisicalClient: MockInfisicalClient,
}));

describe('InfisicalProvider', () => {
  let provider: InfisicalProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new InfisicalProvider({
      project_id: 'test-project',
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
    });
  });

  it('name이 infisical이어야 한다', () => {
    expect(provider.name).toBe('infisical');
  });

  it('pullAll이 Infisical 시크릿을 Record로 반환해야 한다', async () => {
    mockClient.listSecrets.mockResolvedValue([
      { secretKey: 'DB_HOST', secretValue: 'localhost' },
      { secretKey: 'API_KEY', secretValue: 'secret123' },
    ]);

    const secrets = await provider.pullAll('dev');
    expect(secrets['DB_HOST']).toBe('localhost');
    expect(secrets['API_KEY']).toBe('secret123');
    expect(mockClient.listSecrets).toHaveBeenCalledWith({
      environment: 'dev',
      projectId: 'test-project',
    });
  });

  it('getSecret이 단건 시크릿을 반환해야 한다', async () => {
    mockClient.listSecrets.mockResolvedValue([
      { secretKey: 'MY_KEY', secretValue: 'my-value' },
    ]);

    const value = await provider.getSecret('MY_KEY', 'dev');
    expect(value).toBe('my-value');
  });

  it('getSecret이 없는 키에 undefined를 반환해야 한다', async () => {
    mockClient.listSecrets.mockResolvedValue([]);
    const value = await provider.getSecret('NONEXISTENT', 'dev');
    expect(value).toBeUndefined();
  });

  it('listSecrets가 SecretEntry 배열을 반환해야 한다', async () => {
    mockClient.listSecrets.mockResolvedValue([
      { secretKey: 'KEY1', secretValue: 'val1' },
      { secretKey: 'KEY2', secretValue: 'val2' },
    ]);

    const entries = await provider.listSecrets('dev');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.key).toBe('KEY1');
    expect(entries[0]?.value).toBe('val1');
  });

  it('pushAll이 새 시크릿을 createSecret으로 저장해야 한다', async () => {
    mockClient.listSecrets.mockResolvedValue([]); // 기존 시크릿 없음
    mockClient.createSecret.mockResolvedValue({});

    await provider.pushAll({ NEW_KEY: 'new-value' }, 'dev');
    expect(mockClient.createSecret).toHaveBeenCalledWith({
      environment: 'dev',
      projectId: 'test-project',
      secretName: 'NEW_KEY',
      secretValue: 'new-value',
    });
  });

  it('pushAll이 기존 시크릿을 updateSecret으로 갱신해야 한다', async () => {
    mockClient.listSecrets.mockResolvedValue([
      { secretKey: 'EXISTING_KEY', secretValue: 'old-value' },
    ]);
    mockClient.updateSecret.mockResolvedValue({});

    await provider.pushAll({ EXISTING_KEY: 'new-value' }, 'dev');
    expect(mockClient.updateSecret).toHaveBeenCalledWith({
      environment: 'dev',
      projectId: 'test-project',
      secretName: 'EXISTING_KEY',
      secretValue: 'new-value',
    });
    expect(mockClient.createSecret).not.toHaveBeenCalled();
  });

  it('setSecret이 pushAll을 호출해야 한다', async () => {
    mockClient.listSecrets.mockResolvedValue([]);
    mockClient.createSecret.mockResolvedValue({});

    await provider.setSecret('TEST_KEY', 'test-val', 'dev');
    expect(mockClient.createSecret).toHaveBeenCalled();
  });

  it('deleteSecret이 SDK deleteSecret을 호출해야 한다', async () => {
    mockClient.deleteSecret.mockResolvedValue({});

    await provider.deleteSecret('DEL_KEY', 'dev');
    expect(mockClient.deleteSecret).toHaveBeenCalledWith({
      environment: 'dev',
      projectId: 'test-project',
      secretName: 'DEL_KEY',
    });
  });

  it('isAuthenticated가 SDK 초기화 성공 시 true를 반환해야 한다', async () => {
    expect(await provider.isAuthenticated()).toBe(true);
  });

  it('client_id/secret 없이 token으로 인증되어야 한다', async () => {
    const tokenProvider = new InfisicalProvider({
      project_id: 'proj',
      token: 'st.my-service-token',
    });
    mockClient.listSecrets.mockResolvedValue([]);
    const result = await tokenProvider.pullAll('dev');
    expect(result).toEqual({});
  });

  it('인증 정보 없이 생성 시 pullAll에서 에러를 던져야 한다', async () => {
    const noAuthProvider = new InfisicalProvider({ project_id: 'proj' });
    await expect(noAuthProvider.pullAll('dev')).rejects.toThrow('인증 설정이 없습니다');
  });

  it('getEnvironments가 환경 목록을 반환해야 한다', async () => {
    const envs = await provider.getEnvironments();
    expect(envs).toContain('dev');
    expect(envs).toContain('prod');
  });
});
