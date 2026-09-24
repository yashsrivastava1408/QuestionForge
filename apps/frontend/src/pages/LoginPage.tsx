import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Mail, Lock, Building2, ArrowRight, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', orgSlug: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password, form.orgSlug);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setForm({
      orgSlug: 'acme-corp',
      email: 'admin@demo.com',
      password: 'password123'
    });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <div style={{
            position: 'relative',
            width: 58,
            height: 58,
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(244,63,94,0.35) 0%, rgba(139,92,246,0.3) 100%)',
            border: '1px solid rgba(244,63,94,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(244,63,94,0.35)'
          }}>
            <img src="/logo.png" alt="Question Forge Logo" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} />
          </div>

          <div style={{ textAlign: 'center' }}>
            <h1>Question Forge</h1>
            <p>Enterprise Technical Assessment Console</p>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={13} color="var(--color-primary)" />
              Organization Slug
            </label>
            <input
              className="form-input"
              type="text"
              placeholder="acme-corp"
              value={form.orgSlug}
              onChange={e => setForm(f => ({ ...f, orgSlug: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={13} color="var(--color-primary)" />
              Email Address
            </label>
            <input
              className="form-input"
              type="email"
              placeholder="admin@company.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={13} color="var(--color-primary)" />
              Password
            </label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 12, height: 46 }}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : (
              <>
                <span>Sign In to Console</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fillDemo}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20 }}
          >
            <Sparkles size={13} color="#f43f5e" />
            <span>Autofill Demo Credentials</span>
          </button>
        </div>

        <div style={{
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
          marginTop: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}>
          <ShieldCheck size={14} color="#10b981" />
          <span>Zero-Knowledge BYOK • End-to-End Encrypted</span>
        </div>
      </div>
    </div>
  );
}
