/**
 * Edge cases for honojs/hono#4326 — context propagation through intermediate
 * JSXNode under Deno's precompile JSX transform.
 *
 * These complement verify.test.tsx without overlapping its assertions. The
 * main file focuses on the golden-path bug. These add:
 *  - multiple Provider values for the same context, read from nested positions
 *  - Provider with no children (regression guard — must not crash)
 *  - Provider where the consumer is NOT inside a precompiled template (works
 *    at broken sha too; guards against a "fix" that breaks the working path)
 *  - precompiled-wrapper + consumer that ignores context (renders value-less)
 */

import { describe, it, expect } from 'vitest'
import { jsxDEV as jsx } from './jsx-dev-runtime'
import { jsxTemplate } from './jsx-runtime'
import { createContext, useContext } from './context'
import type { FC } from './base'

describe('hono#4326: edge cases', () => {
  it('nested Providers — inner value wins over outer for a deeply wrapped consumer', () => {
    const Ctx = createContext<string>('default')

    const Consumer: FC = () => {
      const v = useContext(Ctx)
      return jsxTemplate`<i>${v}</i>` as any
    }

    const app = jsx(Ctx.Provider, {
      value: 'outer',
      children: jsxTemplate`<section>${jsx(Ctx.Provider, {
        value: 'inner',
        children: jsxTemplate`<div>${jsx(Consumer, {})}</div>`,
      })}</section>`,
    })

    const html = app.toString()
    expect(html).toContain('inner')
    expect(html).not.toContain('outer')
    expect(html).not.toContain('default')
  })

  it('two sibling consumers under the same Provider both see the provided value', () => {
    const Ctx = createContext<string>('default')

    const A: FC = () => jsxTemplate`<a>${useContext(Ctx)}</a>` as any
    const B: FC = () => jsxTemplate`<b>${useContext(Ctx)}</b>` as any

    const app = jsx(Ctx.Provider, {
      value: 'shared',
      children: jsxTemplate`<div>${jsx(A, {})}${jsx(B, {})}</div>`,
    })

    const html = app.toString()
    expect(html).toContain('<a>shared</a>')
    expect(html).toContain('<b>shared</b>')
    expect(html).not.toContain('default')
  })

  it('Provider with empty children renders without crashing', () => {
    // Regression guard: a Provider with no children must not throw; the fix
    // cannot regress this empty-children case.
    const Ctx = createContext<string>('default')
    const app = jsx(Ctx.Provider, { value: 'x', children: null })
    const html = app.toString()
    expect(typeof html).toBe('string') // either '' or Promise-resolved string; don't assert content
  })

  it('consumer outside any precompiled wrapper still sees context (regression)', () => {
    // Regression guard — this path works at broken too. A wrong fix that
    // breaks the non-precompile route would flip this to FAIL.
    const Ctx = createContext<string>('default')
    const Consumer: FC = () => jsxTemplate`<span>${useContext(Ctx)}</span>` as any

    const app = jsx(Ctx.Provider, {
      value: 'no-wrapper',
      children: jsx(Consumer, {}),
    })

    const html = app.toString()
    expect(html).toContain('no-wrapper')
    expect(html).not.toContain('default')
  })

  it('default context value appears when no Provider wraps the consumer', () => {
    // Regression guard: without a Provider, the consumer should fall back to
    // the default value. A fix that accidentally pushes a stale value from a
    // prior render would break this.
    const Ctx = createContext<string>('fallback')
    const Consumer: FC = () => jsxTemplate`<u>${useContext(Ctx)}</u>` as any

    const app = jsxTemplate`<p>${jsx(Consumer, {})}</p>`
    const html = app.toString()
    expect(html).toContain('fallback')
  })

  it('distinct contexts do not leak between each other', () => {
    // Two independent Contexts used in the same tree must maintain separate
    // value stacks.
    const Name = createContext<string>('(name)')
    const Role = createContext<string>('(role)')

    const User: FC = () =>
      jsxTemplate`<span>${useContext(Name)}/${useContext(Role)}</span>` as any

    const app = jsx(Name.Provider, {
      value: 'Ada',
      children: jsxTemplate`<section>${jsx(Role.Provider, {
        value: 'admin',
        children: jsxTemplate`<div>${jsx(User, {})}</div>`,
      })}</section>`,
    })

    const html = app.toString()
    expect(html).toContain('Ada/admin')
    expect(html).not.toContain('(name)')
    expect(html).not.toContain('(role)')
  })
})
