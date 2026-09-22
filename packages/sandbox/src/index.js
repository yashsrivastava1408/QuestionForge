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
export const SUPPORTED_LANGUAGES = ['python', 'java', 'cpp', 'javascript', 'typescript', 'go', 'rust', 'c'];
export { executeSandbox } from './pistonClient.js';
//# sourceMappingURL=index.js.map