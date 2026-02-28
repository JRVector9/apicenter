import { Command, Flags, Args } from '@oclif/core';
import { writeFileSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import Table from 'cli-table3';
import {
  findProjectDirectories,
  buildYamlContent,
  detectSourcePath,
} from '../../utils/workspace-utils.js';

type InitResult = {
  dir: string;
  name: string;
  status: 'initialized' | 'skipped' | 'failed';
  reason?: string;
};

export default class WorkspaceInit extends Command {
  static description = '워크스페이스 내 모든 서브 프로젝트를 한 번에 초기화';

  static examples = [
    '<%= config.bin %> workspace:init ~/Desktop/Project/Working',
    '<%= config.bin %> workspace:init . --provider dotenv --dry-run',
    '<%= config.bin %> workspace:init . --force',
  ];

  static args = {
    dir: Args.string({
      description: '워크스페이스 루트 디렉토리',
      default: '.',
    }),
  };

  static flags = {
    provider: Flags.string({
      char: 'p',
      description: '시크릿 Provider',
      options: ['dotenv', 'infisical', 'vault', 'aws', 'doppler'],
      default: 'dotenv',
    }),
    depth: Flags.integer({
      char: 'd',
      description: '탐색 깊이',
      default: 2,
    }),
    'dry-run': Flags.boolean({
      description: '실제 파일 생성 없이 미리보기',
      default: false,
    }),
    force: Flags.boolean({
      description: '기존 apicenter.yaml 덮어쓰기',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WorkspaceInit);
    const baseDir = resolve(args.dir);

    if (!existsSync(baseDir)) {
      this.error(`디렉토리를 찾을 수 없습니다: ${baseDir}`, { exit: 1 });
    }

    this.log(`🔍 프로젝트 탐색 중: ${baseDir} (depth=${flags.depth})`);
    const projects = findProjectDirectories(baseDir, flags.depth);

    if (projects.length === 0) {
      this.log('⚠️  프로젝트를 찾을 수 없습니다.');
      return;
    }

    this.log(`📦 ${projects.length}개 프로젝트 발견\n`);

    if (flags['dry-run']) {
      this.log('📋 Dry Run 모드 — 실제 파일은 생성되지 않습니다:\n');
    }

    const results: InitResult[] = [];

    for (const projectDir of projects) {
      const name = relative(baseDir, projectDir) || '.';
      const configPath = join(projectDir, 'apicenter.yaml');

      if (existsSync(configPath) && !flags.force) {
        results.push({ dir: projectDir, name, status: 'skipped', reason: 'already initialized' });
        continue;
      }

      try {
        const sourcePath = detectSourcePath(projectDir);
        const yaml = buildYamlContent({
          provider: flags.provider,
          defaultEnv: 'dev',
          sourcePath,
        });

        if (!flags['dry-run']) {
          writeFileSync(configPath, yaml, 'utf-8');
          this.ensureGitignore(projectDir);
        }

        results.push({ dir: projectDir, name, status: 'initialized' });
      } catch (err) {
        results.push({
          dir: projectDir,
          name,
          status: 'failed',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.printResultTable(results);

    const initialized = results.filter((r) => r.status === 'initialized').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    this.log(`\n✅ 초기화: ${initialized} | ⏭️  스킵: ${skipped} | ❌ 실패: ${failed}`);

    if (!flags['dry-run'] && initialized > 0) {
      this.log(`\n🚀 다음 명령어로 시크릿을 가져오세요:`);
      this.log(`   apicenter workspace:pull ${args.dir}`);
    }
  }

  private ensureGitignore(projectDir: string): void {
    const gitignorePath = join(projectDir, '.gitignore');
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

  private printResultTable(results: InitResult[]): void {
    const table = new Table({
      head: ['Project', 'Status', 'Note'],
      colWidths: [30, 14, 40],
    });

    for (const r of results) {
      const statusIcon =
        r.status === 'initialized' ? '✅ initialized' :
        r.status === 'skipped' ? '⏭️  skipped' : '❌ failed';
      table.push([r.name, statusIcon, r.reason ?? '']);
    }

    this.log(table.toString());
  }
}
