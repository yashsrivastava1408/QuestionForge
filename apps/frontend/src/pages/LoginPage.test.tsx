import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import LoginPage from './LoginPage';
import { AuthProvider } from '../context/AuthContext';

vi.mock('axios');

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the sign-in form', () => {
    renderLoginPage();
    expect(screen.getByText('Question Forge')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('acme-corp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to console/i })).toBeInTheDocument();
  });

  it('fills the demo credentials when the autofill button is clicked', () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /autofill demo credentials/i }));

    expect(screen.getByPlaceholderText('acme-corp')).toHaveValue('acme-corp');
    expect(screen.getByPlaceholderText('admin@company.com')).toHaveValue('admin@demo.com');
  });

  it('submits the entered credentials to the login endpoint', async () => {
    (axios.post as any).mockResolvedValue({
      data: { token: 'jwt-token', user: { id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' } },
    });

    renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText('acme-corp'), { target: { value: 'my-org' } });
    fireEvent.change(screen.getByPlaceholderText('admin@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in to console/i }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'a@b.com',
        password: 'secret123',
        organizationSlug: 'my-org',
      })
    );
  });

  it('shows an error message when login fails', async () => {
    (axios.post as any).mockRejectedValue({ response: { data: { error: { message: 'Invalid credentials' } } } });

    renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText('acme-corp'), { target: { value: 'my-org' } });
    fireEvent.change(screen.getByPlaceholderText('admin@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in to console/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });
});
