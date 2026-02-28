import { Flags } from '@oclif/core';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { BaseCommand } from '../base-command.js';
import { readDotenvFile } from '../utils/dotenv-io.js';

export default class Push extends BaseCommand {
  static description = '로컬 .env 파일의 시크릿을 Provider에 업로드';
  static examples = [
    '<%= config.bin %> push',
    '<%= config.bin %> push --env production',
    '<%= config.bin %> push --keys DB_HOST,DB_PORT',
    '<%= config.bin %> push --yes',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '대상 환경',
    }),
    source: Flags.string({
      char: 's',
      description: '업로드할 .env 파일 경로',
    }),
    keys: Flags.string({
      char: 'k',
      description: '업로드할 키 목록 (쉼표 구분)',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: '확인 없이 바로 실행 (CI/CD용)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { flags } = await this.parse(Push);

    const env = flags.env ?? this.defaultEnv;
    const sourcePath = join(
      process.cwd(),
      flags.source ?? (this.config_.provider.config?.['path'] as string) ?? '.env',
    );

    if (!existsSync(sourcePath)) {
      this.error(`소스 파일을 찾을 수 없습니다: ${sourcePath}`, { exit: 1 });
    }

    let secrets = readDotenvFile(sourcePath);

    if (flags.keys) {
      const keyList = flags.keys.split(',').map((k) => k.trim());
      const missingKeys = keyList.filter((k) => !(k in secrets));
      if (missingKeys.length > 0) {
        this.warn(`다음 키를 소스 파일에서 찾을 수 없습니다: ${missingKeys.join(', ')}`);
      }
      secrets = Object.fromEntries(
        Object.entries(secrets).filter(([k]) => keyList.includes(k)),
      );
    }

    const count = Object.keys(secrets).length;

    if (count === 0) {
      this.log('⚠️  업로드할 시크릿이 없습니다.');
      return;
    }

    this.log(`📤 ${count}개 시크릿을 ${env} 환경으로 업로드합니다.`);
    this.log(`   소스: ${sourcePath}`);

    if (!flags.yes && this.config_.security?.confirm_before_push) {
      this.log('\n계속하려면 --yes 플래그를 사용하거나 confirm_before_push를 false로 설정하세요.');
      return;
    }

    await this.provider.pushAll(secrets, env);
    this.log(`✅ ${count}개 시크릿 업로드 완료.`);
  }
}
