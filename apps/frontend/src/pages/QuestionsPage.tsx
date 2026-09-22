import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Search, Filter } from 'lucide-react';

const STATUS_OPTIONS = ['', 'DRAFT', 'VALIDATING', 'VALIDATED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'FAILED'];
const TYPE_OPTIONS = ['', 'DSA', 'OOPS', 'SQL', 'SYSTEM_DESIGN', 'CONCEPTUAL'];
const DIFF_OPTIONS = ['', 'EASY', 'MEDIUM', 'HARD'];

export default function QuestionsPage() {
  const [filters, setFilters] = useState({ status: '', type: '', difficulty: '', page: 1 });

  const queryParams = new URLSearchParams();
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.type) queryParams.set('type', filters.type);
  if (filters.difficulty) queryParams.set('difficulty', filters.difficulty);
  queryParams.set('page', String(filters.page));
  queryParams.set('limit', '20');

  const { data, isLoading } = useQuery({
    queryKey: ['questions', filters],
    queryFn: () => axios.get(`/api/questions?${queryParams}`).then(r => r.data),
  });

  const questions = data?.questions ?? [];
  const total = data?.pagination?.total ?? 0;

  return (
    <>
      <div className="page-header">
        <h1>📂 Question Bank</h1>
        <p>{total} total questions</p>
      </div>
      <div className="page-body">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Filter size={16} style={{ color: 'var(--color-text-muted)' }} />
            {[
              { key: 'status', options: STATUS_OPTIONS, placeholder: 'All Statuses' },
              { key: 'type', options: TYPE_OPTIONS, placeholder: 'All Types' },
              { key: 'difficulty', options: DIFF_OPTIONS, placeholder: 'All Difficulties' },
            ].map(f => (
              <select
                key={f.key}
                className="form-select"
                style={{ width: 160 }}
                value={filters[f.key as keyof typeof filters] as string}
                onChange={e => setFilters(prev => ({ ...prev, [f.key]: e.target.value, page: 1 }))}
              >
                <option value="">{f.placeholder}</option>
                {f.options.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(10)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 8 }} />)}
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Difficulty</th>
                    <th>Topic</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>No questions found.</td></tr>
                  ) : questions.map((q: any) => (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 500, maxWidth: 280 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                      </td>
                      <td><span className={`badge badge-${q.type.toLowerCase()}`}>{q.type}</span></td>
                      <td><span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span></td>
                      <td style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{q.topic}</td>
                      <td><span className={`badge badge-${q.status.toLowerCase()}`}>{q.status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>v{q.version}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(q.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary btn-sm" disabled={filters.page === 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>← Prev</button>
              <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
                Page {filters.page} of {Math.ceil(total / 20) || 1}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={filters.page * 20 >= total}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next →</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
