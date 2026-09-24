import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Wand2, FileQuestion, ClipboardCheck,
  BookOpen, BarChart3, Settings, LogOut, ShieldCheck, Activity
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/dashboard/generate', icon: Wand2, label: 'Generate' },
  { to: '/dashboard/questions', icon: FileQuestion, label: 'Question Bank' },
  { to: '/dashboard/review', icon: ClipboardCheck, label: 'Review Queue' },
  { to: '/dashboard/papers', icon: BookOpen, label: 'Papers' },
  { to: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
];

const adminItems = [
  { to: '/dashboard/admin', icon: Settings, label: 'Admin & Queues' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        {/* Brand Header */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              position: 'relative',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(244,63,94,0.3) 0%, rgba(139,92,246,0.3) 100%)',
              border: '1px solid rgba(244,63,94,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(244,63,94,0.25)',
              overflow: 'hidden'
            }}>
              <img
                src="/logo.png"
                alt="Question Forge Logo"
                style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }}
              />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>Question Forge</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
                <span style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Enterprise v1.2</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          <div className="nav-section-label">Core Platform</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {user?.role === 'ADMIN' && (
            <>
              <div className="nav-section-label" style={{ marginTop: 16 }}>Infrastructure</div>
              {adminItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Engine Telemetry Widget */}
        <div style={{
          padding: '12px 14px',
          margin: '0 12px 8px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          fontSize: 11,
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Activity size={12} color="var(--color-primary)" />
              Engine Status
            </span>
            <span className="badge-live" style={{ padding: '1px 6px', fontSize: 10 }}>ONLINE</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            BullMQ 7.x • Piston Sandboxes
          </div>
        </div>

        {/* User Profile & Sign Out */}
        <div style={{
          padding: '16px 14px',
          borderTop: '1px solid var(--border-light)',
          background: 'rgba(7, 10, 18, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#ffffff',
              boxShadow: '0 0 12px rgba(244,63,94,0.3)'
            }}>
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'Administrator'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={11} color="var(--color-primary)" />
                {user?.role || 'ADMIN'}
              </div>
            </div>
          </div>
          <button
            className="nav-item"
            onClick={logout}
            style={{
              color: 'var(--color-error)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(244, 63, 94, 0.06)',
              border: '1px solid rgba(244, 63, 94, 0.15)'
            }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
