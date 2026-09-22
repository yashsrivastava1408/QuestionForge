/**
 * Ingestion Package — Question Scraping Adapters
 *
 * Supports ingesting questions from external platforms.
 * All adapters normalize output to the shared Question schema.
 *
 * Available adapters:
 *  - LeetCodeAdapter: Scrapes problem statements and metadata
 *  - GFGAdapter: GeeksForGeeks scraper
 *
 * Usage:
 *   const adapter = new LeetCodeAdapter();
 *   const question = await adapter.fetchQuestion('two-sum');
 */

export { LeetCodeAdapter } from './adapters/leetcode.js';
export { GFGAdapter } from './adapters/gfg.js';
