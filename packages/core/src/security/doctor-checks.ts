import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DoctorCheckResult {
  name: string;
  passed: boolean;
  message: string;
  fix?: string;
}

/** .env.local (또는 지정된 출력 경로)가 .gitignore에 있는지 확인 */
export function checkOutputPathInGitignore(
  projectDir: string,
  outputPath: string,
): DoctorCheckResult {
  const gitignorePath = join(projectDir, '.gitignore');
  const name = `.gitignore에 ${outputPath} 포함 여부`;

  if (!existsSync(gitignorePath)) {
    return {
      name,
      passed: false,
      message: '.gitignore 파일이 없습니다.',
      fix: `echo "${outputPath}" >> .gitignore`,
    };
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map((l) => l.trim());
  const isIgnored = lines.some(
    (line) =>
      line === outputPath ||
      line === `*.env` ||
      line === `.env*` ||
      (outputPath.endsWith('.env') && line === '.env'),
  );

  return {
    name,
    passed: isIgnored,
    message: isIgnored
      ? `${outputPath}가 .gitignore에 포함되어 있습니다.`
      : `${outputPath}가 .gitignore에 없습니다. git에 커밋될 수 있습니다!`,
    fix: isIgnored ? undefined : `echo "${outputPath}" >> .gitignore`,
  };
}

/** .env 파일이 .gitignore에 있는지 확인 */
export function checkDotenvInGitignore(projectDir: string): DoctorCheckResult {
  const gitignorePath = join(projectDir, '.gitignore');
  const name = '.gitignore에 .env 포함 여부';

  if (!existsSync(gitignorePath)) {
    return {
      name,
      passed: false,
      message: '.gitignore 파일이 없습니다.',
      fix: 'echo ".env" >> .gitignore',
    };
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map((l) => l.trim());
  const isIgnored = lines.some(
    (line) => line === '.env' || line === '*.env' || line === '.env*',
  );

  return {
    name,
    passed: isIgnored,
    message: isIgnored
      ? '.env가 .gitignore에 포함되어 있습니다.'
      : '.env가 .gitignore에 없습니다. 실제 시크릿이 git에 커밋될 수 있습니다!',
    fix: isIgnored ? undefined : 'echo ".env" >> .gitignore',
  };
}

/**
 * apicenter.yaml에 실제 시크릿 값이 하드코딩되어 있는지 확인.
 * 휴리스틱: 값이 20자 이상이고 URL이 아닌 경우 시크릿으로 간주.
 */
export function checkNoHardcodedSecrets(projectDir: string): DoctorCheckResult {
  const configPath = join(projectDir, 'apicenter.yaml');
  const name = 'apicenter.yaml에 하드코딩된 시크릿 없음';

  if (!existsSync(configPath)) {
    return {
      name,
      passed: true,
      message: 'apicenter.yaml이 없어 검사를 건너뜁니다.',
    };
  }

  const content = readFileSync(configPath, 'utf-8');
  // value: "looooooong..." 패턴 탐지
  const valuePattern = /:\s*["']?([^"'\n]{20,})["']?/g;
  const suspiciousValues: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = valuePattern.exec(content)) !== null) {
    const val = match[1]?.trim() ?? '';
    // URL, 경로, 일반 문자열 제외
    if (
      val.startsWith('http') ||
      val.startsWith('/') ||
      val.startsWith('$') ||
      val.includes('{{') ||
      /^[a-z][a-z0-9._-]*\.[a-z]{2,}/.test(val) // 도메인 형태
    ) {
      continue;
    }
    suspiciousValues.push(val.slice(0, 30) + '...');
  }

  const passed = suspiciousValues.length === 0;
  return {
    name,
    passed,
    message: passed
      ? 'apicenter.yaml에 하드코딩된 시크릿이 없습니다.'
      : `apicenter.yaml에 시크릿처럼 보이는 값이 있습니다: ${suspiciousValues.slice(0, 2).join(', ')}`,
    fix: passed ? undefined : 'apicenter.yaml에서 실제 값을 제거하고 환경변수나 Provider로 대체하세요.',
  };
}

export function runAllDoctorChecks(
  projectDir: string,
  outputPath: string,
): DoctorCheckResult[] {
  return [
    checkOutputPathInGitignore(projectDir, outputPath),
    checkDotenvInGitignore(projectDir),
    checkNoHardcodedSecrets(projectDir),
  ];
}
