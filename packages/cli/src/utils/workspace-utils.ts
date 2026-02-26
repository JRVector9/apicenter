import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateConfig } from './config-generator.js';
import { parseConfig, globalRegistry } from '@apicenter/core';
import { DotenvProvider } from '@apicenter/provider-dotenv';
import type { SecretProvider } from '@apicenter/core';

// Register dotenv provider in global registry (mirror of base-command.ts)
globalRegistry.register('dotenv', (config) =>
  new DotenvProvider({ path: (config['path'] as string) ?? '.env' }),
);

export const PROJECT_MARKERS = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'Dockerfile',
] as const;

export const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '__pycache__',
  'venv',
  '.venv',
  '.next',
  'build',
  'target',
]);

/**
 * Find all project directories under baseDir up to maxDepth levels deep.
 * A directory is considered a project if it contains at least one PROJECT_MARKERS file.
 * Once a project is found, its subdirectories are not searched (to prevent nesting).
 */
export function findProjectDirectories(baseDir: string, maxDepth = 2): string[] {
  const results: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    const hasMarker = PROJECT_MARKERS.some((marker) => existsSync(join(dir, marker)));
    if (hasMarker) {
      results.push(dir);
      return; // do not descend further into this project
    }

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  walk(baseDir, 1);
  return results;
}

/**
 * Find directories that already have an apicenter.yaml file.
 * Used by workspace:pull to locate initialized projects.
 */
export function findInitializedDirectories(baseDir: string, maxDepth = 2): string[] {
  const all = findProjectDirectories(baseDir, maxDepth);
  return all.filter((dir) => existsSync(join(dir, 'apicenter.yaml')));
}

export interface BuildYamlOptions {
  provider: string;
  defaultEnv: string;
  sourcePath?: string;
  outputPath?: string;
}

/** Generate YAML config string using the shared config-generator utility. */
export function buildYamlContent(opts: BuildYamlOptions): string {
  return generateConfig({
    provider: opts.provider,
    defaultEnv: opts.defaultEnv,
    sourcePath: opts.sourcePath,
    outputPath: opts.outputPath,
  });
}

/**
 * Resolve a SecretProvider for a given project directory.
 * For dotenv providers the relative `config.path` is resolved to an absolute path
 * relative to projectDir so it works regardless of cwd.
 */
export async function resolveProviderForDir(
  configContent: string,
  projectDir: string,
): Promise<SecretProvider> {
  const config = parseConfig(configContent);
  const { name, config: providerConfig } = config.provider;
  const rawConfig = (providerConfig ?? {}) as Record<string, unknown>;

  // Resolve relative path references to absolute paths based on projectDir
  const resolvedConfig = { ...rawConfig };
  if (typeof resolvedConfig['path'] === 'string' && !resolve(resolvedConfig['path'] as string).startsWith('/')) {
    resolvedConfig['path'] = resolve(projectDir, resolvedConfig['path'] as string);
  } else if (typeof resolvedConfig['path'] === 'string') {
    // already absolute — keep as-is but still resolve relative to projectDir if not absolute
    const p = resolvedConfig['path'] as string;
    if (!p.startsWith('/')) {
      resolvedConfig['path'] = join(projectDir, p);
    }
  } else {
    // no explicit path, default to projectDir/.env
    resolvedConfig['path'] = join(projectDir, '.env');
  }

  if (globalRegistry.has(name)) {
    return globalRegistry.resolve(name, resolvedConfig);
  }

  // Dynamic import fallback
  try {
    const module = await import(`@apicenter/provider-${name}`);
    const ProviderClass = module.default ?? Object.values(module)[0];
    if (typeof ProviderClass === 'function') {
      return new ProviderClass(resolvedConfig) as SecretProvider;
    }
  } catch {
    // package not installed
  }

  throw new Error(
    `Provider '${name}'을 찾을 수 없습니다.\n` +
    `설치 후 다시 시도하세요: npm install @apicenter/provider-${name}`,
  );
}

/** Detect the best source env file in a project directory. */
export function detectSourcePath(projectDir: string): string {
  const candidates = ['.env', 'backend/.env', '.env.example'];
  for (const candidate of candidates) {
    if (existsSync(join(projectDir, candidate))) return candidate;
  }
  return '.env';
}
