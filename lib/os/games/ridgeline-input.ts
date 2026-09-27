/** Keep each finger and keyboard key independent, including shared controls. */
export function createRaceInput(down: (key: string) => void, up: (key: string) => void) {
  const sources = new Map<string, string>()
  const release = (source: string) => {
    const key = sources.get(source)
    if (!key) return
    sources.delete(source)
    if (![...sources.values()].includes(key)) up(key)
  }
  return {
    press(source: string, key: string, repeat = false) {
      if (sources.get(source) === key) {
        if (repeat) down(key)
        return
      }
      release(source)
      const alreadyHeld = [...sources.values()].includes(key)
      sources.set(source, key)
      if (!alreadyHeld) down(key)
    },
    release,
    clear() {
      const keys = new Set(sources.values())
      sources.clear()
      keys.forEach(up)
    },
    keys: () => new Set(sources.values()),
  }
}
