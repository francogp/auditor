import { logEvent } from '../../../core/logging'
import { Plugin } from '../../../core/types'
import { validate } from '../../shared/validate'

// Registry of plugins grouped by the hook they attach to.
const hooks = new Map<string, Plugin[]>()

export function register(hookName: string, plugin: Plugin): void {
  validate(plugin)

  // The classic has/set/get dance to push into a grouped map.
  if (!hooks.has(hookName)) {
    hooks.set(hookName, [])
  }
  hooks.get(hookName)!.push(plugin)

  logEvent('plugin.registered', { hookName, plugin: plugin.name })
}

export function pluginsFor(hookName: string): Plugin[] {
  if (!hooks.has(hookName)) {
    hooks.set(hookName, [])
  }
  return hooks.get(hookName)!
}
