import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Users,
  Shield,
  Activity,
  Webhook,
  Cpu,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  KeyRound,
} from 'lucide-react';
import LlmKeysPanel from '../components/LlmKeysPanel';
import AddUserForm from '../components/AddUserForm';
import UserActions from '../components/UserActions';
import { useAuth } from '../context/AuthContext';

interface IngestedQuestionPreview {
  title: string;
  statement: string;
  difficulty: string;
  topic: string;
  tags: string[];
  sourceUrl: string;
  sourcePlatform: string;
}

export default function AdminPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [userError, setUserError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'webhooks' | 'queues' | 'ingestion' | 'llm'>('users');

  // Ingestion tab state
  const [ingestPlatform, setIngestPlatform] = useState<'leetcode' | 'gfg'>('leetcode');
  const [ingestSlug, setIngestSlug] = useState('');
  const [ingestPreview, setIngestPreview] = useState<IngestedQuestionPreview[] | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Users query
  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => axios.get('/api/admin/users').then((r) => r.data.users),
    enabled: activeTab === 'users',
  });

  // Audit logs query
  const { data: auditData } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => axios.get('/api/admin/audit-logs?limit=30').then((r) => r.data),
    enabled: activeTab === 'audit',
  });

  // Webhook config query
  const { data: webhookConfig, refetch: refetchWebhook } = useQuery({
    queryKey: ['webhook-config'],
    queryFn: () => axios.get('/api/webhooks').then((r) => r.data),
    enabled: activeTab === 'webhooks',
  });

  // BullMQ queue stats query (auto-refreshing every 5 seconds when tab is active)
  const {
    data: queueStats,
    isFetching: isFetchingQueues,
    refetch: refetchQueues,
  } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => axios.get('/api/admin/queues/stats').then((r) => r.data),
    enabled: activeTab === 'queues',
    refetchInterval: activeTab === 'queues' ? 5000 : false,
  });

  // Role change mutation
  const roleChangeMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      axios.patch(`/api/admin/users/${id}/role`, { role }),
    onSuccess: () => { setUserError(null); qc.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: (err: any) => setUserError(err?.response?.data?.error?.message ?? 'Could not change the role.'),
  });

  // Configure webhook mutation
  const webhookMutation = useMutation({
    mutationFn: () => axios.post('/api/webhooks/configure', { webhookUrl }),
    onSuccess: (data) => {
      setWebhookSecret(data.data.webhookSecret);
      refetchWebhook();
    },
  });

  // Test webhook mutation
  const testWebhookMutation = useMutation({
    mutationFn: () => axios.post('/api/webhooks/test'),
    onSuccess: (data) => setTestResult({ success: true, message: data.data.message }),
    onError: (err: any) =>
      setTestResult({
        success: false,
        message: err.response?.data?.error?.message ?? 'Failed to send test webhook',
      }),
  });

  // Preview a single question from LeetCode/GFG without saving it
  const previewMutation = useMutation({
    mutationFn: () =>
      axios.post('/api/ingestion/fetch', { platform: ingestPlatform, slug: ingestSlug, save: false }),
    onSuccess: (data) => {
      setIngestPreview([data.data.question]);
      setIngestError(null);
    },
    onError: (err: any) => {
      setIngestPreview(null);
      setIngestError(err.response?.data?.error?.message ?? 'Failed to fetch question.');
    },
  });

  // Save the previewed question as a DRAFT in the question bank
  const saveIngestedMutation = useMutation({
    mutationFn: () =>
      axios.post('/api/ingestion/fetch', { platform: ingestPlatform, slug: ingestSlug, save: true }),
    onSuccess: () => {
      setIngestPreview(null);
      setIngestSlug('');
      qc.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err: any) =>
      setIngestError(err.response?.data?.error?.message ?? 'Failed to save question.'),
  });

  /**
   * Opens the Bull Board UI with a one-time ticket. The tab is opened first (inside
   * the click, so popup blockers allow it) and pointed at the ticket URL once the
   * API returns it — the login token itself never goes into a URL.
   */
  const openBullBoard = async () => {
    const tab = window.open('', '_blank');
    try {
      const { data } = await axios.post('/api/admin/queues/ticket');
      if (tab) tab.location.href = data.url;
    } catch {
      tab?.close();
    }
  };

  const tabs = [
    { id: 'users', label: 'Team Members', icon: Users },
    { id: 'audit', label: 'Audit Trail', icon: Activity },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'queues', label: 'Queue Monitor', icon: Cpu },
    { id: 'ingestion', label: 'Import Questions', icon: Download },
    { id: 'llm', label: 'LLM Keys', icon: KeyRound },
  ] as const;

  return (
    <>
      <div className="page-header">
        <h1>Admin Panel</h1>
        <p>Manage users, audit trail, background queues, and ATS/LMS integrations.</p>
      </div>

      <div className="page-body">
        {/* Tab Bar */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 24,
            background: 'var(--color-bg-card)',
            padding: 4,
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            width: 'fit-content',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : ''}`}
              style={
                activeTab !== tab.id
                  ? { background: 'transparent', border: 'none', color: 'var(--color-text-muted)' }
                  : {}
              }
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="card animate-fade-in animate-delay-1">
            <div className="card-title">
              <Users size={16} style={{ display: 'inline', marginRight: 8 }} />
              Team Members
            </div>
            {userError && <div className="alert alert-error" style={{ marginTop: 12 }}>{userError}</div>}
            <div className="table-wrapper" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Change Role</th>
                    <th>Account</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersData ?? []).map((u: any) => (
                    <tr key={u.id} style={{ opacity: u.isActive === false ? 0.55 : 1 }}>
                      <td style={{ fontWeight: 600 }}>
                        {u.name}
                        {u.isActive === false && <span className="badge badge-alert" style={{ marginLeft: 8, fontSize: 10 }}>Deactivated</span>}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{u.email}</td>
                      <td>
                        <span className="badge badge-dsa">{u.role}</span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ width: 130, padding: '5px 10px', fontSize: 12 }}
                          value={u.role}
                          onChange={(e) =>
                            roleChangeMutation.mutate({ id: u.id, role: e.target.value })
                          }
                        >
                          {['ADMIN', 'REVIEWER', 'GENERATOR'].map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <UserActions user={u} isSelf={u.email === currentUser?.email} onError={setUserError} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AddUserForm />
          </div>
        )}

        {activeTab === 'llm' && <LlmKeysPanel />}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <div className="card animate-fade-in animate-delay-2">
            <div className="card-title">
              <Activity size={16} style={{ display: 'inline', marginRight: 8 }} />
              Audit Trail
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Every action logged for security, compliance, and leak tracing.
            </p>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {(auditData?.logs ?? []).map((log: any) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ fontSize: 13 }}>{log.user?.name ?? 'System'}</td>
                      <td>
                        <span className="badge badge-dsa" style={{ fontSize: 10 }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {log.entityType ?? '—'}
                      </td>
                      <td
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {log.ipAddress ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <div className="card animate-fade-in animate-delay-3">
            <div className="card-title">
              <Webhook size={16} style={{ display: 'inline', marginRight: 8 }} />
              Webhook Integration (LMS / ATS)
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Automatically dispatch questions and review decisions to your external LMS or ATS
              (Greenhouse, Lever, Canvas). Outbound deliveries run via BullMQ with HMAC-SHA256 signatures
              and exponential retry backoff.
            </p>

            {/* Current Status Box */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Status</div>
                <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {webhookConfig?.configured ? (
                    <>
                      <CheckCircle2 size={16} color="var(--color-success, #10b981)" />
                      Configured: <code style={{ fontFamily: 'var(--font-mono)' }}>{webhookConfig.webhookUrl}</code>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} color="var(--color-text-muted)" />
                      Not configured
                    </>
                  )}
                </div>
              </div>

              {webhookConfig?.configured && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => testWebhookMutation.mutate()}
                  disabled={testWebhookMutation.isPending}
                >
                  {testWebhookMutation.isPending ? <span className="spinner" /> : <Send size={14} />}
                  Send Test Ping
                </button>
              )}
            </div>

            {testResult && (
              <div
                className={`alert ${testResult.success ? 'alert-success' : 'alert-error'}`}
                style={{ marginBottom: 20 }}
              >
                {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <div>{testResult.message}</div>
              </div>
            )}

            {webhookSecret && (
              <div className="alert alert-warning" style={{ marginBottom: 20 }}>
                <Shield size={14} />
                <div>
                  <strong>Save this HMAC secret now</strong> — it will not be displayed again.<br />
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{webhookSecret}</code>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Webhook Endpoint URL</label>
              <input
                className="form-input"
                type="url"
                placeholder="https://your-platform.com/webhooks/question-forge"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={() => webhookMutation.mutate()}
              disabled={!webhookUrl || webhookMutation.isPending}
            >
              {webhookMutation.isPending ? <span className="spinner" /> : <Webhook size={14} />}
              Save Configuration
            </button>
          </div>
        )}

        {/* Queues Tab */}
        {activeTab === 'queues' && (
          <div className="card animate-fade-in animate-delay-4">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div className="card-title" style={{ margin: 0 }}>
                <Cpu size={16} style={{ display: 'inline', marginRight: 8 }} />
                BullMQ Distributed Queue Monitor
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={openBullBoard}
                >
                  <ExternalLink size={13} /> Live Bull Board UI
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => refetchQueues()}
                  disabled={isFetchingQueues}
                >
                  <RefreshCw size={13} className={isFetchingQueues ? 'spinner' : ''} /> Refresh
                </button>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Live telemetry for background job workers. Generation and webhook deliveries run in isolated
              queues backed by Redis.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Generation Queue Card */}
              <div
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Queue: generation</span>
                  <span className="badge badge-dsa" style={{ fontSize: 10 }}>Concurrency: 5</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {queueStats?.queues?.generation?.counts?.active ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Active</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      {queueStats?.queues?.generation?.counts?.waiting ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Waiting</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>
                      {queueStats?.queues?.generation?.counts?.completed ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Completed</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>
                      {queueStats?.queues?.generation?.counts?.failed ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Failed</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>
                      {queueStats?.queues?.generation?.counts?.delayed ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Delayed</div>
                  </div>
                </div>
              </div>

              {/* Webhooks Queue Card */}
              <div
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Queue: webhooks</span>
                  <span className="badge badge-dsa" style={{ fontSize: 10 }}>Concurrency: 10</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {queueStats?.queues?.webhooks?.counts?.active ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Active</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      {queueStats?.queues?.webhooks?.counts?.waiting ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Waiting</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>
                      {queueStats?.queues?.webhooks?.counts?.completed ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Delivered</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>
                      {queueStats?.queues?.webhooks?.counts?.failed ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Failed</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--color-bg-card)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>
                      {queueStats?.queues?.webhooks?.counts?.delayed ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Retrying</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--color-text-muted)' }}>
              Telemetry timestamp: {queueStats?.timestamp ? new Date(queueStats.timestamp).toLocaleTimeString() : '—'} (Auto-refreshes every 5s)
            </div>
          </div>
        )}

        {/* Ingestion Tab */}
        {activeTab === 'ingestion' && (
          <div className="card animate-fade-in animate-delay-1">
            <div className="card-title">
              <Download size={16} style={{ display: 'inline', marginRight: 8 }} />
              Import Questions From LeetCode / GeeksforGeeks
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Pull a real problem statement by its URL slug and stage it as a <code>DRAFT</code> in
              the question bank. Imported questions have no solutions or tests yet — open the draft in
              the Question Bank and choose <strong>Generate &amp; validate solutions</strong>. The statement
              remains the property of its source platform: make sure you have the right to reuse it
              before putting it in an assessment.
            </p>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Platform</label>
                <select
                  className="form-select"
                  style={{ width: 160 }}
                  value={ingestPlatform}
                  onChange={(e) => setIngestPlatform(e.target.value as 'leetcode' | 'gfg')}
                >
                  <option value="leetcode">LeetCode</option>
                  <option value="gfg">GeeksforGeeks</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
                <label className="form-label">
                  {ingestPlatform === 'leetcode' ? 'Problem Slug (e.g. two-sum)' : 'Article Slug'}
                </label>
                <input
                  className="form-input"
                  placeholder={ingestPlatform === 'leetcode' ? 'two-sum' : 'find-missing-number'}
                  value={ingestSlug}
                  onChange={(e) => setIngestSlug(e.target.value)}
                />
              </div>

              <button
                className="btn btn-secondary"
                disabled={!ingestSlug || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                {previewMutation.isPending ? <span className="spinner" /> : <Download size={14} />}
                Preview
              </button>
            </div>

            {ingestError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                <AlertCircle size={14} />
                <div>{ingestError}</div>
              </div>
            )}

            {ingestPreview?.map((q) => (
              <div
                key={q.sourceUrl}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      <span className="badge badge-dsa" style={{ fontSize: 10, marginRight: 6 }}>{q.difficulty}</span>
                      {q.topic} · {q.tags.join(', ')}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={saveIngestedMutation.isPending}
                    onClick={() => saveIngestedMutation.mutate()}
                  >
                    {saveIngestedMutation.isPending ? <span className="spinner" /> : <CheckCircle2 size={14} />}
                    Save as Draft
                  </button>
                </div>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 12, whiteSpace: 'pre-wrap' }}>
                  {q.statement.length > 400 ? `${q.statement.slice(0, 400)}…` : q.statement}
                </p>
                <a
                  href={q.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <ExternalLink size={12} /> View original source
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
