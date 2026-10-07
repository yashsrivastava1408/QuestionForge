import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { AuthProvider } from '../context/AuthContext';
import PapersPage from './PapersPage';
import ReviewPage from './ReviewPage';
import ChangePassword from '../components/ChangePassword';
import JobHistory from '../components/JobHistory';
import GenerationInsights from '../components/GenerationInsights';
import UserActions from '../components/UserActions';

vi.mock('axios');
vi.mock('../lib/jobStream', () => ({ followJob: vi.fn(() => () => {}) }));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider>{ui}</AuthProvider></QueryClientProvider>);
};

/** Routes axios.get by URL prefix. */
const onGet = (routes: Record<string, unknown>) =>
  (axios.get as any).mockImplementation((url: string) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return key ? Promise.resolve({ data: routes[key] }) : Promise.reject(new Error(`unexpected GET ${url}`));
  });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('PapersPage', () => {
  const paper = { id: 'p1', title: 'Screening', createdAt: new Date().toISOString(), _count: { questions: 2 } };
  const routes = {
    '/api/papers/availability': { available: [{ type: 'DSA', difficulty: 'EASY', count: 3 }, { type: 'MCQ', difficulty: 'EASY', count: 1 }] },
    '/api/papers/p1': {
      paper: {
        ...paper,
        questions: [
          { questionId: 'q1', question: { title: 'First', type: 'DSA', difficulty: 'EASY' } },
          { questionId: 'q2', question: { title: 'Second', type: 'MCQ', difficulty: 'EASY' } },
        ],
      },
    },
    '/api/papers': { papers: [paper] },
  };

  it('exports with the formats the API actually accepts', async () => {
    onGet(routes);
    (axios.post as any).mockResolvedValue({ data: { downloadUrl: '/api/export/download/abc', expiresAt: new Date().toISOString() } });
    wrap(<PapersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /internal pdf/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/export', { paperId: 'p1', format: 'PDF_INTERNAL' }));
    expect((await screen.findByText(/Download Internal PDF/)).closest('a')).toHaveAttribute('href', '/api/export/download/abc');
  });

  it('shows why an export failed instead of failing silently', async () => {
    onGet(routes);
    (axios.post as any).mockRejectedValue({ response: { data: { error: { message: 'Export storage is not configured.' } } } });
    wrap(<PapersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^json$/i }));
    expect(await screen.findByText('Export storage is not configured.')).toBeInTheDocument();
  });

  it('builds a paper from a blueprint and blocks a row the bank cannot fill', async () => {
    onGet(routes);
    (axios.post as any).mockResolvedValue({ data: { paper } });
    wrap(<PapersPage />);

    await screen.findByText('3 approved available'); // default row: any-difficulty DSA
    fireEvent.change(screen.getByLabelText('Paper title'), { target: { value: 'October screen' } });

    const build = screen.getByRole('button', { name: /build paper/i });
    fireEvent.change(screen.getByLabelText('Row 1 count'), { target: { value: '5' } });
    expect(build).toBeDisabled(); // 5 wanted, 3 available
    expect(screen.getByText(/Not enough approved questions/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Row 1 count'), { target: { value: '3' } });
    fireEvent.click(build);
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('/api/papers/assemble', { title: 'October screen', blueprint: [{ count: 3, type: 'DSA' }] })
    );
  });

  it('reorders the questions of a paper', async () => {
    onGet(routes);
    (axios.patch as any).mockResolvedValue({ data: {} });
    wrap(<PapersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /arrange questions/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move question 1 down' }));
    await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/papers/p1', { questionIds: ['q2', 'q1'] }));
  });
});

describe('ReviewPage bulk actions', () => {
  it('approves the selected questions in one request and reports the result', async () => {
    onGet({
      '/api/questions': {
        questions: [
          { id: 'a', title: 'Alpha', type: 'DSA', difficulty: 'EASY', topic: 't', version: 1, createdAt: new Date().toISOString(), validationResult: { method: 'sandbox_differential', passed: true } },
          { id: 'b', title: 'Beta', type: 'MCQ', difficulty: 'EASY', topic: 't', version: 1, createdAt: new Date().toISOString(), validationResult: { method: 'llm_review', passed: true, crossModel: true } },
        ],
      },
    });
    (axios.post as any).mockResolvedValue({ data: { updated: 1, skipped: [] } });
    wrap(<ReviewPage />);

    // Each card says honestly how it was validated.
    expect(await screen.findByText('Verified by execution')).toBeInTheDocument();
    expect(screen.getByText('LLM-reviewed (not executed)')).toBeInTheDocument();

    const approve = screen.getByRole('button', { name: /approve selected/i });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Select Beta'));
    fireEvent.click(approve);

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/questions/review-bulk', { ids: ['b'], decision: 'APPROVED' }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 question approved.');
  });
});

