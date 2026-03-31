/**
 * Verification tests for honojs/hono#4444
 * Bug: getCookie returns stale data after setCookie in same request handler
 *
 * These tests fail at brokenSha e1ae0eb, pass when the bug is fixed.
 */
import { describe, it, expect } from 'vitest'
import { Hono } from '../../index'
import { setCookie, getCookie } from './index'

describe('hono#4444: getCookie reflects setCookie in same handler', () => {
  it('getCookie returns value set by setCookie when no prior cookie exists', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'token', 'abc123')
      const val = getCookie(c, 'token')
      return c.text(val ?? 'MISSING')
    })

    const res = await app.request('/test')
    expect(await res.text()).toBe('abc123')
  })

  it('getCookie returns new value after setCookie overrides an existing request cookie', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'token', 'new-value')
      const val = getCookie(c, 'token')
      return c.text(val ?? 'MISSING')
    })

    const req = new Request('http://localhost/test', {
      headers: { Cookie: 'token=old-value' },
    })
    const res = await app.request(req)
    expect(await res.text()).toBe('new-value')
  })

  it('getCookie still works for cookies that were only in the request (no setCookie call)', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      const val = getCookie(c, 'existing')
      return c.text(val ?? 'MISSING')
    })

    const req = new Request('http://localhost/test', {
      headers: { Cookie: 'existing=hello' },
    })
    const res = await app.request(req)
    expect(await res.text()).toBe('hello')
  })
})
