/**
 * hono#4444 — edge cases for getCookie/setCookie consistency.
 *
 * These cover scenarios a candidate might forget: cookie prefixes, cross-
 * middleware visibility, cross-request isolation, values with special
 * characters, and "read a cookie that was never set."
 */
import { describe, it, expect } from 'vitest'
import { Hono } from '../../index'
import { setCookie, getCookie } from './index'

describe('hono#4444: edge cases', () => {
  it('prefix=secure — setCookie/getCookie round-trip preserves the prefix', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'sid', 'secret', { prefix: 'secure', secure: true })
      return c.text(getCookie(c, 'sid', 'secure') ?? 'MISSING')
    })
    const res = await app.request('https://localhost/test')
    expect(await res.text()).toBe('secret')
  })

  it('prefix=host — setCookie/getCookie round-trip preserves the prefix', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'sid', 'host-val', { prefix: 'host' })
      return c.text(getCookie(c, 'sid', 'host') ?? 'MISSING')
    })
    const res = await app.request('https://localhost/test')
    expect(await res.text()).toBe('host-val')
  })

  it('cross-middleware: setCookie in a pre-middleware is visible to getCookie in the handler', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      setCookie(c, 'flash', 'from-middleware')
      await next()
    })
    app.get('/test', (c) => c.text(getCookie(c, 'flash') ?? 'MISSING'))
    const res = await app.request('/test')
    expect(await res.text()).toBe('from-middleware')
  })

  it('no cross-request leak: setting a cookie in one request does not affect the next', async () => {
    const app = new Hono()
    app.get('/set', (c) => {
      setCookie(c, 'leak', 'should-not-appear')
      return c.text('set')
    })
    app.get('/read', (c) => c.text(getCookie(c, 'leak') ?? 'MISSING'))
    await app.request('/set')
    const res = await app.request('/read')
    expect(await res.text()).toBe('MISSING')
  })

  it('reading a never-set cookie still returns undefined after other setCookie calls', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'other', 'other-val')
      return c.text(JSON.stringify({ value: getCookie(c, 'never-set') }))
    })
    const res = await app.request('/test')
    expect(JSON.parse(await res.text())).toEqual({ value: undefined })
  })

  it('setCookie value with encodable characters round-trips through getCookie', async () => {
    const app = new Hono()
    app.get('/test', (c) => {
      setCookie(c, 'json', '{"a":1}')
      return c.text(getCookie(c, 'json') ?? 'MISSING')
    })
    const res = await app.request('/test')
    expect(await res.text()).toBe('{"a":1}')
  })
})
