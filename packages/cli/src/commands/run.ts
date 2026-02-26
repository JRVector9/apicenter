import { Flags } from '@oclif/core';
import { spawn } from 'node:child_process';
import { BaseCommand } from '../base-command.js';

export default class Run extends BaseCommand {
  static description = '시크릿을 환경변수로 주입하여 명령 실행 (파일 생성 없음)';
  static strict = false; // -- 이후 임의 인수 허용
  static examples = [
    '<%= config.bin %> run -- npm start',
    '<%= config.bin %> run --env staging -- python manage.py runserver',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '시크릿을 가져올 환경',
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { flags } = await this.parse(Run);

    // -- 이후의 인수만 추출
    const rawArgv = process.argv.slice(2);
    const separatorIndex = rawArgv.indexOf('--');
    if (separatorIndex === -1 || separatorIndex === rawArgv.length - 1) {
      this.error('실행할 명령을 -- 뒤에 지정하세요. 예: apicenter run -- npm start', {
        exit: 1,
      });
    }

    const cmd = rawArgv[separatorIndex + 1]!;
    const cmdArgs = rawArgv.slice(separatorIndex + 2);

    const env = flags.env ?? this.defaultEnv;
    this.log(`🔑 ${env} 환경 시크릿 주입 후 실행: ${cmd} ${cmdArgs.join(' ')}`);

    const secrets = await this.provider.pullAll(env);
    const injectedEnv = { ...process.env, ...secrets };

    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, cmdArgs, {
        env: injectedEnv,
        stdio: 'inherit',
        shell: false,
      });

      child.on('error', (err) => {
        reject(new Error(`명령 실행 실패: ${err.message}`));
      });

      child.on('close', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal);
        } else {
          process.exitCode = code ?? 0;
          resolve();
        }
      });
    });
  }
}
