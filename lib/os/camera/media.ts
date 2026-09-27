/**
 * Camera plumbing with no React in it: what can go wrong, how to ask for a
 * stream, and how to let it go. Everything here stays on the device - there is
 * no fetch, no upload and no storage anywhere in the camera.
 */

export type Facing = "user" | "environment"

export type CameraErrorKind =
  | "denied"
  | "no-camera"
  | "busy"
  | "unsupported"
  | "insecure"
  | "in-app"
  | "stopped"

/**
 * Social apps open links in their own web views, and many of those never pass a
 * camera through. Recognising them lets the error say "open it in your browser"
 * instead of a vague failure.
 */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Twitter|MicroMessenger|\bLine\/|musical_ly|BytedanceWebview|Pinterest|GSA\//i

export function isInAppBrowser(ua: string) {
  return IN_APP.test(ua)
}

/** A problem we can see before asking, so the visitor is never prompted for nothing. */
export function supportProblem(env: { secure: boolean; hasGetUserMedia: boolean; ua: string }): CameraErrorKind | null {
  if (!env.secure) return "insecure"
  if (!env.hasGetUserMedia) return isInAppBrowser(env.ua) ? "in-app" : "unsupported"
  return null
}

/** Browser error names differ a little; the visitor only needs to know which fix applies. */
export function classifyError(error: unknown, ua = ""): CameraErrorKind {
  const name = typeof error === "object" && error && "name" in error ? String((error as { name: unknown }).name) : ""
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied"
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "no-camera"
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy"
    default:
      return isInAppBrowser(ua) ? "in-app" : "unsupported"
  }
}

export function cameraConstraints(facing: Facing, deviceId?: string): MediaStreamConstraints {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } }
  return {
    video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: facing, ...size },
    audio: false,
  }
}

/** Ends every track, which is what turns the camera light off. */
export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Asks the Permissions API without prompting. Firefox and older Safari throw for
 * the "camera" name, which just means "we can't tell" (null).
 */
export async function cameraPermission(): Promise<PermissionStatus | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null
    return await navigator.permissions.query({ name: "camera" as PermissionName })
  } catch {
    return null
  }
}

/** Front cameras are mirrored like a mirror; back cameras show the world as it is. */
export function shouldMirror(requested: Facing, reported: string | undefined) {
  if (reported === "environment") return false
  if (reported === "user") return true
  // Laptop webcams usually report nothing. They face the visitor, so mirror.
  return requested === "user"
}

const pad = (n: number) => String(n).padStart(2, "0")

/** jp-camera-YYYYMMDD-HHMMSS.jpg in local time, the way a phone names its shots. */
export function photoName(date: Date) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `jp-camera-${day}-${time}.jpg`
}
