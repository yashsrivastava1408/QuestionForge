/**
 * Sandbox Package
 *
 * Wraps the Piston execution engine for isolated, multi-language code execution.
 * Security guarantees:
 *  - Runs in a Docker container with no network access to the DB
 *  - Memory limited to 128MB per run
 *  - CPU time limited to 10 seconds per run
 *  - Non-root process execution
 */
export declare const SUPPORTED_LANGUAGES: readonly ["python", "java", "cpp", "javascript", "typescript", "go", "rust", "c"];
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export { executeSandbox } from './pistonClient.js';
//# sourceMappingURL=index.d.ts.map