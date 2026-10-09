import { randomUUID } from 'node:crypto';
import type { Notice } from '../../shared/types';
export class Narrator {
  queue: Notice[] = []; feed: Notice[] = []; current: Notice | null = null; private until = 0; private latestComment: Notice | null = null;
  push(text: string, kind: string, now: number) {
    const notice = { id: randomUUID(), text, kind, at: now };
    this.feed = [notice, ...this.feed].slice(0, 30);
    if (kind === 'comment') {
      this.latestComment = notice;
      this.queue = this.queue.filter(item => item.kind !== 'comment');
      return;
    }
    const priority: Record<string, number> = { win: 7, 'gift-voice': 6, gift: 6, event: 5, comment: 4, reply: 4, kill: 3, follow: 3, share: 3, like: 2, leader: 1, join: 0 };
    this.queue.push(notice);
    this.queue.sort((a, b) => (priority[b.kind] ?? 0) - (priority[a.kind] ?? 0));
    this.queue = this.queue.slice(0, 12);
  }
  tick(now: number, enabled: boolean) {
    if (!enabled) { this.queue = []; this.current = null; this.latestComment = null; return; }
    if (this.latestComment) {
      this.current = this.latestComment; this.latestComment = null;
      this.until = now + Math.max(4000, this.current.text.length * 85);
      return;
    }
    if (now >= this.until) { this.current = this.queue.shift() ?? null; this.until = now + (this.current ? Math.max(4000, this.current.text.length * 85) : 0); }
  }
  clear() { this.queue = []; this.current = null; this.latestComment = null; this.until = 0; }
}
