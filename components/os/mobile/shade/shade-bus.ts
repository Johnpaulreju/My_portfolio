/**
 * The status bar and the shade live in different parts of the phone shell. The
 * bar only reports the finger; the shade owns what the finger moves. No React
 * state per pointermove: the shade writes styles through refs.
 */
export type PullHandler = {
  begin: () => void
  move: (dy: number) => void
  end: (dy: number, velocity: number) => void
  cancel: () => void
}

let handler: PullHandler | null = null

export const shadeBus = {
  register(h: PullHandler) {
    handler = h
    return () => { if (handler === h) handler = null }
  },
  get ready() { return handler !== null },
  begin: () => handler?.begin(),
  move: (dy: number) => handler?.move(dy),
  end: (dy: number, velocity: number) => handler?.end(dy, velocity),
  cancel: () => handler?.cancel(),
}
