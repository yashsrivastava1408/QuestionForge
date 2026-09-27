import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import AdminPage from './AdminPage';

vi.mock('axios');

function renderAdminPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminPage />
    </QueryClientProvider>
  );
}

const SAMPLE_QUESTION = {
  title: 'Two Sum',
  statement: 'Given an array of integers, return indices of the two numbers such that they add up to target.',
  difficulty: 'EASY',
  topic: 'Array',
  tags: ['Array', 'Hash Table'],
  sourceUrl: 'https://leetcode.com/problems/two-sum/',
  sourcePlatform: 'leetcode',
};

describe('AdminPage — Import Questions tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (axios.get as any).mockResolvedValue({ data: { users: [] } });
  });

  it('lets an admin preview and then save an ingested question', async () => {
    (axios.post as any).mockResolvedValueOnce({ data: { success: true, saved: false, question: SAMPLE_QUESTION } });
    renderAdminPage();

    fireEvent.click(screen.getByRole('button', { name: /import questions/i }));
    fireEvent.change(screen.getByPlaceholderText('two-sum'), { target: { value: 'two-sum' } });
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));

    expect(await screen.findByText('Two Sum')).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith('/api/ingestion/fetch', {
      platform: 'leetcode',
      slug: 'two-sum',
      save: false,
    });

    (axios.post as any).mockResolvedValueOnce({
      data: { success: true, saved: true, question: { id: 'q-1', ...SAMPLE_QUESTION, status: 'DRAFT' } },
    });
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenLastCalledWith('/api/ingestion/fetch', {
        platform: 'leetcode',
        slug: 'two-sum',
        save: true,
      })
    );
  });

  it('shows an error message when the preview fetch fails', async () => {
    (axios.post as any).mockRejectedValue({ response: { data: { error: { message: 'Could not fetch question' } } } });
    renderAdminPage();

    fireEvent.click(screen.getByRole('button', { name: /import questions/i }));
    fireEvent.change(screen.getByPlaceholderText('two-sum'), { target: { value: 'does-not-exist' } });
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));

    expect(await screen.findByText('Could not fetch question')).toBeInTheDocument();
  });
});
