/**
 * Verification tests for honojs/hono#4326
 * Bug: Context values are lost when a plain JSXNode element sits between
 *      Context.Provider and the consumer component.
 *
 * These tests fail at brokenSha e1ae0eb, pass when the bug is fixed.
 */
/** @jsxImportSource ./ */

import { describe, it, expect } from 'vitest'
import type { FC, PropsWithChildren } from './base'
import { createContext, useContext } from './context'

describe('hono#4326: Context propagation through intermediate JSXNode', () => {
  it('useContext works when consumer is wrapped in a plain HTML element', () => {
    const Ctx = createContext<string>('default')

    const Consumer: FC = () => {
      const val = useContext(Ctx)
      return <span>{val}</span>
    }

    const App: FC = () => (
      <Ctx.Provider value="provided">
        <div>
          <Consumer />
        </div>
      </Ctx.Provider>
    )

    const html = (<App />).toString()
    expect(html).toContain('provided')
    expect(html).not.toContain('default')
  })

  it('useContext works when consumer is wrapped in an intermediate function component', () => {
    const Ctx = createContext<string>('default')

    const Consumer: FC = () => {
      const val = useContext(Ctx)
      return <span>{val}</span>
    }

    const Wrapper: FC<PropsWithChildren> = ({ children }) => <section>{children}</section>

    const App: FC = () => (
      <Ctx.Provider value="provided">
        <Wrapper>
          <Consumer />
        </Wrapper>
      </Ctx.Provider>
    )

    const html = (<App />).toString()
    expect(html).toContain('provided')
    expect(html).not.toContain('default')
  })

  it('direct consumer without intermediate element still works', () => {
    const Ctx = createContext<string>('default')

    const Consumer: FC = () => {
      const val = useContext(Ctx)
      return <span>{val}</span>
    }

    const App: FC = () => (
      <Ctx.Provider value="direct">
        <Consumer />
      </Ctx.Provider>
    )

    const html = (<App />).toString()
    expect(html).toContain('direct')
  })
})
