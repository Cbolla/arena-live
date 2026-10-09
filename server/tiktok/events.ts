import { z } from 'zod';
import type { Engine } from '../game/engine';
import type { LiveEvent } from '../../shared/types';
import { applyGift } from '../gifts/gifts';
import { identity } from '../players/players';
import { chatVoteFor, normalizeChatCommand } from '../../shared/chat-votes';
import { queueRandomAttacks } from '../game/moves';
export const usernameSchema = z.string().trim().min(1).max(32).regex(/^@?[\p{L}\p{N}_.-]+$/u, 'Use letras, números, ponto, hífen ou sublinhado');
const liveDisplayNameSchema = z.string().trim().min(1).max(32).regex(/^[^\u0000-\u001f\u007f]+$/u, 'Nome de exibição inválido');
export const liveEventSchema = z.object({ id: z.string().min(1).max(100), type: z.enum(['join', 'comment', 'like', 'follow', 'share', 'gift']), username: liveDisplayNameSchema, text: z.string().max(300).optional(), giftId: z.string().max(40).optional(), targetId: z.string().max(40).optional(), count: z.number().int().min(1).max(10000).default(1), avatar: z.string().url().max(1000).regex(/^https?:\/\//i).optional() });
export interface LiveAdapter { connect(onEvent: (event: LiveEvent) => void): Promise<void>; disconnect(): Promise<void> }
/** Real adapters map provider IDs and emit only newly received gift units. Never expose credentials to the browser. */
export class EventGateway {
  private seen = new Set<string>(); private cooldowns = new Map<string, number>();
  constructor(private engine: Engine, private clock = Date.now) {}
  clear() { this.seen.clear(); this.cooldowns.clear(); }
  showGiftSender(username: string, avatar?: string) {
    const sender = liveEventSchema.pick({ username: true, avatar: true }).parse({ username, avatar });
    this.engine.showGiftSender(sender.username, sender.avatar);
  }
  accept(input: unknown) {
    const event = liveEventSchema.parse(input); const e = this.engine;
    if (this.seen.has(event.id)) return { message: 'Evento duplicado ignorado' };
    if (event.type === 'gift' && !e.config.gifts.some(g => g.id === event.giftId)) throw new Error('Presente não configurado');
    const key = identity(event.username); const now = this.clock();
    const comment = event.type === 'comment' ? normalizeChatCommand(event.text ?? '') : '';
    const voteIndex = event.type === 'comment' ? e.config.fighters.findIndex((fighter, index) => normalizeChatCommand(chatVoteFor(fighter, index).command) === comment) : -1;
    const vote = voteIndex >= 0 ? chatVoteFor(e.config.fighters[voteIndex], voteIndex) : undefined;
    const gate = `${key}:${event.type}`;
    if (event.type !== 'gift' && event.type !== 'like' && !vote && now < (this.cooldowns.get(gate) ?? 0)) return { message: 'Cooldown ativo. Aguarde alguns segundos.' };
    this.seen.add(event.id); if (this.seen.size > 10000) this.seen.delete(this.seen.values().next().value!);
    if (event.type !== 'like' && !vote) this.cooldowns.set(gate, now + (event.type === 'follow' ? 86400000 : event.type === 'share' ? 30000 : 3000));
    if (this.cooldowns.size > 10000) for (const [k, expiry] of this.cooldowns) if (expiry <= now) this.cooldowns.delete(k);
    // Viewer events affect the two administrator-configured fighters; viewers never become fighters.
    if (event.type === 'join') return { message: `${event.username} entrou na live` };
    if (event.type === 'gift') { this.showGiftSender(event.username, event.avatar); applyGift(e, event.giftId!, event.count, event.username); }
    else if (event.type === 'comment') {
      const original = (event.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      const text = original.toLowerCase();
      if (vote) {
        const fighter = vote ? e.config.fighters.find(profile => profile.id === vote.fighterId) : undefined;
        const player = fighter ? e.players.get(fighter.id) : undefined;
        if (vote && fighter && player) {
          if (e.phase === 'waiting' || e.phase === 'result') e.start();
          e.award(player, vote.points);
          // A configured score command also queues one visible punch for its fighter.
          queueRandomAttacks(player, 1, e.random);
          e.narrator.push(`${event.username} votou em ${fighter.name}! +${vote.points} ${vote.points === 1 ? 'ponto' : 'pontos'}.`, 'comment', e.time);
        }
      } else if (original) e.narrator.push(`${event.username} comentou: ${original.slice(0, 110)}${original.length > 110 ? '…' : ''}`, 'comment', e.time);
      if (text === '!vida') e.narrator.push(`Placar: ${e.config.fighters.map(f => `${f.name} ${e.players.get(f.id)?.points ?? 0} pontos`).join(', ')}.`, 'reply', e.time);
      if (text === '!ranking') e.narrator.push(`Pontos: ${e.config.fighters.map(f => `${f.name} ${e.players.get(f.id)?.points ?? 0}`).join(', ')}.`, 'reply', e.time);
      if (text === '!atacar' || text === 'atacar') { if (e.phase === 'waiting' || e.phase === 'result') e.start(); for (const fighter of e.config.fighters) { const player = e.players.get(fighter.id); if (player) queueRandomAttacks(player, 1, e.random); } e.boostBoth(2, 8000); e.narrator.push('Comentário de ataque! Os dois lutadores ganharam força.', 'reply', e.time); }
    } else {
      if (event.type === 'follow') { e.addWeaponDrops(2); e.narrator.push(`${event.username} seguiu! Duas armas caíram. Os lutadores correm para pegá-las!`, 'follow', e.time); }
      if (event.type === 'share') { e.boostBoth(3, 10000); e.narrator.push(`${event.username} compartilhou! Os dois lutadores ganharam força.`, 'share', e.time); }
      if (event.type === 'like') {
        const previous = e.likeRanking.get(key);
        e.likeRanking.set(key, { username: previous?.username ?? event.username.replace(/^@/, ''), count: (previous?.count ?? 0) + event.count });
        e.boostBoth(Math.min(20, Math.max(2, Math.ceil(event.count / 2))), 15000);
      }
    }
    return { message: 'Interação recebida' };
  }
}
