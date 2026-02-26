import { describe, it, expect } from 'vitest';
import { generateConfig } from './config-generator.js';

describe('generateConfig', () => {
  it('dotenv provider 최소 설정을 생성해야 한다', () => {
    const yaml = generateConfig({ provider: 'dotenv', defaultEnv: 'dev' });
    expect(yaml).toContain('name: dotenv');
    expect(yaml).toContain('version: "1"');
  });

  it('output path가 포함되어야 한다', () => {
    const yaml = generateConfig({
      provider: 'dotenv',
      defaultEnv: 'dev',
      outputPath: '.env.local',
    });
    expect(yaml).toContain('.env.local');
  });

  it('default_env가 포함되어야 한다', () => {
    const yaml = generateConfig({ provider: 'dotenv', defaultEnv: 'staging' });
    expect(yaml).toContain('default_env: staging');
  });
});
