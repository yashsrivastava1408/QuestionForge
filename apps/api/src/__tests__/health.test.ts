import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Health & Liveness Probes', () => {
  it('GET /health returns 200 OK with version and timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('version', '1.0.0');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/health returns 200 OK as a reverse-proxy alias', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});
