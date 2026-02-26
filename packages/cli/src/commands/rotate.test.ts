import { describe, it, expect } from 'vitest';

describe('rotate command helpers', () => {
  it('generateSecret produces a string of the requested length', async () => {
    const { generateSecret } = await import('./rotate.js');
    const s = generateSecret(32);
    expect(typeof s).toBe('string');
    expect(s.length).toBe(32);
  });

  it('generateSecret produces different values each time', async () => {
    const { generateSecret } = await import('./rotate.js');
    const s1 = generateSecret(16);
    const s2 = generateSecret(16);
    expect(s1).not.toBe(s2);
  });

  it('generateSecret uses only base64url characters', async () => {
    const { generateSecret } = await import('./rotate.js');
    const s = generateSecret(64);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
