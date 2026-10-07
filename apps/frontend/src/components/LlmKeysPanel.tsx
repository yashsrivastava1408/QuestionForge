import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProviderInfo {
  provider: 'anthropic' | 'openai' | 'gemini';
  model: string;
  configured: boolean;
  source: 'org' | 'env' | null;
  last4: string | null;
}

const NAMES: Record<string, string> = { anthropic: 'Anthropic Claude', openai: 'OpenAI', gemini: 'Google Gemini' };

/** Per-organization LLM API keys (bring your own key). Keys are write-only: the server never sends one back. */
export default function LlmKeysPanel() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['llm-keys'],
    queryFn: () => axios.get('/api/admin/llm-keys').then((r) => r.data.providers as ProviderInfo[]),
  });

  const mutation = useMutation({
    mutationFn: (body: { provider: string; apiKey: string | null }) => axios.put('/api/admin/llm-keys', body),
    onSuccess: (_res, body) => {
      setDrafts((d) => ({ ...d, [body.provider]: '' }));
      setError(null);
      qc.invalidateQueries({ queryKey: ['llm-keys'] });
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message ?? 'Could not save the key.'),
  });

  const providers = data ?? [];
  const usable = providers.filter((p) => p.configured).length;

  return (
    <div className="card animate-fade-in animate-delay-1">
      <div className="card-title">
        <KeyRound size={16} style={{ display: 'inline', marginRight: 8 }} />
        LLM API Keys
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Add your organization's own key for a provider, or leave it empty to use the server-wide key if one is set.
        Keys are encrypted before they are stored and are never shown again.
      </p>

      {usable === 1 && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} />
          <span>
            Only one provider has a key. MCQ and system-design questions will be reviewed by the same model that wrote
            them. Add a second provider to get an independent reviewer.
          </span>
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} /> <span>{error}</span>
        </div>
      )}

      {providers.map((p) => (
        <div key={p.provider} style={{ padding: '14px 0', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{NAMES[p.provider]}</strong>
            <code style={{ fontSize: 12 }}>{p.model}</code>
            {p.configured ? (
              <span className="badge badge-approved" style={{ fontSize: 11 }}>
                <CheckCircle2 size={12} />{' '}
                {p.source === 'org' ? `Organization key ••••${p.last4}` : 'Using server-wide key'}
              </span>
            ) : (
              <span className="badge badge-alert" style={{ fontSize: 11 }}>No key</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              className="form-input"
              type="password"
              autoComplete="off"
              aria-label={`${NAMES[p.provider]} API key`}
              placeholder={p.source === 'org' ? 'Paste a new key to replace the current one' : 'Paste API key'}
              style={{ flex: 1, minWidth: 240 }}
              value={drafts[p.provider] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [p.provider]: e.target.value }))}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!(drafts[p.provider] ?? '').trim() || mutation.isPending}
              onClick={() => mutation.mutate({ provider: p.provider, apiKey: drafts[p.provider].trim() })}
            >
              Save key
            </button>
            {p.source === 'org' && (
              <button
                className="btn btn-secondary btn-sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ provider: p.provider, apiKey: null })}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
