# Capacity Planning

> **Read this first.** Nothing on this page is a measured benchmark of Question Forge. No load test has been run. An earlier version of this page listed figures such as "3,000 requests/second" and "250,000 questions/day"; those were not measurements and have been removed. What follows is a model you can plug your own numbers into, plus the one set of timings we did observe.

---

## 1. What limits throughput

One question is one job. A job is:

```
drafting (LLM)  →  validation  →  [if it failed: drafting again … up to 3 times]
```

For a coding question, validation is mostly sandbox executions:

```
runs ≈ generator runs + inputs × (2 × languages) + large-input runs
     ≈ 17 + 35 × (2 × 4) + 5  ≈ 300 for 4 languages
     ≈ 17 + 35 × 2 + 2        ≈ 90  for 1 language
```

So the bottlenecks, in the order you will usually hit them:

1. **Sandbox capacity.** ~300 executions per 4-language question, each bounded by a 3 s run limit, `SANDBOX_CONCURRENCY` (default 10) at a time per validation. One Piston container at 0.75 CPU is the default and it is small.
2. **LLM rate limits.** Each question is 1–3 drafting calls of several thousand output tokens, plus 2–3 short review calls for MCQ-style questions or one independent-solver call for a coding question.
3. **Worker slots.** `WORKER_CONCURRENCY` (default 5) questions at a time per worker process.

Postgres and Redis are not close to being the limit at any realistic generation volume.

## 2. A model

$$\text{questions per hour} \approx \frac{W \times C \times 3600}{A \times (T_{\text{draft}} + T_{\text{validate}})}$$

| Symbol | Meaning | How to get it |
|---|---|---|
| $W$ | Worker processes | Your deployment. |
| $C$ | `WORKER_CONCURRENCY` | Config. |
| $A$ | Average attempts per question (1–3) | `GenerationItem.attempts` averaged over real batches. |
| $T_{\text{draft}}$ | Seconds per drafting call | Measure with your provider and model. |
| $T_{\text{validate}}$ | Seconds per validation | Measure against your Piston deployment. |

This assumes the sandbox can absorb $W \times C$ validations at once. If it cannot, sandbox capacity is your real ceiling and adding workers only lengthens the queue.

Pass rate matters as much as speed: every failed attempt costs a full draft and a full validation. Track `validated ÷ total` and average `attempts` per question type before tuning anything else.

## 3. What was actually observed

From the end-to-end test suite on a developer laptop (Apple Silicon), using the **local** sandbox driver — plain processes, no container, no network hop — and a scripted LLM that answers instantly:

| Scenario | Wall-clock (one run) |
|---|---|
| Validate one coding question, Python only (23 inputs, about 55 runs, including a brute-force run that deliberately hits the 3 s limit) | ≈ 5 s |
| Validate the same question in Python, JavaScript, C++ and Java | ≈ 6 s |
| Validate one SQL question (3 datasets, 6 SQLite runs) | under 1 s |
| The whole end-to-end suite (49 tests, about twenty generation jobs) | ≈ 85–100 s |

Roughly 3 s of each coding validation is the brute-force run being allowed to time out on the maximum-size input. The same tests took two to three times longer when the machine was busy with other work.

These say something about the engine's own overhead and nothing about a real deployment, where Piston adds an HTTP round-trip per execution and a real model takes tens of seconds per draft. **Measure on your own stack.**

## 4. Scaling knobs

| Knob | Effect |
|---|---|
| `WORKER_CONCURRENCY` | Questions in flight per worker. Raise it until the sandbox or the LLM rate limit pushes back. |
| Worker replicas | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale worker=N`. Scale on the `generation` queue's waiting count. |
| `SANDBOX_CONCURRENCY` | Parallel executions per validation. Keep it at or below what one Piston instance handles. |
| More Piston capacity | More CPU for the container, or several instances behind a load balancer at `PISTON_API_URL`. |
| Fewer languages per question | Sandbox work is linear in the number of languages. |
| `VALIDATION_RANDOM_CASES` / `VALIDATION_EDGE_CASES` | Fewer generated inputs means fewer runs and weaker checking. |
| API replicas | Only needed for HTTP load; the API does no generation work when workers are separate. |

### Example autoscaling trigger (KEDA, untested)

```yaml
triggers:
  - type: redis
    metadata:
      address: redis:6379
      listName: bull:generation:wait
      listLength: '15'   # one more worker per 15 waiting question jobs
```

## 5. Before trusting any number

Run a batch of 20–50 questions of the mix you actually need, against your real provider and your real Piston, and read:

- **Analytics → Generation Results** (`GET /api/analytics/generation`) → pass rate and average attempts per type, measured spend, **cost per validated question**, and why questions failed.
- `GET /api/generate/status/:jobId` → `usage` (tokens and cost) and per-item `attempts`.
- Each question's `validationResult.stats` → `sandboxRuns`, `optimalLargeMs`, `bruteLargeMs`.
- Bull Board → time per job.

That gives you $A$, $T_{\text{draft}}$, $T_{\text{validate}}$ and cost per validated question for your workload.
