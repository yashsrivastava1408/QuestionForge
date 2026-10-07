import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import QuestionDetail, { validationSummary } from './QuestionDetail';
import { AuthProvider } from '../context/AuthContext';

vi.mock('axios');
vi.mock('../lib/jobStream', () => ({ followJob: vi.fn(() => () => {}) }));

const renderDetail = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <QuestionDetail id="q1" />
      </AuthProvider>
    </QueryClientProvider>
  );
};

const mcq = {
  id: 'q1', type: 'MCQ', status: 'VALIDATED', difficulty: 'EASY', title: 'Final methods',
  statement: 'Which keyword prevents overriding?', explanation: 'final does.',
  options: [{ id: 'A', text: 'static' }, { id: 'B', text: 'final' }], answer: 'B',
  optimalSolution: null, bruteForceSolution: null, testCases: null, validationAssets: null, sourcePlatform: 'generated',
  validationResult: { passed: true, method: 'llm_review', crossModel: false, details: 'Blind solve agreed with the key (B).' },
};

describe('validationSummary', () => {
  it('distinguishes executed validation from LLM review', () => {
    expect(validationSummary({ method: 'sandbox_differential', stats: { listedCases: 6, generatedCases: 10, sandboxRuns: 40 } }))
      .toEqual({ executed: true, label: 'Executed in sandbox: 16 inputs, 40 runs, checked against a brute-force oracle' });
    expect(validationSummary({ method: 'sandbox_sql' })?.executed).toBe(true);
    expect(validationSummary({ method: 'llm_review', crossModel: true })?.executed).toBe(false);
    expect(validationSummary({ method: 'llm_review', crossModel: false })?.label).toMatch(/same LLM that wrote it/);
    expect(validationSummary(null)).toBeNull();
  });
});

describe('QuestionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (axios.get as any).mockResolvedValue({ data: { question: mcq } });
  });

  it('shows the options, marks the correct one, and says honestly how it was validated', async () => {
    renderDetail();
    expect(await screen.findByText('Which keyword prevents overriding?')).toBeInTheDocument();
    expect(screen.getByText('correct answer').parentElement).toHaveTextContent('B) final');
    expect(screen.getByText(/Reviewed by the same LLM that wrote it/)).toBeInTheDocument();
  });

  it('sends only the changed fields and follows the re-validation job', async () => {
    (axios.patch as any).mockResolvedValue({ data: { question: { ...mcq, status: 'VALIDATING' }, revalidationJobId: 'job-9' } });
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));

    const answer = screen.getByDisplayValue('B');
    fireEvent.change(answer, { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/questions/q1', { answer: 'A' }));
    const { followJob } = await import('../lib/jobStream');
    await waitFor(() => expect(followJob).toHaveBeenCalledWith('job-9', null, expect.any(Function)));
  });

  it('refuses to submit invalid JSON', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const options = screen.getByDisplayValue(/"text": "static"/);
    fireEvent.change(options, { target: { value: '[{ broken' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('"Options" is not valid JSON.')).toBeInTheDocument();
    expect(axios.patch).not.toHaveBeenCalled();
  });

  it('offers "Generate & validate solutions" for an imported coding draft and warns about reuse rights', async () => {
    (axios.get as any).mockResolvedValue({
      data: { question: { ...mcq, type: 'DSA', status: 'DRAFT', options: null, answer: null, validationResult: null, sourcePlatform: 'leetcode' } },
    });
    (axios.post as any).mockResolvedValue({ data: { jobId: 'job-3' } });
    renderDetail();

    expect(await screen.findByText(/Imported from leetcode/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /generate & validate solutions/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/questions/q1/complete', {}));
  });
});
