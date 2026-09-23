# Production Deployment & SRE Runbook

This runbook guides Site Reliability Engineers (SRE) and DevOps practitioners through provisioning, deploying, monitoring, and operating Question Forge in high-availability enterprise cloud environments.

---

## 1. Production Architecture Checklist

Before launching production workloads, verify that external managed services satisfy these baseline specifications:

| Service | Recommended Managed Service | Minimum Production Sizing |
|---|---|---|
| **Database** | AWS RDS PostgreSQL 16 | `db.r6g.xlarge` (32 GB RAM, 4 vCPUs, Multi-AZ enabled) |
| **Vector Index** | PostgreSQL `pgvector` Extension | `CREATE EXTENSION IF NOT EXISTS vector;` |
| **Cache & Queues**| AWS ElastiCache for Redis 7 | `cache.r6g.large` (Multi-AZ with auto-failover, AOF enabled) |
| **Export Storage** | AWS S3 Bucket | Private bucket with server-side encryption (SSE-S3 or SSE-KMS) |
| **Sandbox Cluster**| Auto-Scaling Group (EC2 / Docker) | 2× `c6i.xlarge` running Piston Docker containers |
| **Compute Cluster**| AWS ECS Fargate or EKS | 4× Stateless API Pods + 2–8 Headless Worker Pods |

---

## 2. Infrastructure as Code (Terraform)

Question Forge includes automated Terraform configurations under `infra/terraform/`:

```bash
cd infra/terraform

# 1. Initialize provider plugins and remote state
terraform init

# 2. Plan resource changes
terraform plan -out=tfplan.binary

# 3. Apply infrastructure provisioning
terraform apply tfplan.binary
```

### Outputs Produced:
- `alb_dns_name`: Public DNS endpoint for the Application Load Balancer.
- `rds_endpoint`: Private PostgreSQL endpoint.
- `elasticache_endpoint`: Private Redis cluster configuration endpoint.
- `s3_bucket_arn`: Export storage bucket identifier.

---

## 3. Decoupled Production Deployment (Docker Compose)

For container-native environments, use `docker-compose.prod.yml`:

```bash
# Pull latest images and launch decoupled services
docker compose -f docker-compose.prod.yml up -d
```

### Service Verification
```bash
# Check running status of decoupled containers
docker compose -f docker-compose.prod.yml ps

# Expected Output:
# NAME                         SERVICE    STATUS              PORTS
# question-forge-api-1         api        running (healthy)   0.0.0.0:4000->4000/tcp
# question-forge-api-2         api        running (healthy)   0.0.0.0:4001->4000/tcp
# question-forge-worker-1      worker     running             (headless)
# question-forge-frontend-1    frontend   running             0.0.0.0:80->80/tcp
```

---

## 4. Health Probes & Automated Rollback

Load balancers and CI/CD pipelines probe two dedicated health endpoints:

### 1. Liveness Probe: `GET /health`
- **Purpose**: Fast check verifying that the Node.js event loop is responding.
- **Latency**: $< 2\text{ms}$.
- **Response**: `200 OK { status: "ok", timestamp: "..." }`.

### 2. Deep Readiness Probe: `GET /health/ready`
- **Purpose**: Verifies that the pod can communicate with both PostgreSQL and Redis before the load balancer routes incoming traffic to it.
- **Payload**:
  ```json
  {
    "status": "healthy",
    "checks": {
      "database": "connected",
      "redis": "connected"
    }
  }
  ```

If either check fails, the probe returns `503 Service Unavailable`, prompting the rolling deployment script to halt traffic shifting and execute an immediate container rollback.

---

## 5. Disaster Recovery Runbook

### RPO & RTO Objectives
- **Recovery Point Objective (RPO)**: $< 5\text{ minutes}$ (AWS RDS Point-in-Time-Recovery + Redis AOF).
- **Recovery Time Objective (RTO)**: $< 15\text{ minutes}$ for complete regional failover.

### Incident Playbooks

#### Scenario A: BullMQ Queue Backlog Spiking
1. **Symptom**: `generation.waiting` in `/api/admin/queues/stats` exceeds 50; SSE progress updates stall.
2. **Diagnosis**: Check Piston sandbox health and external LLM rate-limit headers.
3. **Action**: Scale the worker cluster horizontally:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --scale worker=6
   ```

#### Scenario B: PostgreSQL Connection Exhaustion
1. **Symptom**: Prisma logs `Timed out fetching a connection from the pool`.
2. **Diagnosis**: Excessive simultaneous API replicas without connection pooling.
3. **Action**: Append `?connection_limit=5&pool_timeout=10` to `DATABASE_URL` in `.env` to enforce client-side connection boundaries, or deploy AWS RDS Proxy.

#### Scenario C: Redis Memory Pressure
1. **Symptom**: Redis rejects writes with `OOM command not allowed`.
2. **Diagnosis**: Inspect key memory breakdown via `redis-cli --bigkeys`.
3. **Action**: Verify that analytics cache keys have active TTLs and BullMQ completed job retention is configured:
   ```typescript
   removeOnComplete: { count: 1000, age: 3600 },
   removeOnFail: { count: 5000, age: 86400 }
   ```
