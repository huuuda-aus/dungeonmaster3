/** Deterministic event scheduler: ordered by time, then priority, then insertion. */
export interface GameEvent {
  time: number;
  /** Lower fires first among events with equal time. */
  priority: number;
  kind: string;
  /** Free-form payload; handlers interpret it. */
  data?: Record<string, number | string>;
}

interface Entry {
  ev: GameEvent;
  seq: number;
  id: number;
}

export class Timeline {
  private heap: Entry[] = [];
  private seq = 0;
  private nextId = 1;

  get size(): number {
    return this.heap.length;
  }

  /** Schedule an event; returns an id usable with cancel(). */
  add(ev: GameEvent): number {
    const entry: Entry = { ev, seq: this.seq++, id: this.nextId++ };
    this.heap.push(entry);
    this.up(this.heap.length - 1);
    return entry.id;
  }

  cancel(id: number): boolean {
    const i = this.heap.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.removeAt(i);
    return true;
  }

  cancelWhere(pred: (ev: GameEvent) => boolean): number {
    let n = 0;
    for (let i = this.heap.length - 1; i >= 0; i--) {
      if (pred(this.heap[i]!.ev)) {
        this.removeAt(i);
        n++;
      }
    }
    return n;
  }

  /** Pop and return the next event due at or before `now`, if any. */
  popDue(now: number): GameEvent | undefined {
    const top = this.heap[0];
    if (!top || top.ev.time > now) return undefined;
    this.removeAt(0);
    return top.ev;
  }

  peekTime(): number | undefined {
    return this.heap[0]?.ev.time;
  }

  private less(a: Entry, b: Entry): boolean {
    if (a.ev.time !== b.ev.time) return a.ev.time < b.ev.time;
    if (a.ev.priority !== b.ev.priority) return a.ev.priority < b.ev.priority;
    return a.seq < b.seq;
  }

  private removeAt(i: number): void {
    const last = this.heap.pop()!;
    if (i === this.heap.length) return;
    this.heap[i] = last;
    this.up(i);
    this.down(i);
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(this.heap[i]!, this.heap[p]!)) break;
      [this.heap[i], this.heap[p]] = [this.heap[p]!, this.heap[i]!];
      i = p;
    }
  }

  private down(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(this.heap[l]!, this.heap[m]!)) m = l;
      if (r < n && this.less(this.heap[r]!, this.heap[m]!)) m = r;
      if (m === i) break;
      [this.heap[i], this.heap[m]] = [this.heap[m]!, this.heap[i]!];
      i = m;
    }
  }
}
