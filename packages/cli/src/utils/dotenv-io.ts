import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function writeDotenvFile(
  path: string,
  secrets: Record<string, string>,
): void {
  const lines = Object.entries(secrets).map(([k, v]) => {
    const needsQuote = /[\s#"'\\]/.test(v);
    const formatted = needsQuote ? `"${v.replace(/"/g, '\\"')}"` : v;
    return `${k}=${formatted}`;
  });
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

export function readDotenvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}
