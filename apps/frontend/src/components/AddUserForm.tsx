import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { UserPlus, AlertCircle } from 'lucide-react';

/** Admin-only: creates a user in the admin's own organization. There is no public sign-up. */
export default function AddUserForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'REVIEWER' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => axios.post('/api/auth/register', form).then((r) => r.data),
    onSuccess: (data) => {
      setMessage({ ok: true, text: `Added ${data.user.email} as ${data.user.role}.` });
      setForm({ name: '', email: '', password: '', role: 'REVIEWER' });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => {
      const error = err?.response?.data?.error;
      setMessage({ ok: false, text: error?.issues?.[0] ? `${error.issues[0].path}: ${error.issues[0].message}` : error?.message ?? 'Could not add the user.' });
    },
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const ready = form.name.trim().length >= 2 && form.email.includes('@') && form.password.length >= 8;

  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Add a team member</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" aria-label="Name" placeholder="Name" style={{ flex: '1 1 140px' }} value={form.name} onChange={set('name')} />
        <input className="form-input" aria-label="Email" placeholder="Email" type="email" style={{ flex: '1 1 200px' }} value={form.email} onChange={set('email')} />
        <input className="form-input" aria-label="Temporary password" placeholder="Temporary password (8+ chars)" type="password" autoComplete="new-password" style={{ flex: '1 1 200px' }} value={form.password} onChange={set('password')} />
        <select className="form-select" aria-label="Role" style={{ width: 140 }} value={form.role} onChange={set('role')}>
          <option value="REVIEWER">Reviewer</option>
          <option value="GENERATOR">Generator</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button className="btn btn-primary btn-sm" disabled={!ready || mutation.isPending} onClick={() => mutation.mutate()}>
          <UserPlus size={14} /> Add
        </button>
      </div>
      {message && (
        <div className={`alert ${message.ok ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 12, marginBottom: 0 }}>
          <AlertCircle size={15} /> <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}
