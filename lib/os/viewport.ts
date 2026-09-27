/**
 * The phone shell covers narrow screens and touch phones held sideways.
 * Tablets and touch laptops keep the desktop: they are taller than 500px.
 */
export const PHONE_QUERY = "(max-width: 767px), (max-height: 500px) and (pointer: coarse)"

export const isPhoneViewport = () => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches
