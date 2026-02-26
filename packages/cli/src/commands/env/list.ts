import { Command } from '@oclif/core';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '@apicenter/core';

export default class EnvList extends Command {
  static description = 'apicenter.yaml에 정의된 환경 목록';
  static examples = ['<%= config.bin %> env list'];

  async run(): Promise<void> {
    const configPath = join(process.cwd(), 'apicenter.yaml');
    if (!existsSync(configPath)) {
      this.error('apicenter.yaml을 찾을 수 없습니다. `apicenter init`을 먼저 실행하세요.', {
        exit: 1,
      });
    }

    const config = parseConfig(readFileSync(configPath, 'utf-8'));
    const defaultEnv = config.default_env ?? 'dev';
    const envs = config.environments ?? {};

    if (Object.keys(envs).length === 0) {
      this.log(`환경이 정의되지 않았습니다. 기본 환경: ${defaultEnv}`);
      return;
    }

    this.log('Environments:\n');
    for (const [name, env] of Object.entries(envs)) {
      const isDefault = name === defaultEnv;
      const tag = isDefault ? ' (default)' : '';
      this.log(`  ${name}${tag}`);
      this.log(`    provider_env: ${env.provider_env}`);
    }
  }
}
