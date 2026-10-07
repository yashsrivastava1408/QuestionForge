import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface Props {
  user: { id: string; email: string; isActive: boolean };
  isSelf: boolean;
  onError: (message: string | null) => void;
}

/** Per-row admin actions: deactivate / reactivate, and set a new password. */
export default function UserActions({ user, isSelf, onError }: Props) {
  const qc = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);

  const fail = (err: any) => onError(err?.response?.data?.error?.message ?? 'Request failed.');

  const status = useMutation({
    mutationFn: (isActive: boolean) => axios.patch(`/api/admin/users/${user.id}/status`, { isActive }),
    onSuccess: () => { onError(null); qc.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: fail,
  });

  const reset = useMutation({
    mutationFn: () => axios.post(`/api/admin/users/${user.id}/reset-password`, { newPassword }),
    onSuccess: () => { onError(null); setResetting(false); setNewPassword(''); setDone(true); },
    onError: fail,
  });

  if (resetting) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className="form-input"
          type="password"
          autoComplete="new-password"
          aria-label={`New password for ${user.email}`}
          placeholder="New password (8+)"
          style={{ width: 170, padding: '5px 10px', fontSize: 12 }}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" disabled={newPassword.length < 8 || reset.isPending} onClick={() => reset.mutate()}>
          Set
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => { setResetting(false); setNewPassword(''); }}>Cancel</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-secondary btn-sm" onClick={() => { setDone(false); setResetting(true); }}>
        Reset password
      </button>
      {!isSelf && (
        <button
          className={`btn btn-sm ${user.isActive ? 'btn-danger' : 'btn-success'}`}
          disabled={status.isPending}
          onClick={() => status.mutate(!user.isActive)}
        >
          {user.isActive ? 'Deactivate' : 'Reactivate'}
        </button>
      )}
      {done && <span style={{ fontSize: 12, color: 'var(--color-success)' }}>Password set — they were signed out.</span>}
    </div>
  );
}
