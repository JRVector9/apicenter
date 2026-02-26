import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { DotenvProvider } from './index.js';

const TEST_ENV_PATH = '/tmp/apicenter-test.env';

describe('DotenvProvider', () => {
  let provider: DotenvProvider;

  beforeEach(() => {
    provider = new DotenvProvider({ path: TEST_ENV_PATH });
    writeFileSync(
      TEST_ENV_PATH,
      'DB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=secret123\n',
    );
  });

  afterEach(() => {
    if (existsSync(TEST_ENV_PATH)) unlinkSync(TEST_ENV_PATH);
  });

  it('name이 dotenv여야 한다', () => {
    expect(provider.name).toBe('dotenv');
  });

  it('항상 인증된 상태여야 한다 (.env는 인증 불필요)', async () => {
    expect(await provider.isAuthenticated()).toBe(true);
  });

  it('pullAll로 모든 시크릿을 가져와야 한다', async () => {
    const secrets = await provider.pullAll();
    expect(secrets['DB_HOST']).toBe('localhost');
    expect(secrets['DB_PORT']).toBe('5432');
    expect(secrets['API_KEY']).toBe('secret123');
  });

  it('getSecret으로 단건 시크릿을 가져와야 한다', async () => {
    expect(await provider.getSecret('DB_HOST')).toBe('localhost');
    expect(await provider.getSecret('NONEXISTENT')).toBeUndefined();
  });

  it('listSecrets로 SecretEntry 배열을 반환해야 한다', async () => {
    const entries = await provider.listSecrets();
    expect(entries.length).toBe(3);
    expect(entries.find((e) => e.key === 'DB_HOST')?.value).toBe('localhost');
  });

  it('pushAll로 .env 파일에 시크릿을 저장해야 한다', async () => {
    const newEnvPath = '/tmp/apicenter-push-test.env';
    const pushProvider = new DotenvProvider({ path: newEnvPath });
    await pushProvider.pushAll({ NEW_KEY: 'new_value', ANOTHER: '42' });
    const readback = new DotenvProvider({ path: newEnvPath });
    const secrets = await readback.pullAll();
    expect(secrets['NEW_KEY']).toBe('new_value');
    expect(secrets['ANOTHER']).toBe('42');
    if (existsSync(newEnvPath)) unlinkSync(newEnvPath);
  });

  it('setSecret으로 단건 값을 저장해야 한다', async () => {
    await provider.setSecret('NEW_KEY', 'hello');
    const val = await provider.getSecret('NEW_KEY');
    expect(val).toBe('hello');
  });

  it('deleteSecret으로 키를 삭제해야 한다', async () => {
    await provider.deleteSecret('DB_HOST');
    expect(await provider.getSecret('DB_HOST')).toBeUndefined();
  });

  it('.env 파일이 없으면 pullAll이 빈 객체를 반환해야 한다', async () => {
    const emptyProvider = new DotenvProvider({ path: '/tmp/nonexistent_apicenter_xyz.env' });
    const secrets = await emptyProvider.pullAll();
    expect(secrets).toEqual({});
  });
});
