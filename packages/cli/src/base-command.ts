import { Command } from '@oclif/core';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, type ApicenterConfig } from '@apicenter/core';
import { DotenvProvider } from '@apicenter/provider-dotenv';
import type { SecretProvider } from '@apicenter/core';

export abstract class BaseCommand extends Command {
  protected config_!: ApicenterConfig;
  protected provider!: SecretProvider;

  protected async loadConfig(): Promise<void> {
    const configPath = join(process.cwd(), 'apicenter.yaml');
    if (!existsSync(configPath)) {
      this.error(
        '❌ apicenter.yaml 파일을 찾을 수 없습니다. `apicenter init`을 먼저 실행하세요.',
        { exit: 1 },
      );
    }
    const content = readFileSync(configPath, 'utf-8');
    this.config_ = parseConfig(content);
    this.provider = this.resolveProvider();
  }

  private resolveProvider(): SecretProvider {
    const { name, config } = this.config_.provider;
    switch (name) {
      case 'dotenv':
        return new DotenvProvider({
          path: (config?.['path'] as string) ?? '.env',
        });
      default:
        this.error(`Provider '${name}'은 아직 지원되지 않습니다.`, { exit: 1 });
    }
  }

  protected get outputPath(): string {
    return this.config_.output?.path ?? '.env.local';
  }

  protected get defaultEnv(): string {
    return this.config_.default_env ?? 'dev';
  }
}
