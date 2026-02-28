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
    // 하드코딩된 값: const/let/var 변수명에 KEY/TOKEN/SECRET/URL/BASE/HOST/ENDPOINT 등 접미사
    {
      source: String.raw`(?:const|let|var)\s+([A-Z_][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|URL|BASE|HOST|ENDPOINT))\s*=\s*['"][^'"\n]{8,}['"]`,
      flags: 'g',
    },
  ],
  typescript: [
    { source: String.raw`process\.env\.(\w+)`, flags: 'g' },
    { source: String.raw`process\.env\[['"](\w+)['"]\]`, flags: 'g' },
    // 하드코딩된 값: const/let/var 변수명에 KEY/TOKEN/SECRET/URL/BASE/HOST/ENDPOINT 등 접미사
    {
      source: String.raw`(?:const|let|var)\s+([A-Z_][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|URL|BASE|HOST|ENDPOINT))\s*=\s*['"][^'"\n]{8,}['"]`,
      flags: 'g',
    },
  ],
  python: [
    { source: String.raw`os\.environ\[['"](\w+)['"]\]`, flags: 'g' },
    { source: String.raw`os\.environ\.get\(['"](\w+)['"]`, flags: 'g' },
    { source: String.raw`os\.getenv\(['"](\w+)['"]`, flags: 'g' },
    // 하드코딩된 값: KEY/TOKEN/SECRET/URL/BASE/HOST/ENDPOINT 등 접미사 변수에 문자열 직접 할당
    {
      source: String.raw`^([A-Z_][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|URL|BASE|HOST|ENDPOINT))\s*=\s*["'][^"'\n]{8,}["']`,
      flags: 'gm',
    },
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

// 값 패턴 기반 시크릿 탐지 (provider fingerprint)
// 소스 파일에서 따옴표로 감싸인 값의 형태로 탐지 (언어 무관)
export interface SecretValuePattern {
  provider: string;
  keyName: string; // ScanMatch.key 로 사용될 이름
  source: string;
  flags: string;
}

export const SECRET_VALUE_PATTERNS: SecretValuePattern[] = [
  // ── AI / ML ────────────────────────────────────────────────────────────
  {
    provider: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
    source: String.raw`["']sk-[A-Za-z0-9\-_]{20,}["']`,
    flags: 'g',
  },
  {
    provider: 'Anthropic',
    keyName: 'ANTHROPIC_API_KEY',
    source: String.raw`["']sk-ant-[A-Za-z0-9\-_]{80,}["']`,
    flags: 'g',
  },
  {
    provider: 'HuggingFace',
    keyName: 'HUGGINGFACE_TOKEN',
    source: String.raw`["']hf_[A-Za-z0-9]{39}["']`,
    flags: 'g',
  },

  // ── Cloud ──────────────────────────────────────────────────────────────
  {
    provider: 'AWS',
    keyName: 'AWS_ACCESS_KEY_ID',
    source: String.raw`["']AKIA[A-Z0-9]{16}["']`,
    flags: 'g',
  },
  {
    provider: 'GCP',
    keyName: 'GCP_API_KEY',
    source: String.raw`["']AIza[0-9A-Za-z_\-]{35}["']`,
    flags: 'g',
  },
  {
    provider: 'DigitalOcean',
    keyName: 'DIGITALOCEAN_TOKEN',
    source: String.raw`["']dop_v1_[a-f0-9]{64}["']`,
    flags: 'g',
  },

  // ── 개발 도구 ─────────────────────────────────────────────────────────
  {
    provider: 'GitHub',
    keyName: 'GITHUB_TOKEN',
    source: String.raw`["']ghp_[A-Za-z0-9]{36}["']`,
    flags: 'g',
  },
  {
    provider: 'GitHub',
    keyName: 'GITHUB_TOKEN',
    source: String.raw`["']github_pat_[A-Za-z0-9_]{82}["']`,
    flags: 'g',
  },
  {
    provider: 'GitHub',
    keyName: 'GITHUB_TOKEN',
    source: String.raw`["']gho_[A-Za-z0-9]{36}["']`,
    flags: 'g',
  },
  {
    provider: 'NPM',
    keyName: 'NPM_TOKEN',
    source: String.raw`["']npm_[A-Za-z0-9]{36}["']`,
    flags: 'g',
  },
  {
    provider: 'PyPI',
    keyName: 'PYPI_TOKEN',
    source: String.raw`["']pypi-[A-Za-z0-9_\-]{64,}["']`,
    flags: 'g',
  },
  {
    provider: 'Linear',
    keyName: 'LINEAR_API_KEY',
    source: String.raw`["']lin_api_[A-Za-z0-9]{40}["']`,
    flags: 'g',
  },

  // ── 커뮤니케이션 ──────────────────────────────────────────────────────
  {
    provider: 'Slack',
    keyName: 'SLACK_BOT_TOKEN',
    source: String.raw`["']xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+["']`,
    flags: 'g',
  },
  {
    provider: 'Slack',
    keyName: 'SLACK_USER_TOKEN',
    source: String.raw`["']xoxp-[0-9]+-[0-9]+-[0-9]+-[A-Za-z0-9]+["']`,
    flags: 'g',
  },
  {
    provider: 'Slack',
    keyName: 'SLACK_APP_TOKEN',
    source: String.raw`["']xapp-[0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+["']`,
    flags: 'g',
  },
  {
    provider: 'Discord',
    keyName: 'DISCORD_BOT_TOKEN',
    source: String.raw`["'][MNO][A-Za-z0-9]{23}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27}["']`,
    flags: 'g',
  },
  {
    provider: 'Telegram',
    keyName: 'TELEGRAM_BOT_TOKEN',
    source: String.raw`["'][0-9]{8,10}:[A-Za-z0-9_\-]{35}["']`,
    flags: 'g',
  },

  // ── 결제 ──────────────────────────────────────────────────────────────
  {
    provider: 'Stripe',
    keyName: 'STRIPE_SECRET_KEY',
    source: String.raw`["']sk_live_[A-Za-z0-9]{24,}["']`,
    flags: 'g',
  },
  {
    provider: 'Stripe',
    keyName: 'STRIPE_TEST_KEY',
    source: String.raw`["']sk_test_[A-Za-z0-9]{24,}["']`,
    flags: 'g',
  },
  {
    provider: 'Square',
    keyName: 'SQUARE_ACCESS_TOKEN',
    source: String.raw`["']sq0csp-[0-9A-Za-z_\-]{43}["']`,
    flags: 'g',
  },

  // ── 이메일 / 마케팅 ───────────────────────────────────────────────────
  {
    provider: 'SendGrid',
    keyName: 'SENDGRID_API_KEY',
    source: String.raw`["']SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}["']`,
    flags: 'g',
  },
  {
    provider: 'Mailgun',
    keyName: 'MAILGUN_API_KEY',
    source: String.raw`["']key-[a-f0-9]{32}["']`,
    flags: 'g',
  },
  {
    provider: 'Mailchimp',
    keyName: 'MAILCHIMP_API_KEY',
    source: String.raw`["'][0-9a-f]{32}-us[0-9]{1,2}["']`,
    flags: 'g',
  },

  // ── 기타 ──────────────────────────────────────────────────────────────
  {
    provider: 'Notion',
    keyName: 'NOTION_SECRET',
    source: String.raw`["']secret_[A-Za-z0-9]{43}["']`,
    flags: 'g',
  },
  {
    provider: 'Notion',
    keyName: 'NOTION_TOKEN',
    source: String.raw`["']ntn_[A-Za-z0-9]{43}["']`,
    flags: 'g',
  },
  {
    provider: 'Shopify',
    keyName: 'SHOPIFY_ACCESS_TOKEN',
    source: String.raw`["']shp[a-z]{2,3}_[0-9a-f]{32}["']`,
    flags: 'g',
  },
  {
    provider: 'Twilio',
    keyName: 'TWILIO_API_KEY',
    source: String.raw`["']SK[a-f0-9]{32}["']`,
    flags: 'g',
  },
  {
    provider: 'JWT',
    keyName: 'JWT_TOKEN',
    source: String.raw`["']eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]{10,}["']`,
    flags: 'g',
  },
];
