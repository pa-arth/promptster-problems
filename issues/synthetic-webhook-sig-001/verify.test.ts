/**
 * Webhook signature verification tests.
 * Ensures HMAC signatures are computed against the raw request body,
 * not a re-serialized version of the parsed JSON.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { app } from '../index.js';
import { eventStore } from '../lib/store.js';

const WEBHOOK_SECRET = 'whsec_test_secret_key_for_development';

function signPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('Webhook signature verification', () => {
  beforeEach(() => {
    eventStore.clear();
  });

  // ── Core fix: raw body signature verification ─────────────────

  it('accepts valid signature for simple JSON body', async () => {
    const body = '{"type": "charge.succeeded", "payload": {"id": "ch_abc", "amount": 1500}}';
    const signature = signPayload(body, WEBHOOK_SECRET);

    const res = await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-webhook-id', 'v_001')
      .set('x-webhook-timestamp', new Date().toISOString())
      .set('x-webhook-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('accepts valid signature for nested JSON with key ordering', async () => {
    // Key ordering: "zebra" before "alpha" — JSON.stringify after parse
    // may or may not preserve order, but raw bytes must match
    const body = '{"type": "order.fulfilled", "payload": {"zebra": 1, "alpha": 2, "nested": {"deep": {"value": true}}}}';
    const signature = signPayload(body, WEBHOOK_SECRET);

    const res = await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-webhook-id', 'v_002')
      .set('x-webhook-timestamp', new Date().toISOString())
      .set('x-webhook-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
  });

  it('accepts valid signature for unicode characters', async () => {
    const body = '{"type": "customer.created", "payload": {"name": "Ñoño Müller", "city": "Zürich"}}';
    const signature = signPayload(body, WEBHOOK_SECRET);

    const res = await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-webhook-id', 'v_003')
      .set('x-webhook-timestamp', new Date().toISOString())
      .set('x-webhook-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
  });

  it('accepts valid signature for numeric precision edge case', async () => {
    const body = '{"type": "payout.created", "payload": {"amount": 0.1, "fee": 0.2, "total": 0.30000000000000004}}';
    const signature = signPayload(body, WEBHOOK_SECRET);

    const res = await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-webhook-id', 'v_004')
      .set('x-webhook-timestamp', new Date().toISOString())
      .set('x-webhook-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
  });

  // ── Regression: existing middleware still works ────────────────

  it('auth middleware still rejects missing API key on events', async () => {
    const res = await request(app).get('/events');
    expect(res.status).toBe(401);
  });

  it('rate limiter still sets header', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });
});
