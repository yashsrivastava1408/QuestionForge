// Deterministic edge case generator based on topic
export function injectEdgeCases(testCases, topic) {
    const edgeCases = [];
    const topicLower = topic.toLowerCase();
    // Array-based problems
    if (topicLower.includes('array') || topicLower.includes('list') || topicLower.includes('subarray')) {
        edgeCases.push({ input: '[]', expectedOutput: '', label: 'Empty array', isEdgeCase: true }, { input: '[0]', expectedOutput: '', label: 'Single element', isEdgeCase: true }, { input: '[2147483647]', expectedOutput: '', label: 'Max integer', isEdgeCase: true }, { input: '[-2147483648]', expectedOutput: '', label: 'Min integer', isEdgeCase: true });
    }
    // String problems
    if (topicLower.includes('string') || topicLower.includes('palindrome') || topicLower.includes('anagram')) {
        edgeCases.push({ input: '""', expectedOutput: '', label: 'Empty string', isEdgeCase: true }, { input: '"a"', expectedOutput: '', label: 'Single character', isEdgeCase: true }, { input: '"aaaaaaaaaaaaaaaaaa"', expectedOutput: '', label: 'All same characters', isEdgeCase: true });
    }
    // Tree/Graph problems
    if (topicLower.includes('tree') || topicLower.includes('graph') || topicLower.includes('node')) {
        edgeCases.push({ input: 'null', expectedOutput: '', label: 'Null/empty tree', isEdgeCase: true }, { input: '[1]', expectedOutput: '', label: 'Single node', isEdgeCase: true });
    }
    // Number problems
    if (topicLower.includes('number') || topicLower.includes('integer') || topicLower.includes('math')) {
        edgeCases.push({ input: '0', expectedOutput: '', label: 'Zero', isEdgeCase: true }, { input: '-1', expectedOutput: '', label: 'Negative number', isEdgeCase: true }, { input: '2147483647', expectedOutput: '', label: 'Max int32', isEdgeCase: true });
    }
    // Merge edge cases with existing ones (mark them clearly, let sandbox determine expected output)
    return [...testCases, ...edgeCases.filter(ec => !testCases.some(tc => tc.input === ec.input))];
}
//# sourceMappingURL=edgeCaseService.js.map