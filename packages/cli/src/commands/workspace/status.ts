import { Command, Args } from '@oclif/core';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Table from 'cli-table3';
import { readDotenvFile } from '../../utils/dotenv-io.js';
import { findProjectDirectories } from '../../utils/workspace-utils.js';

export default class WorkspaceStatus extends Command {
  static description = '워크스페이스 내 프로젝트들의 apicenter 설정 현황 출력';

  static examples = [
    '<%= config.bin %> workspace:status ~/Desktop/Project/Working',
    '<%= config.bin %> workspace:status .',
  ];

  static args = {
    dir: Args.string({
      description: '워크스페이스 루트 디렉토리',
      default: '.',
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WorkspaceStatus);
    const baseDir = resolve(args.dir);

    if (!existsSync(baseDir)) {
      this.error(`디렉토리를 찾을 수 없습니다: ${baseDir}`, { exit: 1 });
    }

    this.log(`📊 워크스페이스 현황: ${baseDir}\n`);

    const projects = findProjectDirectories(baseDir);

    if (projects.length === 0) {
      this.log('⚠️  프로젝트를 찾을 수 없습니다.');
      return;
    }

    const table = new Table({
      head: ['Project', 'Config', '.env', '.env.local', 'Keys'],
      colWidths: [28, 10, 8, 14, 8],
    });

    for (const projectDir of projects) {
      const name = projectDir.replace(baseDir + '/', '').replace(baseDir, '.') || '.';

      const hasConfig = existsSync(join(projectDir, 'apicenter.yaml'));
      const hasEnv = existsSync(join(projectDir, '.env'));
      const hasEnvLocal = existsSync(join(projectDir, '.env.local'));

      let keyCount = '-';
      if (hasEnvLocal) {
        const secrets = readDotenvFile(join(projectDir, '.env.local'));
        keyCount = String(Object.keys(secrets).length);
      }

      table.push([
        name,
        hasConfig ? '✅' : '❌',
        hasEnv ? '✅' : '❌',
        hasEnvLocal ? '✅' : '❌',
        keyCount,
      ]);
    }

    this.log(table.toString());

    const total = projects.length;
    const initialized = projects.filter((p) => existsSync(join(p, 'apicenter.yaml'))).length;
    const pulled = projects.filter((p) => existsSync(join(p, '.env.local'))).length;

    this.log(`\n총 ${total}개 프로젝트 | 초기화됨: ${initialized} | Pull 완료: ${pulled}`);
  }
}
