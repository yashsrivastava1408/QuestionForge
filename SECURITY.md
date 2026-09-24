# Security Policy & Vulnerability Disclosure

Question Forge takes the security of its code, multi-tenant isolation boundaries, and customer data with utmost seriousness.

---

## Supported Versions

We provide security updates and patches for the following versions:

| Version | Supported |
|---|---|
| 1.0.x (main) | ✅ Yes |
| < 1.0.0 | ❌ No |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have discovered a vulnerability (such as multi-tenant data leakage, remote code execution bypass in the Piston sandbox, JWT token revocation bypass, or mass-assignment flaw):

1. **Email us directly**: Send a detailed report to **yashsrivastava1408@gmail.com** with the subject `[SECURITY VULNERABILITY] Question Forge`.
2. **Include details**:
   - Description of the vulnerability and attack vector.
   - Proof-of-concept (PoC) code or step-by-step reproduction instructions.
   - Potential impact on tenant isolation or infrastructure.
   - Any proposed remediation or patches.

### Response Timeline
- **Initial Acknowledgement**: Within **24 hours**.
- **Triage & Impact Assessment**: Within **72 hours**.
- **Patch Release & Advisory**: Within **7 business days** (depending on complexity).

---

## Security Architecture Principles

- **Zero-Trust Multi-Tenancy**: Organization boundaries are cryptographically and query-enforced across all endpoints.
- **Isolated Sandboxing**: Code execution runs inside unprivileged, ephemeral Piston containers with strict cgroup memory and CPU throttles.
- **Stateless Revocation**: JWT sessions can be revoked immediately via the Redis JTI blacklist.
- **Input Sanitization**: All user strings are entity-escaped prior to Puppeteer PDF rendering.
