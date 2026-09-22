import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Wand2, FileQuestion, ClipboardCheck,
  BookOpen, BarChart3, Settings, LogOut, ShieldCheck
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
  { to: '/dashboard/admin', icon: Settings, label: 'Admin' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="Question Forge Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
          <div>
            <h2 style={{ margin: 0 }}>Question Forge</h2>
            <span style={{ margin: 0, marginTop: 4 }}>Enterprise Edition</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}

          {user?.role === 'ADMIN' && (
            <>
              <div className="nav-section-label" style={{ marginTop: 12 }}>Admin</div>
              {adminItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={11} />
              {user?.role}
            </div>
          </div>
          <button className="nav-item" onClick={logout} style={{ color: 'var(--color-error)' }}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
