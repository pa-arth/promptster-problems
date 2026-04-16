/**
 * Verification tests for vuejs/core#10101
 * Tests that computed props provided to child components via provide/inject
 * remain reactive, and that allowRecurse effects track dirty levels correctly.
 *
 * Regression introduced in Vue 3.4.0 — computed values in parent stop updating
 * when provided to child via provide/inject.
 */
import { describe, it, expect, vi } from 'vitest'
import { computed, ref } from '../src'
import { DirtyLevels } from '../src/constants'
import {
  h,
  nextTick,
  nodeOps,
  render,
  serializeInner,
} from '@vue/runtime-test'

describe('vuejs/core#10082: provide/inject computed reactivity', () => {
  it('allowRecurse effects should have correct dirtyLevel after evaluation', () => {
    const v = ref(1)
    const c1 = computed(() => v.value)
    const c2 = computed(() => c1.value)

    c1.effect.allowRecurse = true
    c2.effect.allowRecurse = true
    c2.value

    // After evaluation, both effects should be clean (NotDirty)
    expect(c1.effect._dirtyLevel).toBe(DirtyLevels.NotDirty)
    expect(c2.effect._dirtyLevel).toBe(DirtyLevels.NotDirty)
  })

  it('chained ref+computed should produce correct values with self-mutating computed', () => {
    const value = ref(0)
    const consumer = computed(() => {
      value.value++
      return 'foo'
    })
    const provider = computed(() => value.value + consumer.value)

    expect(provider.value).toBe('0foo')
    // After first evaluation, provider should be dirty because consumer mutated value
    expect(provider.effect._dirtyLevel).toBe(DirtyLevels.Dirty)
    expect(provider.value).toBe('1foo')
  })

  it('parent computed should update when child modifies reactive source during setup', async () => {
    const s = ref(0)
    const n = computed(() => s.value + 1)

    const Child = {
      setup() {
        s.value++
        return () => n.value
      },
    }

    const renderSpy = vi.fn()
    const Parent = {
      setup() {
        return () => {
          renderSpy()
          return [n.value, h(Child)]
        }
      },
    }

    const root = nodeOps.createElement('div')
    render(h(Parent), root)
    await nextTick()

    // Parent should re-render to reflect the child's mutation
    expect(serializeInner(root)).toBe('22')
    expect(renderSpy).toHaveBeenCalledTimes(2)
  })
})
