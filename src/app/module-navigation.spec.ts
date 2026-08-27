import { describe, expect, it } from 'vitest'
import { router } from './router'
import { moduleNavigation } from './module-navigation'

describe('module navigation catalog', () => {
  it('only exposes existing application routes without duplicate entries', () => {
    const menuPaths = Object.values(moduleNavigation).flatMap((groups) => groups.flatMap((group) => group.items.map((item) => item.path)))
    const routePaths = new Set(router.getRoutes().map((route) => route.path))
    const missing = menuPaths.filter((path) => !routePaths.has(path))

    expect(new Set(menuPaths).size).toBe(menuPaths.length)
    expect(missing).toEqual([])
  })
})
