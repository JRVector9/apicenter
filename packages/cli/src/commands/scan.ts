import { Flags } from '@oclif/core';
import Table from 'cli-table3';
import { BaseCommand } from '../base-command.js';
import { scanDirectory } from '@apicenter/core';

export default class Scan extends BaseCommand {
  static description = '소스 파일에서 환경변수 참조 자동 탐지';
  static examples = [
    '<%= config.bin %> scan',
    '<%= config.bin %> scan --json',
  ];

  static flags = {
    json: Flags.boolean({
      description: 'JSON 형식으로 출력',
      default: false,
    }),
    include: Flags.string({
      char: 'i',
      description: 'include glob 패턴 (쉼표 구분)',
    }),
    exclude: Flags.string({
      char: 'e',
      description: 'exclude glob 패턴 (쉼표 구분)',
    }),
  };

  // scan은 apicenter.yaml 없이도 동작 가능 (loadConfig 호출 안 함)
  static enableJsonFlag = false;

  async run(): Promise<void> {
    const { flags } = await this.parse(Scan);

    const include = flags.include?.split(',').map((s) => s.trim());
    const exclude = flags.exclude?.split(',').map((s) => s.trim());

    this.log('🔍 프로젝트 스캔 중...\n');

    const result = await scanDirectory({
      cwd: process.cwd(),
      include,
      exclude,
    });

    if (result.matches.length === 0) {
      this.log('환경변수 참조를 찾지 못했습니다.');
      return;
    }

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2));
      return;
    }

    const table = new Table({
      head: ['Key', 'Provider', 'Language', 'File:Line'],
      style: { head: ['cyan'] },
      colWidths: [30, 15, 15, 50],
      wordWrap: true,
    });

    for (const match of result.matches) {
      table.push([match.key, match.provider ?? '-', match.language, `${match.file}:${match.line}`]);
    }

    this.log(table.toString());
    this.log(
      `\n  ✓ ${result.uniqueKeys.length}개의 고유 키를 ${result.fileCount}개 파일에서 발견했습니다.`,
    );
    this.log(`\n  고유 키 목록: ${result.uniqueKeys.join(', ')}`);
  }
}
