import { readFileSync, existsSync } from 'node:fs';
import { extname, basename, relative } from 'node:path';
import { glob } from 'glob';
import type { ScanMatch, ScanResult } from '../types/index.js';
import {
  EXTENSION_TO_LANGUAGE,
  FILENAME_TO_LANGUAGE,
  SCAN_PATTERNS,
  SECRET_VALUE_PATTERNS,
  type Language,
} from './patterns.js';

// 값 패턴 탐지를 적용할 소스 코드 언어 (dotenv/docker/github_actions 제외)
const SOURCE_LANGUAGES = new Set<Language>([
  'javascript',
  'typescript',
  'python',
  'ruby',
  'go',
  'rust',
  'java',
  'php',
]);

export interface ScanOptions {
  cwd?: string;
  include?: string[];
  exclude?: string[];
}

const DEFAULT_INCLUDE = [
  'src/**',
  'app/**',
  'lib/**',
  'config/**',
  '*.py',
  '*.js',
  '*.ts',
  '*.rb',
  '*.go',
  '*.rs',
  '.env*',
  'Dockerfile*',
  'docker-compose*.yml',
  'docker-compose*.yaml',
  '.github/workflows/**',
];

const DEFAULT_EXCLUDE = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.git/**',
  '**/*.lock',
  '**/*.min.js',
  '**/*.map',
];

export function detectLanguage(filePath: string): Language | undefined {
  const ext = extname(filePath).toLowerCase();
  if (ext && EXTENSION_TO_LANGUAGE[ext]) {
    return EXTENSION_TO_LANGUAGE[ext];
  }

  const name = basename(filePath);
  for (const { pattern, language } of FILENAME_TO_LANGUAGE) {
    if (pattern.test(name)) {
      if (language === 'github_actions' && !filePath.includes('.github/workflows')) {
        continue;
      }
      return language;
    }
  }

  return undefined;
}

export function scanFileContent(
  content: string,
  filePath: string,
  language: Language,
  cwd: string,
): ScanMatch[] {
  const matches: ScanMatch[] = [];
  const patterns = SCAN_PATTERNS[language];
  const lines = content.split('\n');
  const relPath = relative(cwd, filePath);

  for (const { source, flags } of patterns) {
    const regex = new RegExp(source, flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const key = match[1];
      if (!key) continue;

      const matchIndex = match.index;
      const linesBefore = content.slice(0, matchIndex).split('\n');
      const lineNumber = linesBefore.length;
      const lineContent = lines[lineNumber - 1] ?? '';

      const trimmedLine = lineContent.trim();
      if (
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('--')
      ) {
        continue;
      }

      const alreadyAdded = matches.some(
        (m) => m.file === relPath && m.line === lineNumber && m.key === key,
      );
      if (!alreadyAdded) {
        matches.push({ key, file: relPath, line: lineNumber, language });
      }
    }
  }

  // 값 패턴 탐지 (provider fingerprint) — 소스 코드 언어에만 적용
  if (SOURCE_LANGUAGES.has(language)) {
    for (const { provider, keyName, source, flags } of SECRET_VALUE_PATTERNS) {
      const regex = new RegExp(source, flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const matchIndex = match.index;
        const linesBefore = content.slice(0, matchIndex).split('\n');
        const lineNumber = linesBefore.length;
        const lineContent = lines[lineNumber - 1] ?? '';

        const trimmedLine = lineContent.trim();
        if (
          trimmedLine.startsWith('#') ||
          trimmedLine.startsWith('//') ||
          trimmedLine.startsWith('--')
        ) {
          continue;
        }

        const alreadyAdded = matches.some(
          (m) => m.file === relPath && m.line === lineNumber && m.key === keyName,
        );
        if (!alreadyAdded) {
          matches.push({ key: keyName, file: relPath, line: lineNumber, language, provider });
        }
      }
    }
  }

  return matches;
}

export async function scanDirectory(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;

  const files: string[] = [];
  for (const pattern of include) {
    const found = await glob(pattern, {
      cwd,
      absolute: true,
      nodir: true,
      ignore: exclude,
      dot: true,
    });
    files.push(...found);
  }

  const uniqueFiles = [...new Set(files)];
  const allMatches: ScanMatch[] = [];
  const scannedFiles = new Set<string>();

  for (const filePath of uniqueFiles) {
    if (!existsSync(filePath)) continue;
    if (scannedFiles.has(filePath)) continue;
    scannedFiles.add(filePath);

    const language = detectLanguage(filePath);
    if (!language) continue;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const fileMatches = scanFileContent(content, filePath, language, cwd);
    allMatches.push(...fileMatches);
  }

  const uniqueKeys = [...new Set(allMatches.map((m) => m.key))].sort();

  return {
    matches: allMatches,
    uniqueKeys,
    fileCount: scannedFiles.size,
  };
}
