import { Args, Flags } from '@oclif/core';
import { randomBytes } from 'node:crypto';
import { BaseCommand } from '../base-command.js';

/** Exported for testing */
export function generateSecret(length: number): string {
  const bytes = randomBytes(Math.ceil(length * 0.75));
  return bytes.toString('base64url').slice(0, length);
}

export default class Rotate extends BaseCommand {
  static description = '시크릿 값 로테이션 (새 값으로 자동 갱신)';
  static examples = [
    '<%= config.bin %> rotate DB_PASSWORD',
    '<%= config.bin %> rotate API_KEY --length 48',
    '<%= config.bin %> rotate SESSION_SECRET --value "my-new-value" --yes',
  ];

  static args = {
    key: Args.string({ description: '로테이션할 시크릿 키', required: true }),
  };

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '대상 환경 (기본: default_env)',
    }),
    value: Flags.string({
      char: 'v',
      description: '새 값 지정 (미지정 시 자동 생성)',
    }),
    length: Flags.integer({
      char: 'l',
      description: '자동 생성 시 길이',
      default: 32,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: '확인 없이 실행 (CI/CD용)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { args, flags } = await this.parse(Rotate);

    const env = flags.env ?? this.defaultEnv;
    const newValue = flags.value ?? generateSecret(flags.length);

    this.log(`🔄 ${args.key} 로테이션 준비 중...`);
    this.log(`   환경: ${env}`);
    this.log(
      `   새 값: ${newValue.slice(0, 4)}${'*'.repeat(Math.min(newValue.length - 4, 20))} (${newValue.length}자)`,
    );

    if (!flags.yes) {
      this.log('\n계속하려면 --yes 플래그를 사용하세요.');
      return;
    }

    // Use native rotation if provider supports it
    if (typeof (this.provider as unknown as Record<string, unknown>)['rotateSecret'] === 'function') {
      const rotated = await (this.provider as unknown as Record<string, (...args: unknown[]) => Promise<string>>)['rotateSecret']!(args.key, env);
      this.log(`✅ ${args.key} 네이티브 로테이션 완료: ${String(rotated ?? '').slice(0, 4)}***`);
      return;
    }

    await this.provider.setSecret(args.key, newValue, env);
    this.log(`✅ ${args.key} 로테이션 완료`);
  }
}
