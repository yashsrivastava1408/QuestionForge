/**
 * A real, correct coding problem (maximum subarray sum) used by tests that
 * execute code for real. `n` goes up to 200000, so the O(n^2) brute force
 * cannot finish the "large" input in 3 seconds while Kadane's is instant.
 */
export const STATEMENT = `Given an array of n integers, print the largest sum of any non-empty contiguous subarray.

Input
The first line contains n. The second line contains n space-separated integers a_i.

Output
Print one integer: the maximum subarray sum.

Constraints
1 <= n <= 200000, -10^9 <= a_i <= 10^9

Examples
Input:
5
1 -2 3 4 -1
Output:
7`;

export const OPTIMAL: Record<string, string> = {
  python: `import sys
def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    best = cur = int(data[1])
    for i in range(2, n + 1):
        x = int(data[i])
        cur = x if cur < 0 else cur + x
        if cur > best:
            best = cur
    print(best)
main()
`,
  javascript: `const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);
const n = Number(data[0]);
let best = BigInt(data[1]), cur = best;
for (let i = 2; i <= n; i++) {
  const x = BigInt(data[i]);
  cur = cur < 0n ? x : cur + x;
  if (cur > best) best = cur;
}
console.log(best.toString());
`,
  cpp: `#include <iostream>
#include <vector>
int main() {
    std::ios::sync_with_stdio(false);
    int n; std::cin >> n;
    long long best = 0, cur = 0;
    for (int i = 0; i < n; i++) {
        long long x; std::cin >> x;
        cur = (i == 0 || cur < 0) ? x : cur + x;
        if (i == 0 || cur > best) best = cur;
    }
    std::cout << best << "\\n";
}
`,
  java: `import java.io.*;
import java.util.*;
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        StringTokenizer st = new StringTokenizer(br.readLine());
        long best = 0, cur = 0;
        for (int i = 0; i < n; i++) {
            long x = Long.parseLong(st.nextToken());
            cur = (i == 0 || cur < 0) ? x : cur + x;
            if (i == 0 || cur > best) best = cur;
        }
        System.out.println(best);
    }
}
`,
};

export const BRUTE: Record<string, string> = {
  python: `import sys
def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:n + 1]]
    best = a[0]
    for i in range(n):
        s = 0
        for j in range(i, n):
            s += a[j]
            if s > best:
                best = s
    print(best)
main()
`,
  javascript: `const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);
const n = Number(data[0]);
const a = data.slice(1, n + 1).map(BigInt);
let best = a[0];
for (let i = 0; i < n; i++) {
  let s = 0n;
  for (let j = i; j < n; j++) { s += a[j]; if (s > best) best = s; }
}
console.log(best.toString());
`,
  cpp: `#include <iostream>
#include <vector>
int main() {
    int n; std::cin >> n;
    std::vector<long long> a(n);
    for (auto &x : a) std::cin >> x;
    long long best = a[0];
    for (int i = 0; i < n; i++) { long long s = 0; for (int j = i; j < n; j++) { s += a[j]; if (s > best) best = s; } }
    std::cout << best << "\\n";
}
`,
  java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        long[] a = new long[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextLong();
        long best = a[0];
        for (int i = 0; i < n; i++) { long s = 0; for (int j = i; j < n; j++) { s += a[j]; if (s > best) best = s; } }
        System.out.println(best);
    }
}
`,
};

/** Classic bug: resets to 0, so an all-negative array wrongly yields 0. */
export const BUGGY_OPTIMAL_PYTHON = `import sys
def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    best = cur = 0
    for i in range(1, n + 1):
        cur = max(0, cur + int(data[i]))
        best = max(best, cur)
    print(best)
main()
`;

export const GENERATOR = `import sys, random
seed, mode = sys.stdin.readline().split()
random.seed(int(seed))
if mode == 'small':
    n = random.randint(1, 8)
    a = [random.randint(-5, 5) for _ in range(n)]
elif mode == 'edge':
    shape = int(seed) % 4
    if shape == 0:
        a = [random.randint(-10**9, 10**9)]
    elif shape == 1:
        a = [-random.randint(1, 10**9) for _ in range(random.randint(2, 6))]
    elif shape == 2:
        a = [10**9] * 6
    else:
        a = [0] * 5
else:
    n = 200000
    a = [random.randint(-10**9, 10**9) for _ in range(n)]
print(len(a))
print(' '.join(map(str, a)))
`;

/** "large" mode that is not large at all — the brute force sails through it. */
export const WEAK_GENERATOR = GENERATOR.replace('n = 200000', 'n = 50');

export const TEST_CASES = [
  { input: '5\n1 -2 3 4 -1\n', expectedOutput: '7', label: 'Statement example', isSample: true },
  { input: '1\n-5\n', expectedOutput: '-5', label: 'edge: single negative', isEdgeCase: true },
  { input: '3\n-3 -1 -2\n', expectedOutput: '-1', label: 'edge: all negative', isEdgeCase: true },
  { input: '4\n2 2 2 2\n', expectedOutput: '8', label: 'all positive' },
  { input: '6\n-1 4 -1 4 -1 4\n', expectedOutput: '10', label: 'alternating' },
  { input: '2\n1000000000 1000000000\n', expectedOutput: '2000000000', label: 'edge: overflow 32-bit', isEdgeCase: true },
];

/** A complete draft in the JSON shape the generator model is asked to produce. */
export function maxSubarrayDraft(languages: string[] = ['python']) {
  const pick = (m: Record<string, string>) => Object.fromEntries(languages.map((l) => [l, m[l]]));
  return {
    title: 'Maximum Subarray Sum',
    statement: STATEMENT,
    topic: 'Arrays',
    tags: ['arrays', 'kadane'],
    optimalSolution: pick(OPTIMAL),
    bruteForceSolution: pick(BRUTE),
    testCases: TEST_CASES,
    inputGenerator: GENERATOR,
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(1)',
    bruteForceComplexity: 'O(n^2)',
    explanation: "Kadane's algorithm: extend the running sum or restart at the current element.",
  };
}
