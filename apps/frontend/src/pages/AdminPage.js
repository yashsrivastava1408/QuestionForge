import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Users, Shield, Activity, Webhook } from 'lucide-react';
export default function AdminPage() {
    const qc = useQueryClient();
    const [webhookUrl, setWebhookUrl] = useState('');
    const [webhookSecret, setWebhookSecret] = useState('');
    const [activeTab, setActiveTab] = useState('users');
    const { data: usersData } = useQuery({
        queryKey: ['admin-users'],
        queryFn: () => axios.get('/api/admin/users').then(r => r.data.users),
    });
    const { data: auditData } = useQuery({
        queryKey: ['audit-logs'],
        queryFn: () => axios.get('/api/admin/audit-logs?limit=30').then(r => r.data),
        enabled: activeTab === 'audit',
    });
    const roleChangeMutation = useMutation({
        mutationFn: ({ id, role }) => axios.patch(`/api/admin/users/${id}/role`, { role }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    });
    const webhookMutation = useMutation({
        mutationFn: () => axios.post('/api/webhooks/configure', { webhookUrl }),
        onSuccess: (data) => setWebhookSecret(data.data.webhookSecret),
    });
    const tabs = [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'audit', label: 'Audit Logs', icon: Activity },
        { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    ];
    return (<>
      <div className="page-header">
        <h1>⚙️ Admin Panel</h1>
        <p>Manage users, audit logs, and integrations.</p>
      </div>
      <div className="page-body">
        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--color-bg-card)', padding: 4, borderRadius: 10, border: '1px solid var(--color-border)', width: 'fit-content' }}>
          {tabs.map(tab => (<button key={tab.id} className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : ''}`} style={activeTab !== tab.id ? { background: 'transparent', border: 'none', color: 'var(--color-text-muted)' } : {}} onClick={() => setActiveTab(tab.id)}>
              <tab.icon size={14}/> {tab.label}
            </button>))}
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (<div className="card animate-fade-in">
            <div className="card-title"><Users size={16} style={{ display: 'inline', marginRight: 8 }}/>Team Members</div>
            <div className="table-wrapper" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Change Role</th></tr></thead>
                <tbody>
                  {(usersData ?? []).map((u) => (<tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.name}</td>
                      <td style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{u.email}</td>
                      <td><span className="badge badge-dsa">{u.role}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        <select className="form-select" style={{ width: 130, padding: '5px 10px', fontSize: 12 }} value={u.role} onChange={e => roleChangeMutation.mutate({ id: u.id, role: e.target.value })}>
                          {['ADMIN', 'REVIEWER', 'GENERATOR'].map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>)}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (<div className="card animate-fade-in">
            <div className="card-title"><Activity size={16} style={{ display: 'inline', marginRight: 8 }}/>Audit Trail</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Every action logged for leak tracing and compliance.
            </p>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
                <tbody>
                  {(auditData?.logs ?? []).map((log) => (<tr key={log.id}>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ fontSize: 13 }}>{log.user?.name ?? 'System'}</td>
                      <td><span className="badge badge-dsa" style={{ fontSize: 10 }}>{log.action}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{log.entityType ?? '—'}</td>
                      <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{log.ipAddress ?? '—'}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>)}

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (<div className="card animate-fade-in">
            <div className="card-title"><Webhook size={16} style={{ display: 'inline', marginRight: 8 }}/>Webhook Configuration</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Auto-push approved questions to your LMS or ATS when a reviewer approves them.
            </p>
            {webhookSecret && (<div className="alert alert-warning" style={{ marginBottom: 20 }}>
                <Shield size={14}/>
                <div>
                  <strong>Save this secret now</strong> — it won't be shown again.<br />
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{webhookSecret}</code>
                </div>
              </div>)}
            <div className="form-group">
              <label className="form-label">Webhook URL</label>
              <input className="form-input" type="url" placeholder="https://your-platform.com/webhooks/question-forge" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}/>
            </div>
            <button className="btn btn-primary" onClick={() => webhookMutation.mutate()} disabled={!webhookUrl || webhookMutation.isPending}>
              {webhookMutation.isPending ? <span className="spinner"/> : <Webhook size={14}/>}
              Configure Webhook
            </button>
          </div>)}
      </div>
    </>);
}
//# sourceMappingURL=AdminPage.js.map