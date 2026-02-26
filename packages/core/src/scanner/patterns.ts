export type Language =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'java'
  | 'php'
  | 'dotenv'
  | 'docker'
  | 'github_actions';

export const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.php': 'php',
};

export const FILENAME_TO_LANGUAGE: Array<{ pattern: RegExp; language: Language }> = [
  { pattern: /^\.env(\..+)?$/, language: 'dotenv' },
  { pattern: /^Dockerfile(\..+)?$/, language: 'docker' },
  { pattern: /^docker-compose(\..+)?\.ya?ml$/, language: 'docker' },
  { pattern: /\.ya?ml$/, language: 'github_actions' },
];

export const SCAN_PATTERNS: Record<Language, Array<{ source: string; flags: string }>> = {
  javascript: [
    { source: String.raw`process\.env\.(\w+)`, flags: 'g' },
    { source: String.raw`process\.env\[['"](\w+)['"]\]`, flags: 'g' },
  ],
  typescript: [
    { source: String.raw`process\.env\.(\w+)`, flags: 'g' },
    { source: String.raw`process\.env\[['"](\w+)['"]\]`, flags: 'g' },
  ],
  python: [
    { source: String.raw`os\.environ\[['"](\w+)['"]\]`, flags: 'g' },
    { source: String.raw`os\.environ\.get\(['"](\w+)['"]`, flags: 'g' },
    { source: String.raw`os\.getenv\(['"](\w+)['"]`, flags: 'g' },
  ],
  ruby: [
    { source: String.raw`ENV\[['"](\w+)['"]\]`, flags: 'g' },
    { source: String.raw`ENV\.fetch\(['"](\w+)['"]`, flags: 'g' },
  ],
  go: [
    { source: String.raw`os\.Getenv\("(\w+)"\)`, flags: 'g' },
  ],
  rust: [
    { source: String.raw`env::var\("(\w+)"\)`, flags: 'g' },
    { source: String.raw`std::env::var\("(\w+)"\)`, flags: 'g' },
  ],
  java: [
    { source: String.raw`System\.getenv\("(\w+)"\)`, flags: 'g' },
  ],
  php: [
    { source: String.raw`\$_ENV\[['"](\w+)['"]\]`, flags: 'g' },
    { source: String.raw`getenv\(['"](\w+)['"]`, flags: 'g' },
  ],
  dotenv: [
    { source: String.raw`^([A-Z_][A-Z0-9_]*)=`, flags: 'gm' },
  ],
  docker: [
    { source: String.raw`^\s*-?\s*([A-Z_][A-Z0-9_]*)=`, flags: 'gm' },
    { source: String.raw`^\s*ENV\s+([A-Z_][A-Z0-9_]*)`, flags: 'gm' },
  ],
  github_actions: [
    { source: String.raw`\$\{\{\s*secrets\.(\w+)\s*\}\}`, flags: 'g' },
  ],
};
