import { describe, it, expect, vi, afterEach } from 'vitest';
import { GFGAdapter } from './gfg.js';

describe('GFGAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses title and statement out of the article HTML', async () => {
    const html = `
      <html><body>
        <h1>Find Missing Number</h1>
        <div class="entry-content">
          <p>Given an array of n distinct numbers.</p>
          <p>Find the one missing number.</p>
        </div>
      </body></html>
    `;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => html }) as any;

    const adapter = new GFGAdapter();
    const result = await adapter.fetchQuestion('find-missing-number');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Find Missing Number');
    expect(result!.statement).toContain('Given an array of n distinct numbers.');
    expect(result!.sourcePlatform).toBe('gfg');
    expect(result!.sourceUrl).toBe('https://www.geeksforgeeks.org/find-missing-number/');
  });

  it('returns null on a non-OK response instead of throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    const adapter = new GFGAdapter();
    expect(await adapter.fetchQuestion('missing-page')).toBeNull();
  });

  it('returns null instead of throwing on a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const adapter = new GFGAdapter();
    expect(await adapter.fetchQuestion('anything')).toBeNull();
  });
});
