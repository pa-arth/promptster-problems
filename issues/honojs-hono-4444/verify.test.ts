/**
 * hono#4444 — getCookie reflects setCookie within the same request handler.
 *
 * Bug: getCookie reads c.req.raw.headers.get('Cookie'), the inbound cookie
 * header. It never sees values just written by setCookie, so reading back a
 * cookie in the same handler returns stale request data (or undefined).
 *
 * A correct fix makes getCookie observe cookies set earlier in the request.
 *
 * Verification layer — 10 assertions covering the golden path.
 */
import { describe, it, expect } from 'vitest'
import { Hono } from '../../index'
import { setCookie, getCookie } from './index'

describe('hono#4444: getCookie reflects setCookie in same handler', () => {
  it('returns value set by setCookie when no prior cookie exists', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'token', 'abc123')
      return c.text(getCookie(c, 'token') ?? 'MISSING')
    })
    const res = await app.request('/test')
    expect(await res.text()).toBe('abc123')
  })

  it('returns new value after setCookie overrides an existing request cookie', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'token', 'new-value')
      return c.text(getCookie(c, 'token') ?? 'MISSING')
    })
    const req = new Request('http://localhost/test', {
      headers: { Cookie: 'token=old-value' },
    })
    const res = await app.request(req)
    expect(await res.text()).toBe('new-value')
  })

  it('still works for cookies only in the request (no setCookie call)', async () => {
    const app = new Hono()
    app.get('/test', (c) => c.text(getCookie(c, 'existing') ?? 'MISSING'))
    const req = new Request('http://localhost/test', {
      headers: { Cookie: 'existing=hello' },
    })
    const res = await app.request(req)
    expect(await res.text()).toBe('hello')
  })

  it('getCookie() with no key returns an object containing cookies set in the handler', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'a', 'A')
      setCookie(c, 'b', 'B')
      const all = getCookie(c)
      return c.json(all)
    })
    const res = await app.request('/test')
    expect(await res.json()).toEqual(expect.objectContaining({ a: 'A', b: 'B' }))
  })

  it('getCookie() with no key merges setCookie values over incoming request cookies', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'token', 'set-value')
      return c.json(getCookie(c))
    })
    const req = new Request('http://localhost/test', {
      headers: { Cookie: 'token=old-value; keep=me' },
    })
    const res = await app.request(req)
    expect(await res.json()).toEqual(expect.objectContaining({
      token: 'set-value',
      keep: 'me',
    }))
  })

  it('setCookie with empty-string value is readable via getCookie', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'empty', '')
      return c.text(JSON.stringify({ value: getCookie(c, 'empty') }))
    })
    const res = await app.request('/test')
    // getCookie should return '' (not undefined), distinguishing "set to empty" from "never set"
    expect(JSON.parse(await res.text())).toEqual({ value: '' })
  })

  it('setCookie called multiple times with the same name — last value wins', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'token', 'first')
      setCookie(c, 'token', 'second')
      setCookie(c, 'token', 'third')
      return c.text(getCookie(c, 'token') ?? 'MISSING')
    })
    const res = await app.request('/test')
    expect(await res.text()).toBe('third')
  })

  it('two different setCookie calls — both readable by name', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'session', 'sess-1')
      setCookie(c, 'csrf', 'csrf-1')
      return c.json({
        session: getCookie(c, 'session'),
        csrf: getCookie(c, 'csrf'),
      })
    })
    const res = await app.request('/test')
    expect(await res.json()).toEqual({ session: 'sess-1', csrf: 'csrf-1' })
  })

  it('setCookie still writes Set-Cookie header on the response', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'token', 'abc')
      return c.text('ok')
    })
    const res = await app.request('/test')
    const setCookieHeader = res.headers.get('Set-Cookie')
    expect(setCookieHeader).not.toBeNull()
    expect(setCookieHeader).toContain('token=abc')
  })

  it('getCookie(c) after setCookie for one name still includes unrelated request cookies', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'new_cookie', 'new')
      return c.json(getCookie(c))
    })
    const req = new Request('http://localhost/test', {
      headers: { Cookie: 'existing_a=x; existing_b=y' },
    })
    const res = await app.request(req)
    expect(await res.json()).toEqual(expect.objectContaining({
      existing_a: 'x',
      existing_b: 'y',
      new_cookie: 'new',
    }))
  })
})
