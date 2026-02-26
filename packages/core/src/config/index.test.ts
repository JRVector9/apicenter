import { describe, it, expect } from 'vitest';
import { parseConfig, validateConfig } from './index.js';

const minimalYaml = `
version: "1"
provider:
  name: dotenv
  config:
    path: .env
`;

const fullYaml = `
version: "1"
provider:
  name: dotenv
  config:
    path: .env
environments:
  dev:
    provider_env: development
  prod:
    provider_env: production
default_env: dev
output:
  format: dotenv
  path: .env.local
`;

describe('parseConfig', () => {
  it('최소 설정 YAML을 파싱해야 한다', () => {
    const config = parseConfig(minimalYaml);
    expect(config.version).toBe('1');
    expect(config.provider.name).toBe('dotenv');
    expect(config.provider.config?.['path']).toBe('.env');
  });

  it('전체 설정 YAML을 파싱해야 한다', () => {
    const config = parseConfig(fullYaml);
    expect(config.default_env).toBe('dev');
    expect(config.environments?.['dev']?.provider_env).toBe('development');
    expect(config.output?.format).toBe('dotenv');
    expect(config.output?.path).toBe('.env.local');
  });

  it('잘못된 YAML에서 에러를 던져야 한다', () => {
    expect(() => parseConfig('invalid: yaml: [')).toThrow();
  });
});

describe('validateConfig', () => {
  it('필수 필드 누락 시 에러를 던져야 한다', () => {
    expect(() => validateConfig({ version: '1' })).toThrow();
  });

  it('지원하지 않는 provider name에서 에러를 던져야 한다', () => {
    expect(() =>
      validateConfig({ version: '1', provider: { name: 'unknown_provider' } }),
    ).toThrow();
  });

  it('유효한 설정을 통과시켜야 한다', () => {
    expect(() =>
      validateConfig({ version: '1', provider: { name: 'dotenv' } }),
    ).not.toThrow();
  });
});
