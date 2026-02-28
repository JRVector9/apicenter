import { Command } from '@oclif/core';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, type ApicenterConfig, globalRegistry } from '@apicenter/core';
import { DotenvProvider } from '@apicenter/provider-dotenv';
import type { SecretProvider } from '@apicenter/core';

// dotenv provider를 글로벌 레지스트리에 기본 등록
globalRegistry.register('dotenv', (config) =>
  new DotenvProvider({ path: (config['path'] as string) ?? '.env' }),
);

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
    this.provider = await this.resolveProvider();
  }

  private async resolveProvider(): Promise<SecretProvider> {
    const { name, config } = this.config_.provider;
    const providerConfig = (config ?? {}) as Record<string, unknown>;

    // 1. 글로벌 레지스트리에서 먼저 탐색
    if (globalRegistry.has(name)) {
      return globalRegistry.resolve(name, providerConfig);
    }

    // 2. 동적 import 시도 (@apicenter/provider-{name})
    try {
      const module = await import(`@apicenter/provider-${name}`);
      const ProviderClass = module.default ?? Object.values(module)[0];
      if (typeof ProviderClass === 'function') {
        return new ProviderClass(providerConfig) as SecretProvider;
      }
    } catch (err) {
      const isModuleNotFound =
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND';
      if (!isModuleNotFound) {
        this.warn(
          `Provider '${name}' 로드 중 오류: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.error(
      `Provider '${name}'을 찾을 수 없습니다.\n` +
      `설치 후 다시 시도하세요: npm install @apicenter/provider-${name}`,
      { exit: 1 },
    );
  }

  protected get outputPath(): string {
    return this.config_.output?.path ?? '.env.local';
  }

  protected get defaultEnv(): string {
    return this.config_.default_env ?? 'dev';
  }
}
