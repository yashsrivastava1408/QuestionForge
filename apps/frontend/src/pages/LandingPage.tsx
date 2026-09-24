import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github, ShieldCheck, Cpu, ArrowRight, CheckCircle2,
  Sparkles, Terminal, Zap, Layers
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [activeCodeTab, setActiveCodeTab] = useState<'python' | 'java' | 'cpp'>('python');

  const codeSnippets = {
    python: `def two_sum_sorted(numbers: list[int], target: int) -> list[int]:
    """
    Optimal 2-Pointer solution verified by Piston sandbox.
    Time Complexity: O(N) | Space Complexity: O(1)
    """
    left, right = 0, len(numbers) - 1
    while left < right:
        current_sum = numbers[left] + numbers[right]
        if current_sum == target:
            return [left + 1, right + 1]  # 1-indexed
        elif current_sum < target:
            left += 1
        else:
            right -= 1
    return []`,
    java: `class Solution {
    // Verified 0-allocation two-pointer sweep
    public int[] twoSum(int[] numbers, int target) {
        int left = 0, right = numbers.length - 1;
        while (left < right) {
            int sum = numbers[left] + numbers[right];
            if (sum == target) return new int[]{left + 1, right + 1};
            if (sum < target) left++;
            else right--;
        }
        return new int[]{};
    }
}`,
    cpp: `class Solution {
public:
    // Piston EC2 compiler: gcc 13.2.0 -O3 verified
    std::vector<int> twoSum(std::vector<int>& numbers, int target) {
        int left = 0, right = numbers.size() - 1;
        while (left < right) {
            int sum = numbers[left] + numbers[right];
            if (sum == target) return {left + 1, right + 1};
            (sum < target) ? left++ : right--;
        }
        return {};
    }
};`
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', overflow: 'hidden', position: 'relative' }}>
      
      {/* Ambient Lighting Orbs */}
      <div style={{
        position: 'absolute', top: '-15%', left: '15%', width: '700px', height: '700px',
        background: 'radial-gradient(circle, rgba(244,63,94,0.12) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0
      }} />
      <div style={{
        position: 'absolute', top: '25%', right: '-10%', width: '650px', height: '650px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)',
        filter: 'blur(90px)', pointerEvents: 'none', zIndex: 0
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', left: '5%', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 60%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0
      }} />

      {/* Navigation Bar */}
      <nav style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 48px',
        borderBottom: '1px solid var(--border-light)',
        background: 'rgba(7, 9, 14, 0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(244,63,94,0.35) 0%, rgba(139,92,246,0.3) 100%)',
            border: '1px solid rgba(244,63,94,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(244,63,94,0.3)'
          }}>
            <img src="/logo.png" alt="Question Forge Logo" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover' }} />
          </div>
          <div>
            <span style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
              Question Forge
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            className="btn btn-secondary"
            onClick={() => window.open('https://github.com/yashsrivastava1408/QuestionForge', '_blank')}
            style={{ fontSize: 13, gap: 8 }}
          >
            <Github size={16} />
            <span>GitHub Repository</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/login')}
            style={{ fontSize: 13, gap: 8 }}
          >
            <span>Launch Console</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: 1240, margin: '0 auto', padding: '80px 24px 120px' }}>
        
        {/* Floating Announcement Pill */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 16px',
            borderRadius: '9999px',
            background: 'linear-gradient(90deg, rgba(244,63,94,0.12) 0%, rgba(139,92,246,0.12) 100%)',
            border: '1px solid rgba(244,63,94,0.3)',
            boxShadow: '0 0 24px rgba(244,63,94,0.2)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)'
          }}>
            <Sparkles size={14} color="#f43f5e" />
            <span>Multi-Agent Adversarial Debate & Isolated Piston Sandboxes</span>
            <span style={{
              background: 'rgba(244,63,94,0.2)',
              color: '#f43f5e',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: 11,
              fontWeight: 700
            }}>
              v1.2 Active
            </span>
          </div>
        </div>

        {/* Hero Title & Subtitle */}
        <div style={{ textAlign: 'center', maxWidth: 900, margin: '0 auto 48px' }}>
          <h1 style={{
            fontSize: 'clamp(42px, 5.5vw, 68px)',
            fontWeight: 900,
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.04em',
            color: 'var(--text-primary)',
            lineHeight: 1.12,
            marginBottom: 24
          }}>
            The Enterprise-Grade <br />
            <span className="text-gradient-rose">AI Validation Engine</span> <br />
            for Technical Assessment.
          </h1>
          
          <p style={{
            fontSize: 19,
            color: 'var(--text-secondary)',
            maxWidth: 680,
            margin: '0 auto 36px',
            lineHeight: 1.6,
            fontWeight: 400
          }}>
            Generate, mathematically verify, and export DSA & Systems design interview targets with <span style={{ color: '#ffffff', fontWeight: 600 }}>zero hallucinations</span>. Pitting AI adversaries against each other in real-time.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/login')}
              style={{ height: 50, padding: '0 32px', fontSize: 15, gap: 10 }}
            >
              <span>Start Generating Questions</span>
              <ArrowRight size={18} />
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => window.open('https://github.com/yashsrivastava1408/QuestionForge', '_blank')}
              style={{ height: 50, padding: '0 28px', fontSize: 15, gap: 10 }}
            >
              <Terminal size={18} />
              <span>Explore Architecture</span>
            </button>
          </div>
        </div>

        {/* ========================================================
            Interactive Live Assessment & Sandbox Preview Card
            ======================================================== */}
        <div style={{ maxWidth: 1000, margin: '0 auto 90px' }}>
          <div style={{
            background: 'rgba(13, 19, 34, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 18,
            boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(244, 63, 94, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            overflow: 'hidden'
          }}>
            
            {/* Window Topbar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-light)',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
                <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
                <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  pipeline_validation_stream_qf719.py
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge-live">
                  <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
                  PISTON VERIFIED
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#f43f5e',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)'
                }}>
                  Judge Score: 98.4 / 100
                </span>
              </div>
            </div>

            {/* Split Content: Specification & Code Sandbox */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr' }}>
              
              {/* Left Column: Problem Brief & Verification Audit */}
              <div style={{ padding: '28px 24px', borderRight: '1px solid var(--border-light)', background: 'rgba(9, 13, 23, 0.5)' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <span className="badge badge-medium">MEDIUM</span>
                  <span className="badge badge-dsa">ARRAYS / 2-POINTER</span>
                  <span className="badge badge-approved">CROSS-CHECK PASSED</span>
                </div>

                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
                  Two Sum II — Input Array Is Sorted
                </h3>

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                  Given a 1-indexed array of integers numbers that is already sorted in non-decreasing order, find two numbers such that they add up to a specific target number.
                </p>

                {/* Adversary & Judge Debate Consensus Box */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 12,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                    Multi-Agent Consensus Telemetry
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#f8fafc' }}>
                    <CheckCircle2 size={15} color="#10b981" />
                    <span><strong>Adversary:</strong> Tested negative indices, duplicates & overflow</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#f8fafc' }}>
                    <CheckCircle2 size={15} color="#10b981" />
                    <span><strong>Judge:</strong> Zero hallucinations. Formal mathematical proof</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#f8fafc' }}>
                    <Cpu size={15} color="#06b6d4" />
                    <span><strong>Sandbox:</strong> 12/12 test cases compiled in <strong>38ms</strong></span>
                  </div>
                </div>
              </div>

              {/* Right Column: Code Tabs & Sandbox Verification */}
              <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(7, 10, 18, 0.9)' }}>
                {/* Code Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', background: 'rgba(255, 255, 255, 0.02)' }}>
                  {(['python', 'java', 'cpp'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setActiveCodeTab(lang)}
                      style={{
                        padding: '10px 20px',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        background: activeCodeTab === lang ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                        color: activeCodeTab === lang ? '#ffffff' : 'var(--text-muted)',
                        border: 'none',
                        borderBottom: activeCodeTab === lang ? '2px solid var(--color-primary)' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {lang === 'python' ? 'Python 3.12' : lang === 'java' ? 'Java 21' : 'C++ 20'}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', paddingRight: 16, fontSize: 11, color: '#10b981', gap: 6 }}>
                    <Zap size={13} />
                    <span>Isolated Container Ready</span>
                  </div>
                </div>

                {/* Code Body */}
                <pre style={{
                  padding: '20px 24px',
                  margin: 0,
                  fontSize: 12.5,
                  fontFamily: 'var(--font-mono)',
                  color: '#e2e8f0',
                  lineHeight: 1.65,
                  overflowX: 'auto',
                  flex: 1
                }}>
                  <code>{codeSnippets[activeCodeTab]}</code>
                </pre>
              </div>

            </div>

            {/* Bottom Status Bar */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--border-light)',
              background: 'rgba(11, 16, 28, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--text-muted)'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
                <span>BullMQ Queue: <strong>generation-high-priority</strong></span>
                <span style={{ color: 'var(--border-strong)' }}>|</span>
                <span>Worker: <strong>piston-node-us-east-1</strong></span>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                Consensus reached in 1.84s
              </span>
            </div>

          </div>
        </div>

        {/* Feature Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28, textAlign: 'left', marginBottom: 90 }}>
          
          <div className="stat-card" style={{ padding: 32 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(244,63,94,0.2) 0%, rgba(225,29,72,0.1) 100%)',
              border: '1px solid rgba(244,63,94,0.3)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(244,63,94,0.2)'
            }}>
              <ShieldCheck size={26} />
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, fontFamily: 'var(--font-display)' }}>
              Adversarial Debate Architecture
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: 14 }}>
              Our unique LangGraph multi-agent pipeline pits an Adversary against the Generator. The Adversary constructs deceptive edge cases while a formal Judge scores clarity, time complexity, and constraints.
            </p>
          </div>

          <div className="stat-card" style={{ padding: 32 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(59,130,246,0.1) 100%)',
              border: '1px solid rgba(6,182,212,0.3)',
              color: '#06b6d4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(6,182,212,0.2)'
            }}>
              <Cpu size={26} />
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, fontFamily: 'var(--font-display)' }}>
              Isolated Sandbox Execution
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: 14 }}>
              Every DSA question automatically generates optimal reference and brute-force implementations. They are compiled and run on dedicated Piston EC2 sandboxes to guarantee mathematical correctness.
            </p>
          </div>

          <div className="stat-card" style={{ padding: 32 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(99,102,241,0.1) 100%)',
              border: '1px solid rgba(139,92,246,0.3)',
              color: '#a78bfa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(139,92,246,0.2)'
            }}>
              <Layers size={26} />
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, fontFamily: 'var(--font-display)' }}>
              12-Factor Enterprise Platform
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: 14 }}>
              Zero vendor lock-in. Bring Your Own Keys (BYOK) for Anthropic, OpenAI, or Gemini. Outbound HMAC-SHA256 Webhooks, BullMQ Redis 7 queues, and 1-click GitHub Actions CI/CD deployment.
            </p>
          </div>

        </div>

        {/* Enterprise Architecture Footer */}
        <div style={{
          textAlign: 'center',
          padding: '40px 24px',
          borderTop: '1px solid var(--border-light)',
          color: 'var(--text-muted)',
          fontSize: 13
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <span>⚡ BullMQ Redis 7 Queues</span>
            <span>•</span>
            <span>🛡️ Isolated AWS Piston EC2 Sandbox</span>
            <span>•</span>
            <span>🔑 BYOK Multi-LLM Routing</span>
            <span>•</span>
            <span>📦 HMAC-SHA256 Outbound Webhooks</span>
          </div>
          <div>Question Forge Open Source Platform • Released under MIT License</div>
        </div>

      </main>
    </div>
  );
}
