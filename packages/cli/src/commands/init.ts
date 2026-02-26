import { Command, Flags } from '@oclif/core';
import { writeFileSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateConfig } from '../utils/config-generator.js';

export default class Init extends Command {
  static description = '프로젝트 시크릿 관리 초기 설정';
  static examples = ['<%= config.bin %> init', '<%= config.bin %> init --provider dotenv'];

  static flags = {
    provider: Flags.string({
      char: 'p',
      description: '시크릿 Provider 선택',
      options: ['dotenv', 'infisical', 'vault', 'aws', 'doppler'],
      default: 'dotenv',
    }),
    env: Flags.string({
      char: 'e',
      description: '기본 환경',
      default: 'dev',
    }),
    force: Flags.boolean({
      char: 'f',
      description: '기존 apicenter.yaml 덮어쓰기',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const configPath = join(process.cwd(), 'apicenter.yaml');

    if (existsSync(configPath) && !flags.force) {
      this.error(
        '이미 apicenter.yaml이 존재합니다. 덮어쓰려면 --force 플래그를 사용하세요.',
        { exit: 1 },
      );
    }

    const yaml = generateConfig({
      provider: flags.provider,
      defaultEnv: flags.env,
    });

    writeFileSync(configPath, yaml, 'utf-8');
    this.log(`✓ apicenter.yaml 생성 완료`);

    this.ensureGitignore();

    this.log(`✓ .env.local을 .gitignore에 추가했습니다`);
    this.log(`\n🚀 준비 완료! 다음 명령어로 시작하세요:`);
    this.log(`   apicenter pull    # 시크릿 동기화`);
    this.log(`   apicenter diff    # 변경사항 확인`);
  }

  private ensureGitignore(): void {
    const gitignorePath = join(process.cwd(), '.gitignore');
    const entries = ['.env.local', '.env', '*.env'];

    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, entries.join('\n') + '\n');
      return;
    }

    const existing = readFileSync(gitignorePath, 'utf-8');
    const toAdd = entries.filter((e) => !existing.includes(e));
    if (toAdd.length > 0) {
      appendFileSync(gitignorePath, '\n# apicenter\n' + toAdd.join('\n') + '\n');
    }
  }
}
