import { Command } from '@oclif/core';
import { join } from 'node:path';
import { runAllDoctorChecks } from '@apicenter/core';
import { existsSync, readFileSync } from 'node:fs';
import { parseConfig } from '@apicenter/core';

export default class Doctor extends Command {
  static description = '프로젝트 보안 상태 점검';
  static examples = ['<%= config.bin %> doctor'];

  async run(): Promise<void> {
    const projectDir = process.cwd();

    // output path 결정 (apicenter.yaml이 있으면 사용, 없으면 기본값)
    let outputPath = '.env.local';
    const configPath = join(projectDir, 'apicenter.yaml');
    if (existsSync(configPath)) {
      try {
        const config = parseConfig(readFileSync(configPath, 'utf-8'));
        outputPath = config.output?.path ?? '.env.local';
      } catch {
        // 파싱 실패 시 기본값 사용
      }
    }

    this.log('🩺 보안 상태 점검 중...\n');

    const results = runAllDoctorChecks(projectDir, outputPath);
    let passedCount = 0;

    for (const result of results) {
      const icon = result.passed ? '✓' : '✗';
      const label = result.passed ? 'PASS' : 'FAIL';
      this.log(`  ${icon} [${label}] ${result.name}`);
      this.log(`         ${result.message}`);
      if (result.fix && !result.passed) {
        this.log(`         💡 수정: ${result.fix}`);
      }
      this.log('');
      if (result.passed) passedCount++;
    }

    this.log(`  Score: ${passedCount}/${results.length}`);

    if (passedCount < results.length) {
      this.log('\n⚠️  보안 이슈가 발견되었습니다. 위의 수정 방법을 참고하세요.');
      process.exitCode = 1;
    } else {
      this.log('\n✅ 모든 보안 검사를 통과했습니다!');
    }
  }
}
