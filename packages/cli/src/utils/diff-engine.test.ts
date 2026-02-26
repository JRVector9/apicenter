import { describe, it, expect } from 'vitest';
import { computeDiff } from './diff-engine.js';

describe('computeDiff', () => {
  it('remote에만 있는 키는 added로 분류해야 한다', () => {
    const result = computeDiff({}, { NEW_KEY: 'value' });
    expect(result.find((d) => d.key === 'NEW_KEY')?.status).toBe('added');
  });

  it('local에만 있는 키는 removed로 분류해야 한다', () => {
    const result = computeDiff({ OLD_KEY: 'value' }, {});
    expect(result.find((d) => d.key === 'OLD_KEY')?.status).toBe('removed');
  });

  it('값이 다른 키는 changed로 분류해야 한다', () => {
    const result = computeDiff({ HOST: 'localhost' }, { HOST: 'db.prod' });
    expect(result.find((d) => d.key === 'HOST')?.status).toBe('changed');
    expect(result.find((d) => d.key === 'HOST')?.localValue).toBe('localhost');
    expect(result.find((d) => d.key === 'HOST')?.remoteValue).toBe('db.prod');
  });

  it('값이 같은 키는 synced로 분류해야 한다', () => {
    const result = computeDiff({ KEY: 'same' }, { KEY: 'same' });
    expect(result.find((d) => d.key === 'KEY')?.status).toBe('synced');
  });

  it('빈 local과 remote는 빈 배열을 반환해야 한다', () => {
    expect(computeDiff({}, {})).toEqual([]);
  });
});
