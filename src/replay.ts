export class ReplayCache {
  private map = new Map<string, number>()
  private maxEntries: number
  private now: () => number

  constructor(opts: { maxEntries?: number; now?: () => number } = {}) {
    this.maxEntries = opts.maxEntries ?? 100_000
    this.now = opts.now ?? (() => Date.now())
  }

  markUsed(key: string, expiresAtMs: number): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, expiresAtMs)
  }

  isUsed(key: string): boolean {
    const exp = this.map.get(key)
    if (exp === undefined) return false
    if (exp <= this.now()) {
      this.map.delete(key)
      return false
    }
    return true
  }
}
