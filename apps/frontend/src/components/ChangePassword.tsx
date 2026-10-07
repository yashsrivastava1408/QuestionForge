import { useState } from 'react';
import axios from 'axios';
import { KeyRound, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Sidebar entry that opens a small dialog for changing your own password. */
export default function ChangePassword() {
  const { replaceToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const mismatch = form.confirm !== '' && form.newPassword !== form.confirm;
  const ready = form.currentPassword !== '' && form.newPassword.length >= 8 && form.newPassword === form.confirm;

  const close = () => {
    setOpen(false);
    setForm({ currentPassword: '', newPassword: '', confirm: '' });
    setMessage(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await axios.post('/api/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // The old token was just retired server-side; keep this session alive with the new one.
      replaceToken(data.token);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setMessage({ ok: true, text: 'Password changed. Your other sessions were signed out.' });
    } catch (err: any) {
      const error = err?.response?.data?.error;
      setMessage({ ok: false, text: error?.issues?.[0]?.message ?? error?.message ?? 'Could not change the password.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className="nav-item" onClick={() => setOpen(true)} style={{ padding: '8px 10px', marginBottom: 8 }}>
        <KeyRound size={15} />
        <span>Change Password</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Change password"
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <form className="card" onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="card-title" style={{ margin: 0 }}>Change password</div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={close} aria-label="Close"><X size={14} /></button>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cp-current">Current password</label>
              <input id="cp-current" className="form-input" type="password" autoComplete="current-password" value={form.currentPassword}
                onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cp-new">New password (8+ characters)</label>
              <input id="cp-new" className="form-input" type="password" autoComplete="new-password" value={form.newPassword}
                onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cp-confirm">Repeat new password</label>
              <input id="cp-confirm" className="form-input" type="password" autoComplete="new-password" value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
              {mismatch && <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 6 }}>The two passwords do not match.</div>}
            </div>

            {message && (
              <div className={`alert ${message.ok ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>
                <AlertCircle size={15} /> <span>{message.text}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={!ready || saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
