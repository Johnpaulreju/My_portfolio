/**
 * The one result shape every OS action returns.
 *
 * Every failure carries a renderable `message`, because the callers are a GUI, a
 * shell and an assistant - none of them should have to invent wording for a
 * failure they did not define. fs-store already returns its own WriteResult;
 * `fromWrite` adapts it here rather than changing the store, which keeps the
 * import direction one-way (actions -> stores, never back).
 */

export type Failure =
  | { reason: "locked"; message: string }
  | { reason: "missing"; message: string }
  | { reason: "unsupported"; message: string }
  | { reason: "offline"; message: string }
  | { reason: "bad-argument"; message: string }
  | { reason: "denied"; message: string }

export type ActionResult<T = void> = ({ ok: true; value: T } | ({ ok: false } & Failure))

export const ok = <T,>(value: T): ActionResult<T> => ({ ok: true, value })

export const fail = <T = never,>(reason: Failure["reason"], message: string): ActionResult<T> =>
  ({ ok: false, reason, message } as ActionResult<T>)

/** Adapter for fs-store's WriteResult, which predates this type. */
export function fromWrite(
  res: { ok: true; id?: string } | { ok: false; reason: "locked" | "missing" },
  what: string,
): ActionResult<string | undefined> {
  if (res.ok) return ok(res.id)
  if (res.reason === "locked") {
    return fail(
      "locked",
      `${what} is one of Johnpaul's own files, so it can't be changed. You can always save a copy.`,
    )
  }
  return fail("missing", `${what} no longer exists.`)
}
