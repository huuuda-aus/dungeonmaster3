/** Seedable PRNG (mulberry32). All simulation randomness goes through this. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** Raw 32-bit unsigned value. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  }
  /** Integer in 0..n-1. */
  int(n: number): number {
    return n <= 0 ? 0 : this.next() % n;
  }
  /** 0 or 1. */
  bit(): number {
    return this.next() & 1;
  }
  /** Integer in 0..3. */
  twoBits(): number {
    return this.next() & 3;
  }
  getState(): number {
    return this.s;
  }
  setState(s: number): void {
    this.s = s >>> 0;
  }
}

export const clamp = (lo: number, v: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** (a * b) >> bits with integer truncation. */
export const scaled = (a: number, bits: number, b: number): number =>
  Math.floor((a * b) / (1 << bits));
