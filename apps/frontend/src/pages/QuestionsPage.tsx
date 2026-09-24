import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Search, ChevronLeft, ChevronRight, FileQuestion } from 'lucide-react';

const STATUS_OPTIONS = ['', 'DRAFT', 'VALIDATING', 'VALIDATED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'FAILED'];
const TYPE_OPTIONS = ['', 'DSA', 'OOPS', 'SQL', 'SYSTEM_DESIGN', 'CONCEPTUAL'];
const DIFF_OPTIONS = ['', 'EASY', 'MEDIUM', 'HARD'];

export default function QuestionsPage() {
  const [filters, setFilters] = useState({ status: '', type: '', difficulty: '', search: '', page: 1 });

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

  const questions = (data?.questions ?? []).filter((q: any) => {
    if (!filters.search) return true;
    return q.title.toLowerCase().includes(filters.search.toLowerCase()) ||
           (q.topic && q.topic.toLowerCase().includes(filters.search.toLowerCase()));
  });
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.ceil(total / 20) || 1;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Console</span> / <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Repository</span>
          </div>
          <h1 style={{ margin: 0 }}>Question Bank</h1>
          <p style={{ margin: 0, marginTop: 4 }}>
            {total.toLocaleString()} validated technical questions stored across your organization.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="badge-live">
            <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
            VERIFIED REPOSITORY
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Filter Bar Card */}
        <div className="card animate-fade-in animate-delay-1" style={{ marginBottom: 24, padding: '16px 20px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                placeholder="Filter by title or topic..."
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                style={{ paddingLeft: 36, height: 38 }}
              />
            </div>

            {/* Filter Dropdowns */}
            {[
              { key: 'status', options: STATUS_OPTIONS, placeholder: 'All Statuses' },
              { key: 'type', options: TYPE_OPTIONS, placeholder: 'All Question Types' },
              { key: 'difficulty', options: DIFF_OPTIONS, placeholder: 'All Difficulties' },
            ].map(f => (
              <div key={f.key} style={{ minWidth: 150 }}>
                <select
                  className="form-select"
                  style={{ height: 38 }}
                  value={filters[f.key as keyof typeof filters] as string}
                  onChange={e => setFilters(prev => ({ ...prev, [f.key]: e.target.value, page: 1 }))}
                >
                  <option value="">{f.placeholder}</option>
                  {f.options.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}

            {(filters.status || filters.type || filters.difficulty || filters.search) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setFilters({ status: '', type: '', difficulty: '', search: '', page: 1 })}
                style={{ height: 38 }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Table of Questions */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
            ))}
          </div>
        ) : (
          <>
            <div className="table-wrapper animate-fade-in animate-delay-2">
              <table>
                <thead>
                  <tr>
                    <th>Title & Specification</th>
                    <th>Type</th>
                    <th>Difficulty</th>
                    <th>Topic Domain</th>
                    <th>Validation Status</th>
                    <th>Version</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 56, color: 'var(--text-muted)' }}>
                        <FileQuestion size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>No matching questions found</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Try clearing or relaxing your active search filters.</div>
                      </td>
                    </tr>
                  ) : questions.map((q: any) => (
                    <tr key={q.id}>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          ID: {q.id.slice(0, 8)}…
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${q.type.toLowerCase()}`}>
                          {q.type}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${q.difficulty.toLowerCase()}`}>
                          {q.difficulty}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {q.topic || 'General'}
                      </td>
                      <td>
                        <span className={`badge badge-${q.status.toLowerCase()}`}>
                          {q.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        v{q.version}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(q.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 24,
              padding: '0 4px'
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Page {filters.page} of {totalPages} ({total} total questions)
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={filters.page === 1}
                  onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={filters.page >= totalPages}
                  onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
