import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from './provider-registry.js';
import type { SecretProvider, AuthConfig, SecretEntry, SecretValue } from '../types/index.js';

// 테스트용 최소 Provider
function makeMockProvider(name: string): SecretProvider {
  return {
    name,
    authenticate: async (_: AuthConfig) => {},
    isAuthenticated: async () => true,
    getSecret: async (_key: string): Promise<SecretValue> => 'mock-value',
    listSecrets: async (): Promise<SecretEntry[]> => [],
    setSecret: async () => {},
    deleteSecret: async () => {},
    pullAll: async () => ({ MOCK_KEY: 'mock-value' }),
    pushAll: async () => {},
  };
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('Provider를 등록하고 list()로 확인할 수 있어야 한다', () => {
    registry.register('dotenv', (cfg) => makeMockProvider('dotenv'));
    expect(registry.list()).toContain('dotenv');
  });

  it('has()로 등록 여부를 확인할 수 있어야 한다', () => {
    registry.register('dotenv', (cfg) => makeMockProvider('dotenv'));
    expect(registry.has('dotenv')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('resolve()로 Provider 인스턴스를 생성할 수 있어야 한다', () => {
    registry.register('dotenv', (cfg) => makeMockProvider('dotenv'));
    const provider = registry.resolve('dotenv', { path: '.env' });
    expect(provider.name).toBe('dotenv');
  });

  it('등록되지 않은 Provider resolve 시 에러를 던져야 한다', () => {
    expect(() => registry.resolve('unknown', {})).toThrow("Provider 'unknown'이 등록되지 않았습니다.");
  });

  it('override()로 기존 등록을 덮어쓸 수 있어야 한다', () => {
    registry.register('dotenv', (_cfg) => makeMockProvider('dotenv-v1'));
    registry.override('dotenv', (_cfg) => makeMockProvider('dotenv-v2'));
    const provider = registry.resolve('dotenv', {});
    expect(provider.name).toBe('dotenv-v2');
  });

  it('unregister()로 Provider를 제거할 수 있어야 한다', () => {
    registry.register('dotenv', (_cfg) => makeMockProvider('dotenv'));
    registry.unregister('dotenv');
    expect(registry.has('dotenv')).toBe(false);
  });

  it('비어 있는 레지스트리는 빈 list()를 반환해야 한다', () => {
    expect(registry.list()).toEqual([]);
  });
});
