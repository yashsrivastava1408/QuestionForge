import { useNavigate } from 'react-router-dom';
import { Github, Code2, ShieldCheck, Cpu, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', overflow: 'hidden', position: 'relative' }}>
      
      {/* Abstract Background Glows */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(225,29,72,0.15) 0%, transparent 60%)', filter: 'blur(60px)', zIndex: 0
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(225,29,72,0.1) 0%, transparent 60%)', filter: 'blur(60px)', zIndex: 0
      }} />

      {/* Navigation Bar */}
      <nav style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 48px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="Question Forge Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>Question Forge</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="btn btn-secondary" onClick={() => window.open('https://github.com/yashsrivastava1408/QuestionForge', '_blank')}>
            <Github size={16} /> Star on GitHub
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Sign In <ArrowRight size={16} />
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: 1200, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
        <div className="badge" style={{ background: 'rgba(225, 29, 72, 0.1)', color: 'var(--color-primary)', border: '1px solid rgba(225, 29, 72, 0.2)', padding: '6px 12px', marginBottom: 32, fontSize: 13, letterSpacing: '0.05em', borderRadius: 20 }}>
          OPEN SOURCE EDITION
        </div>
        
        <h1 style={{ fontSize: 'clamp(48px, 6vw, 72px)', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text-primary)', lineHeight: 1.1, marginBottom: 24 }}>
          The Enterprise-Grade <br />
          <span style={{ color: 'var(--color-primary)' }}>AI Validation Engine.</span>
        </h1>
        
        <p style={{ fontSize: 20, color: 'var(--text-secondary)', maxWidth: 640, margin: '0 auto 48px', lineHeight: 1.6, fontWeight: 400 }}>
          Generate, validate, and export technical interview questions with zero hallucinations. Powered by multi-agent adversarial debate and secure Piston sandboxes.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 80 }}>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/login')} style={{ fontSize: 16, padding: '0 32px', height: 48 }}>
            Start Generating
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => window.open('https://github.com/yashsrivastava1408/QuestionForge', '_blank')} style={{ fontSize: 16, padding: '0 32px', height: 48 }}>
            <Code2 size={20} style={{ marginRight: 8 }} /> Read the Docs
          </button>
        </div>

        {/* Feature Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, textAlign: 'left' }}>
          
          <div className="stat-card" style={{ padding: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(225, 29, 72, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 24px 0' }}>
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Adversarial Debate Validation</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>
              Our unique LangGraph architecture pits two AI agents against each other. An Adversary tries to break the question, while a Judge makes the final call. Say goodbye to ambiguous edge cases.
            </p>
          </div>

          <div className="stat-card" style={{ padding: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(225, 29, 72, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 24px 0' }}>
              <Cpu size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Secure Code Sandbox</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>
              Every Data Structures & Algorithms question generates optimal and brute-force solutions which are executed on an isolated AWS EC2 Piston Sandbox to guarantee mathematically perfect test cases.
            </p>
          </div>

          <div className="stat-card" style={{ padding: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(225, 29, 72, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 24px 0' }}>
              <Code2 size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>12-Factor App Architecture</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>
              Designed for enterprise. Bring Your Own Keys (BYOK) for LLMs, plug in your own AWS RDS and S3, and deploy immediately using our pre-configured GitHub Actions CI/CD pipelines.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
