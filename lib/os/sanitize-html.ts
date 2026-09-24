"use client"

/**
 * The single gate every piece of rich text passes through.
 *
 * Anything that reaches the Docs editor from outside the editor - a stored
 * document body, a paste from another site, a drop - is untrusted. It is parsed
 * into an inert document (DOMParser never runs scripts and never fetches), the
 * tree is walked, and only a tiny allowlist survives. Everything else is either
 * dropped whole (script-ish elements, with their contents) or unwrapped (unknown
 * but harmless wrappers keep their text).
 *
 * The allowlist is deliberately small: it is exactly what the ribbon can produce.
 */

/** Tags the editor is allowed to keep. Everything else is unwrapped or dropped. */
const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "span", "div",
  "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "hr",
])

/**
 * Tags removed together with everything inside them. Unwrapping these would
 * leak script source or stylesheet text into the document as visible prose, so
 * they go entirely.
 */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "applet", "noscript",
  "template", "link", "meta", "base", "title", "head", "svg", "math",
  "form", "input", "textarea", "select", "button", "option",
  "video", "audio", "source", "track", "canvas", "map", "area",
  "frame", "frameset", "portal", "dialog", "slot",
])

/** The only style properties that survive. No url(), no positioning, no layout. */
const ALLOWED_STYLE_PROPS = new Set([
  "color", "background-color", "font-size", "text-align", "font-family",
])

/** Anything that can reach out of the document or smuggle a nested construct. */
const UNSAFE_STYLE_VALUE = /url\(|expression|javascript:|data:|@import|[<>{}\\]|&#/i

const SAFE_HREF = /^(?:https?:|mailto:)/i

/** Legacy <font size> buckets, so a pasted <font> still lands at a sane size. */
const FONT_SIZE_PT: Record<string, string> = {
  "1": "8pt", "2": "10pt", "3": "12pt", "4": "14pt", "5": "18pt", "6": "24pt", "7": "36pt",
}

/** Runaway nesting is a denial-of-service, not a document. */
const MAX_DEPTH = 64
const MAX_INPUT = 1_000_000

const NODE_ELEMENT = 1
const NODE_TEXT = 3

/**
 * Strips tags without a DOM. Only reachable during a server prerender, where the
 * editor has not mounted yet and the result is never persisted - but it must
 * still be inert, so every angle bracket is removed rather than trusted.
 */
function withoutDom(dirty: string): string {
  return dirty
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
}

function cleanStyle(raw: string): string {
  const kept: string[] = []
  for (const decl of raw.split(";")) {
    const colon = decl.indexOf(":")
    if (colon < 1) continue
    const prop = decl.slice(0, colon).trim().toLowerCase()
    const value = decl.slice(colon + 1).trim()
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue
    if (!value || value.length > 160) continue
    if (UNSAFE_STYLE_VALUE.test(value)) continue
    kept.push(`${prop}: ${value}`)
  }
  return kept.join("; ")
}

function cleanHref(raw: string): string | null {
  // Control characters are the classic way to hide "java\nscript:".
  const href = raw.replace(/[\u0000- \u007f]/g, "").trim()
  if (!href || !SAFE_HREF.test(href)) return null
  return href.slice(0, 2048)
}

/** Fold a legacy <font> into a <span style>, so the ribbon's output survives a round trip. */
function foldFont(el: Element): Element {
  const span = el.ownerDocument.createElement("span")
  const face = el.getAttribute("face")
  const color = el.getAttribute("color")
  const size = el.getAttribute("size")
  const style = [
    face ? `font-family: ${face}` : "",
    color ? `color: ${color}` : "",
    size && FONT_SIZE_PT[size] ? `font-size: ${FONT_SIZE_PT[size]}` : "",
  ]
    .filter(Boolean)
    .join("; ")
  const safe = cleanStyle(style)
  if (safe) span.setAttribute("style", safe)
  while (el.firstChild) span.appendChild(el.firstChild)
  el.replaceWith(span)
  return span
}

function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) {
    el.remove()
    return
  }
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

/** Returns false when the element should not survive as an element. */
function scrubAttributes(el: Element, tag: string): boolean {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()

    if (name === "style") {
      const safe = cleanStyle(attr.value)
      if (safe) el.setAttribute("style", safe)
      else el.removeAttribute("style")
      continue
    }

    if (name === "href" && tag === "a") {
      const href = cleanHref(attr.value)
      if (href) el.setAttribute("href", href)
      else el.removeAttribute("href")
      continue
    }

    // Everything else goes: every on* handler, every id/class/data-*, every
    // src, srcdoc, formaction and friend.
    el.removeAttribute(attr.name)
  }

  if (tag === "a") {
    // An anchor whose href did not survive is just text pretending to be a link.
    if (!el.getAttribute("href")) return false
    // Added by the sanitizer, never inherited: a link that leaves the document
    // must not navigate the desktop out from under the visitor.
    el.setAttribute("target", "_blank")
    el.setAttribute("rel", "noopener noreferrer")
  }

  return true
}

function cleanNode(node: ChildNode, depth: number): void {
  if (node.nodeType === NODE_TEXT) return
  if (node.nodeType !== NODE_ELEMENT) {
    // Comments, processing instructions, CDATA - none of it is document content.
    node.remove()
    return
  }

  let el = node as Element
  const rawTag = el.tagName.toLowerCase()

  if (DROP_WITH_CONTENT.has(rawTag) || depth > MAX_DEPTH) {
    el.remove()
    return
  }

  if (rawTag === "font") el = foldFont(el)
  const tag = el.tagName.toLowerCase()

  // Bottom-up: children are already clean, so unwrapping this element promotes
  // clean nodes and never needs a second pass.
  for (const child of Array.from(el.childNodes)) cleanNode(child, depth + 1)

  if (!ALLOWED_TAGS.has(tag)) {
    unwrap(el)
    return
  }

  if (!scrubAttributes(el, tag)) unwrap(el)
}

/**
 * Returns HTML that is safe to assign to innerHTML: allowlisted tags, allowlisted
 * attributes, no handlers, no remote references, no scripts.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ""
  const input = dirty.length > MAX_INPUT ? dirty.slice(0, MAX_INPUT) : dirty
  if (typeof DOMParser === "undefined") return withoutDom(input)

  try {
    const doc = new DOMParser().parseFromString(`<body>${input}</body>`, "text/html")
    const body = doc.body
    if (!body) return ""
    for (const child of Array.from(body.childNodes)) cleanNode(child, 0)
    return body.innerHTML
  } catch {
    return withoutDom(input)
  }
}

/** Plain text (a .txt opened in Docs, or a plain-text paste) as safe paragraphs. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return escaped
    .split(/\r?\n/)
    .map((line) => `<p>${line.trim() ? line : "<br>"}</p>`)
    .join("")
}
