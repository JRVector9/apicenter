interface GenerateConfigOptions {
  provider: string;
  defaultEnv: string;
  outputPath?: string;
  sourcePath?: string;
}

export function generateConfig(opts: GenerateConfigOptions): string {
  const { provider, defaultEnv, outputPath = '.env.local', sourcePath = '.env' } = opts;

  return `# yaml-language-server: $schema=https://unpkg.com/apicenter/schemas/apicenter.schema.json
version: "1"

provider:
  name: ${provider}
  config:
    path: ${sourcePath}

environments:
  dev:
    provider_env: development
  staging:
    provider_env: staging
  prod:
    provider_env: production

default_env: ${defaultEnv}

output:
  format: dotenv
  path: ${outputPath}

security:
  mask_in_logs: true
  confirm_before_push: true
  gitignore_check: true
`;
}
