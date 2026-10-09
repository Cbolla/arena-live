import type { Engine } from '../game/engine';
import { queueRandomAttacks } from '../game/moves';

/** A configured gift awards its saved points and queues varied random attacks. */
export function applyGift(e: Engine, id: string, count: number, sender: string) {
  const gift = e.config.gifts.find(item => item.id === id);
  if (!gift) throw new Error('Presente não configurado');
  const targets = e.config.fighters.filter(fighter => fighter.giftIds.includes(id));
  if (!targets.length) throw new Error('Configure um lutador para este presente na aba Jogadores');
  if (e.phase === 'waiting' || e.phase === 'result') e.start();
  for (const fighter of targets) {
    const player = e.players.get(fighter.id);
    if (!player) continue;
    queueRandomAttacks(player, Math.min(count, 100), e.random);
    e.award(player, gift.points * count);
  }
  const target = targets.length === 1 ? e.players.get(targets[0].id)?.username ?? '' : '';
  e.lastGift = { username: sender, name: gift.name, count, target, targetIds: targets.map(fighter => fighter.id), points: gift.points * count, image: gift.image || undefined };
  e.narrator.push(`Obrigado, ${sender}, pelo presente ${gift.name}!${count > 1 ? ` Foram ${count} presentes!` : ''}`, 'gift-voice', e.time);
}
