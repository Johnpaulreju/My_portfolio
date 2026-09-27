/** React 19 supports inert as a native boolean HTML attribute. */
export function inertProps(inactive: boolean): { inert?: boolean } {
  return inactive ? { inert: true } : {}
}
