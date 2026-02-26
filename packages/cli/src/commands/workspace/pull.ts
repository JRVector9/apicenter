import { Command, Flags, Args } from '@oclif/core';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Table from 'cli-table3';
import { parseConfig } from '@apicenter/core';
import { writeDotenvFile } from '../../utils/dotenv-io.js';
import { findInitializedDirectories, resolveProviderForDir } from '../../utils/workspace-utils.js';

type PullResult = {
  name: string;
  status: 'success' | 'failed' | 'empty';
  keyCount?: number;
  error?: string;
};

export default class WorkspacePull extends Command {
  static description = '모든 초기화된 프로젝트에서 시크릿을 한 번에 Pull';

  static examples = [
    '<%= config.bin %> workspace:pull ~/Desktop/Project/Working',
    '<%= config.bin %> workspace:pull . --env staging',
    '<%= config.bin %> workspace:pull . --dry-run',
    '<%= config.bin %> workspace:pull . --continue-on-error',
  ];

  static args = {
    dir: Args.string({
      description: '워크스페이스 루트 디렉토리',
      default: '.',
    }),
  };

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '대상 환경',
      default: 'dev',
    }),
    'dry-run': Flags.boolean({
      description: '실제 파일 생성 없이 미리보기',
      default: false,
    }),
    'continue-on-error': Flags.boolean({
      description: '실패한 프로젝트를 건너뛰고 계속 진행',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WorkspacePull);
    const baseDir = resolve(args.dir);

    if (!existsSync(baseDir)) {
      this.error(`디렉토리를 찾을 수 없습니다: ${baseDir}`, { exit: 1 });
    }

    this.log(`🔍 초기화된 프로젝트 탐색 중: ${baseDir}`);
    const projects = findInitializedDirectories(baseDir);

    if (projects.length === 0) {
      this.log('⚠️  초기화된 프로젝트가 없습니다. `apicenter workspace:init`을 먼저 실행하세요.');
      return;
    }

    this.log(`📦 ${projects.length}개 프로젝트 발견\n`);

    if (flags['dry-run']) {
      this.log('📋 Dry Run 모드 — 실제 파일은 생성되지 않습니다:\n');
    }

    const results: PullResult[] = [];

    for (const projectDir of projects) {
      const name = projectDir.replace(baseDir + '/', '').replace(baseDir, '.') || '.';
      const configPath = join(projectDir, 'apicenter.yaml');

      try {
        const configContent = readFileSync(configPath, 'utf-8');
        const config = parseConfig(configContent);

        const provider = await resolveProviderForDir(configContent, projectDir);
        const secrets = await provider.pullAll(flags.env);
        const count = Object.keys(secrets).length;

        if (count === 0) {
          results.push({ name, status: 'empty', keyCount: 0 });
          continue;
        }

        if (!flags['dry-run']) {
          const outputRelPath = config.output?.path ?? '.env.local';
          const outputAbsPath = join(projectDir, outputRelPath);
          writeDotenvFile(outputAbsPath, secrets);
        }

        results.push({ name, status: 'success', keyCount: count });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ name, status: 'failed', error: errorMsg });

        if (!flags['continue-on-error']) {
          this.printResultTable(results);
          this.error(`프로젝트 '${name}' pull 실패: ${errorMsg}\n계속하려면 --continue-on-error 플래그를 사용하세요.`, { exit: 1 });
        }
      }
    }

    this.printResultTable(results);

    const success = results.filter((r) => r.status === 'success').length;
    const empty = results.filter((r) => r.status === 'empty').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    this.log(`\n✅ 성공: ${success} | ⚠️  키 없음: ${empty} | ❌ 실패: ${failed}`);
  }

  private printResultTable(results: PullResult[]): void {
    const table = new Table({
      head: ['Project', 'Status', 'Keys'],
      colWidths: [30, 14, 8],
    });

    for (const r of results) {
      const statusIcon =
        r.status === 'success' ? '✅ success' :
        r.status === 'empty' ? '⚠️  empty' : '❌ failed';
      const keys = r.keyCount !== undefined ? String(r.keyCount) : r.error?.slice(0, 30) ?? '';
      table.push([r.name, statusIcon, keys]);
    }

    this.log(table.toString());
  }
}
