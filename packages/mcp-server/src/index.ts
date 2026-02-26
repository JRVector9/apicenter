import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, globalRegistry, scanDirectory, type SecretProvider } from '@apicenter/core';
import { DotenvProvider } from '@apicenter/provider-dotenv';

// Register dotenv as built-in provider
globalRegistry.register(
  'dotenv',
  (cfg) => new DotenvProvider({ path: (cfg['path'] as string) ?? '.env' }),
);

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function loadConfig(cwd: string) {
  const configPath = join(cwd, 'apicenter.yaml');
  if (!existsSync(configPath)) {
    throw new Error('apicenter.yaml not found. Run `apicenter init` first.');
  }
  return parseConfig(readFileSync(configPath, 'utf-8'));
}

async function resolveProvider(
  cwd: string,
): Promise<{ provider: SecretProvider; config: ReturnType<typeof loadConfig> }> {
  const config = loadConfig(cwd);
  const { name, config: providerConfig } = config.provider;
  const pc = (providerConfig ?? {}) as Record<string, unknown>;

  let provider: SecretProvider;
  if (globalRegistry.has(name)) {
    provider = globalRegistry.resolve(name, pc);
  } else {
    try {
      const mod = await import(`@apicenter/provider-${name}`);
      const Cls = (mod.default ?? Object.values(mod)[0]) as new (c: unknown) => SecretProvider;
      provider = new Cls(pc);
    } catch {
      throw new Error(
        `Provider '${name}' is not installed. Run: npm install @apicenter/provider-${name}`,
      );
    }
  }

  return { provider, config };
}

/** Build tool handlers for a given project directory — exported for testing */
export function buildToolHandlers(cwd: string) {
  return {
    async list_secrets({ env }: { env?: string }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      const secrets = await provider.pullAll(targetEnv);
      const keys = Object.keys(secrets);
      return {
        content: [
          {
            type: 'text' as const,
            text:
              keys.length === 0
                ? `No secrets found in '${targetEnv}' environment.`
                : `Found ${keys.length} secrets in '${targetEnv}':\n${keys.map((k) => `  - ${k}`).join('\n')}`,
          },
        ],
      };
    },

    async get_secret({
      key,
      env,
      show_value,
    }: {
      key: string;
      env?: string;
      show_value?: boolean;
    }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      const value = await provider.getSecret(key, targetEnv);

      if (value === undefined) {
        return {
          content: [{ type: 'text' as const, text: `Secret '${key}' not found in '${targetEnv}'.` }],
        };
      }

      const display = show_value
        ? value
        : `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 4, 20))}`;
      return {
        content: [
          {
            type: 'text' as const,
            text: `${key} = ${display}${!show_value ? '\n\n(Use show_value: true to reveal the full value)' : ''}`,
          },
        ],
      };
    },

    async set_secret({
      key,
      value,
      env,
    }: {
      key: string;
      value: string;
      env?: string;
    }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      await provider.setSecret(key, value, targetEnv);
      return {
        content: [
          { type: 'text' as const, text: `✅ Set '${key}' in '${targetEnv}' environment.` },
        ],
      };
    },

    async pull_secrets({
      env,
      output_path,
    }: {
      env?: string;
      output_path?: string;
    }): Promise<ToolResult> {
      const { provider, config } = await resolveProvider(cwd);
      const targetEnv = env ?? config.default_env ?? 'dev';
      const secrets = await provider.pullAll(targetEnv);
      const count = Object.keys(secrets).length;
      const outPath = join(cwd, output_path ?? config.output?.path ?? '.env.local');
      const content = Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
      writeFileSync(outPath, content);
      return {
        content: [{ type: 'text' as const, text: `✅ Pulled ${count} secrets to ${outPath}` }],
      };
    },

    async scan_project(_args: Record<string, unknown>): Promise<ToolResult> {
      const result = await scanDirectory({ cwd });
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Found ${result.uniqueKeys.length} unique environment variables in ${result.fileCount} files:\n` +
              result.uniqueKeys.map((k) => `  - ${k}`).join('\n'),
          },
        ],
      };
    },
  };
}

/** Start the MCP server (stdio transport) */
export async function startServer(cwd: string): Promise<void> {
  const handlers = buildToolHandlers(cwd);

  const server = new McpServer({
    name: 'apicenter',
    version: '0.1.0',
  });

  server.tool(
    'list_secrets',
    'List all secret keys from the configured provider (values are NOT returned for security)',
    { env: z.string().optional().describe('Environment name (e.g., dev, staging, prod)') },
    async (args) => handlers.list_secrets(args),
  );

  server.tool(
    'get_secret',
    'Get the value of a specific secret. Values are masked by default.',
    {
      key: z.string().describe('Secret key name (e.g., DATABASE_URL)'),
      env: z.string().optional().describe('Environment name'),
      show_value: z
        .boolean()
        .optional()
        .describe('Set true to show the actual value (default: false)'),
    },
    async (args) => handlers.get_secret(args),
  );

  server.tool(
    'set_secret',
    'Set or update a secret value in the configured provider',
    {
      key: z.string().describe('Secret key name'),
      value: z.string().describe('Secret value'),
      env: z.string().optional().describe('Environment name'),
    },
    async (args) => handlers.set_secret(args),
  );

  server.tool(
    'pull_secrets',
    'Pull all secrets from the provider and save to a local .env file',
    {
      env: z.string().optional().describe('Environment name'),
      output_path: z.string().optional().describe('Output file path (default: .env.local)'),
    },
    async (args) => handlers.pull_secrets(args),
  );

  server.tool(
    'scan_project',
    'Scan the project source code to find all environment variable references',
    {},
    async (args) => handlers.scan_project(args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('apicenter MCP server running on stdio\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(process.cwd()).catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
