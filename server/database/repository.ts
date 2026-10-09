import { PrismaClient } from '@prisma/client';
import type { Rank } from '../../shared/types';
import { periodKeys } from '../ranking/periods';
export { periodKeys } from '../ranking/periods';
export interface ScoreDelta { sessionId: string; userId: string; username: string; points: number; kills: number; wins: number; at: Date }
export class Repository {
  db: PrismaClient; private chain: Promise<void> = Promise.resolve(); lastError: string | null = null;
  constructor(url?: string) { this.db = new PrismaClient(url ? { datasourceUrl: url } : undefined); }
  private enqueue(job: () => Promise<unknown>) {
    const next = this.chain.then(job).then(() => { this.lastError = null; });
    this.chain = next.catch(error => { this.lastError = String(error); console.error('Banco:', error); }); return next;
  }
  start(id: string) { return this.enqueue(() => this.db.session.create({ data: { id } })); }
  end(id: string) { return this.enqueue(() => this.db.session.update({ where: { id }, data: { endedAt: new Date() } })); }
  score(delta: ScoreDelta) {
    return this.enqueue(async () => {
      const { day, week } = periodKeys(delta.at);
      await this.db.$transaction(async tx => {
        await tx.user.upsert({ where: { id: delta.userId }, create: { id: delta.userId, username: delta.username }, update: { username: delta.username } });
        await tx.score.upsert({ where: { userId_sessionId_day: { userId: delta.userId, sessionId: delta.sessionId, day } },
          create: { userId: delta.userId, sessionId: delta.sessionId, day, week, points: delta.points, kills: delta.kills, wins: delta.wins },
          update: { points: { increment: delta.points }, kills: { increment: delta.kills }, wins: { increment: delta.wins } } });
      });
    });
  }
  async ranking(period: string, session: string): Promise<Rank[]> {
    await this.chain; const keys = periodKeys();
    const where = period === 'session' ? { sessionId: session } : period === 'day' ? { day: keys.day } : period === 'week' ? { week: keys.week } : {};
    const scores = await this.db.score.groupBy({ by: ['userId'], where, _sum: { points: true, kills: true, wins: true }, orderBy: { _sum: { points: 'desc' } }, take: 50 });
    const users = await this.db.user.findMany({ where: { id: { in: scores.map(s => s.userId) } } });
    return scores.map(s => ({ username: users.find(u => u.id === s.userId)?.username ?? s.userId, points: s._sum.points ?? 0, kills: s._sum.kills ?? 0, wins: s._sum.wins ?? 0 }));
  }
  async close() { await this.chain; await this.db.$disconnect(); }
}
