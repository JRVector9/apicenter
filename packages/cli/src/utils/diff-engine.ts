import type { DiffEntry } from '@apicenter/core';

export function computeDiff(
  local: Record<string, string>,
  remote: Record<string, string>,
): DiffEntry[] {
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const result: DiffEntry[] = [];

  for (const key of allKeys) {
    const localVal = local[key];
    const remoteVal = remote[key];

    if (localVal === undefined && remoteVal !== undefined) {
      result.push({ key, status: 'added', remoteValue: remoteVal });
    } else if (localVal !== undefined && remoteVal === undefined) {
      result.push({ key, status: 'removed', localValue: localVal });
    } else if (localVal !== remoteVal) {
      result.push({ key, status: 'changed', localValue: localVal, remoteValue: remoteVal });
    } else {
      result.push({ key, status: 'synced', localValue: localVal });
    }
  }

  return result.sort((a, b) => a.key.localeCompare(b.key));
}
