import { Flags } from '@oclif/core';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { BaseCommand } from '../base-command.js';
import { readDotenvFile } from '../utils/dotenv-io.js';
import { computeDiff } from '../utils/diff-engine.js';

export default class Diff extends BaseCommand {
  static description = '로컬 .env ↔ Provider 간 시크릿 차이 비교';
  static examples = [
    '<%= config.bin %> diff',
    '<%= config.bin %> diff --env staging',
  ];

  static flags = {
    env: Flags.string({
      char: 'e',
      description: '비교 대상 환경',
    }),
  };

  async run(): Promise<void> {
    await this.loadConfig();
    const { flags } = await this.parse(Diff);

    const env = flags.env ?? this.defaultEnv;
    const localPath = join(process.cwd(), this.outputPath);

    this.log(`🔍 로컬 (${localPath}) ↔ remote (${env}) 비교 중...\n`);

    if (!existsSync(localPath)) {
      this.warn(`로컬 파일이 없습니다: ${localPath}\n먼저 \`apicenter pull\`을 실행하세요.`);
    }
    const local = readDotenvFile(localPath);
    const remote = await this.provider.pullAll(env);
    const diffs = computeDiff(local, remote);

    if (diffs.length === 0) {
      this.log('✅ 차이 없음 — 완전히 동기화되어 있습니다.');
      return;
    }

    const statusSymbol: Record<string, string> = {
      added: '+',
      removed: '-',
      changed: '~',
      synced: '=',
    };

    const statusLabel: Record<string, string> = {
      added: '(remote only)',
      removed: '(local only)',
      changed: '',
      synced: '(synced)',
    };

    for (const diff of diffs) {
      const sym = statusSymbol[diff.status];
      const label = statusLabel[diff.status];
      if (diff.status === 'changed') {
        this.log(
          `  ${sym} ${diff.key.padEnd(30)} local: ${diff.localValue?.slice(0, 20)} → remote: ${diff.remoteValue?.slice(0, 20)}`,
        );
      } else {
        this.log(`  ${sym} ${diff.key.padEnd(30)} ${label}`);
      }
    }

    const added = diffs.filter((d) => d.status === 'added').length;
    const removed = diffs.filter((d) => d.status === 'removed').length;
    const changed = diffs.filter((d) => d.status === 'changed').length;
    const synced = diffs.filter((d) => d.status === 'synced').length;

    this.log(`\n  + added: ${added}  - removed: ${removed}  ~ changed: ${changed}  = synced: ${synced}`);
  }
}
