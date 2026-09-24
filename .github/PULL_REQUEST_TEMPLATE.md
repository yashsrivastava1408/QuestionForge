## Summary of Changes

Provide a clear and concise summary of the changes proposed in this Pull Request.

- Closes # [issue number, if applicable]

---

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] ⚡ Performance improvement
- [ ] 📚 Documentation update / diagram enhancement
- [ ] 🧪 Testing & CI/CD pipeline update

---

## Architectural & Monorepo Checklist
- [ ] My code adheres to the project's layered controller architecture (`controllers/` separate from `routes/`).
- [ ] If database models were modified, migration files are generated under `packages/shared/prisma/migrations/`.
- [ ] If background tasks were added, BullMQ queues and workers adhere to graceful draining protocols.
- [ ] All inputs are strictly validated using **Zod schemas**.

---

## Verification & Testing
- [ ] Ran `npm run test` across all workspaces — **all tests pass**.
- [ ] Ran `npm run build` — **Turborepo builds cleanly (`FULL TURBO` or exit code 0)**.
- [ ] Added new unit/integration tests in `apps/api/src/__tests__/` covering edge cases.

```text
Paste test output or screenshot here
```

---

## Screenshots / Demos (Frontend changes)
*If applicable, add screenshots or GIF walkthroughs to demonstrate the UI behavior.*