describe('ChangePassword', () => {
  it('requires matching passwords, then swaps in the new session token', async () => {
    (axios.post as any).mockResolvedValue({ data: { token: 'fresh-token' } });
    wrap(<ChangePassword />);
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: /^change password$/i });
    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(within(dialog).getByLabelText(/New password/), { target: { value: 'new-password-1' } });
    fireEvent.change(within(dialog).getByLabelText('Repeat new password'), { target: { value: 'different' } });
    expect(within(dialog).getByText('The two passwords do not match.')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Repeat new password'), { target: { value: 'new-password-1' } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('/api/auth/change-password', { currentPassword: 'old-password', newPassword: 'new-password-1' })
    );
    expect(await within(dialog).findByText(/other sessions were signed out/)).toBeInTheDocument();
    expect(localStorage.getItem('qf_token')).toBe('fresh-token');
  });
});

describe('UserActions', () => {
  it('deactivates another user but offers no such button for yourself', async () => {
    (axios.patch as any).mockResolvedValue({ data: {} });
    const onError = vi.fn();
    const { rerender } = wrap(<UserActions user={{ id: 'u2', email: 'x@a.test', isActive: true }} isSelf={false} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/admin/users/u2/status', { isActive: false }));

    const qc = new QueryClient();
    rerender(<QueryClientProvider client={qc}><AuthProvider><UserActions user={{ id: 'u1', email: 'me@a.test', isActive: true }} isSelf onError={onError} /></AuthProvider></QueryClientProvider>);
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('surfaces the server reason when an action is refused', async () => {
    (axios.patch as any).mockRejectedValue({ response: { data: { error: { message: 'This is the only active admin.' } } } });
    const onError = vi.fn();
    wrap(<UserActions user={{ id: 'u2', email: 'x@a.test', isActive: true }} isSelf={false} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('This is the only active admin.'));
  });
});

describe('JobHistory', () => {
  it('lists jobs with a truthful state and opens one on request', async () => {
    const now = new Date().toISOString();
    onGet({
      '/api/generate/jobs': {
        jobs: [
          { id: 'j1', kind: 'GENERATE', total: 4, validated: 3, failed: 1, createdAt: now, finishedAt: now, cancelledAt: null, inputTokens: 900, outputTokens: 100, llmProvider: 'anthropic', questionTypes: ['DSA'] },
          { id: 'j2', kind: 'GENERATE', total: 2, validated: 0, failed: 2, createdAt: now, finishedAt: now, cancelledAt: now, inputTokens: 0, outputTokens: 0, llmProvider: 'anthropic', questionTypes: ['MCQ'] },
          { id: 'j3', kind: 'REVALIDATE', total: 1, validated: 0, failed: 0, createdAt: now, finishedAt: null, cancelledAt: null, inputTokens: 0, outputTokens: 0, llmProvider: null, questionTypes: null },
        ],
      },
    });
    const onSelect = vi.fn();
    wrap(<JobHistory activeJobId="j3" onSelect={onSelect} />);

    expect(await screen.findByText('Partly failed')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Showing' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0]);
    expect(onSelect).toHaveBeenCalledWith('j1');
  });
});

describe('GenerationInsights', () => {
  it('shows pass rate, cost per validated question and failure reasons', async () => {
    onGet({
      '/api/analytics/generation': {
        days: 30,
        totals: { requested: 10, validated: 7, failed: 3, passRate: 70, costUsd: 2.1, costPerValidatedUsd: 0.3 },
        byType: [{ type: 'DSA', total: 10, validated: 7, failed: 3, passRate: 70, avgAttempts: 1.6 }],
        byProvider: [{ provider: 'anthropic', inputTokens: 1, outputTokens: 1, costUsd: 2.1 }],
        failureReasons: [{ reason: 'Solutions failed sandbox testing', count: 2 }, { reason: 'Duplicate of an existing question', count: 1 }],
        humanReview: { approved: 3, rejected: 1 },
      },
    });
    wrap(<GenerationInsights />);

    expect(await screen.findAllByText('70%')).not.toHaveLength(0);
    expect(screen.getByText('$0.3000')).toBeInTheDocument();
    expect(screen.getByText('Solutions failed sandbox testing')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument(); // 3 of 4 human reviews approved
    expect(screen.getByText('1.6')).toBeInTheDocument();
  });

  it('says "unknown" rather than inventing a cost when no price is known', async () => {
    onGet({
      '/api/analytics/generation': {
        days: 30,
        totals: { requested: 2, validated: 2, failed: 0, passRate: 100, costUsd: null, costPerValidatedUsd: null },
        byType: [{ type: 'MCQ', total: 2, validated: 2, failed: 0, passRate: 100, avgAttempts: 1 }],
        byProvider: [], failureReasons: [], humanReview: { approved: 0, rejected: 0 },
      },
    });
    wrap(<GenerationInsights />);
    expect(await screen.findAllByText('unknown')).toHaveLength(2);
  });
});
