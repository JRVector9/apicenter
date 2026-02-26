import { Flags } from '@oclif/core';
import { join } from 'node:path';
import { BaseCommand } from '../base-command.js';
import { writeDotenvFile } from '../utils/dotenv-io.js';

export default class Pull extends BaseCommand {
  static description = 'Provider에서 시크릿을 가져와 로컬 .env 파일 생성';
  static examples = [
    '<%= config.bin %> pull',
    '<%= config.bin %> pull --env staging',
    '<%= config.bin %> pull --dry-run',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '대상 환경 (기본: default_env)',
    }),
    'dry-run': Flags.boolean({
      description: '실제 파일 생성 없이 미리보기',
      default: false,
    }),
    output: Flags.string({
      char: 'o',
      description: '출력 파일 경로',
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { flags } = await this.parse(Pull);

    const env = flags.env ?? this.defaultEnv;
    const outputPath = join(process.cwd(), flags.output ?? this.outputPath);

    this.log(`🔄 ${env} 환경에서 시크릿 가져오는 중...`);

    const secrets = await this.provider.pullAll(env);
    const count = Object.keys(secrets).length;

    if (count === 0) {
      this.log('⚠️  가져온 시크릿이 없습니다.');
      return;
    }

    if (flags['dry-run']) {
      this.log(`\n📋 Dry Run — 실제 파일은 생성되지 않습니다:\n`);
      for (const [key, value] of Object.entries(secrets)) {
        this.log(`  ${key}=${value.slice(0, 3)}***`);
      }
      this.log(`\n총 ${count}개 시크릿 (출력 경로: ${outputPath})`);
      return;
    }

    writeDotenvFile(outputPath, secrets);
    this.log(`✅ ${count}개 시크릿을 ${outputPath}에 저장했습니다.`);
  }
}
