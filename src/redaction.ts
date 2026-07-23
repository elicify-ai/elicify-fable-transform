/** Redaction is applied at every disk-write boundary. Fablize redacts selected
 * command strings before persistence but writes the final ledger unsanitized
 * (/tmp/fablize-deep/scripts/gate/ledger.py:34-39,55-62,108-115).
 */

const SENSITIVE_KEY_RE = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|cookie|client[_-]?secret)$/i

const SECRET_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, replacement: "$1[REDACTED]" },
  { pattern: /\b(Basic\s+)[A-Za-z0-9+/=]{8,}/gi, replacement: "$1[REDACTED]" },
  {
    pattern: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|client[_-]?secret)\b(\s*[:=]\s*|\s+)(["'])[^\r\n]*?\3/gi,
    replacement: "$1$2[REDACTED]",
  },
  {
    pattern: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|client[_-]?secret)\b(\s*[:=]\s*|\s+)[^\s,"';]+/gi,
    replacement: "$1$2[REDACTED]",
  },
  {
    pattern: /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g,
    replacement: "[REDACTED]",
  },
  { pattern: /\b(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, replacement: "$1[REDACTED]@" },
]

export function redactSecrets(value: string): string {
  let redacted = value
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement)
  }
  return redacted
}

function redactValue(value: unknown, key: string | null, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return key && SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : redactSecrets(value)
  }
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return "[REDACTED:CIRCULAR]"
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, null, seen))

  const output: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = redactValue(childValue, childKey, seen)
  }
  return output
}

/** Return a recursively sanitized copy suitable for JSON serialization. */
export function redactForDisk<T>(value: T): T {
  return redactValue(value, null, new WeakSet()) as T
}
