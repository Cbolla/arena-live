import type { Engine } from '../game/engine';
import { queueAction, queueRandomAttacks } from '../game/moves';
import { activateEvent } from '../events/events';

/** A configured gift awards its saved points and queues varied random attacks. */
export function applyGift(e: Engine, id: string, count: number, sender: string) {
  const gift = e.config.gifts.find(item => item.id === id);
  if (!gift) throw new Error('Presente não configurado');
  const targets = e.config.fighters.filter(fighter => fighter.giftIds.includes(id));
  if (!targets.length) throw new Error('Configure um lutador para este presente na aba Jogadores');
  if (e.phase === 'waiting' || e.phase === 'result') e.start();
  if (gift.effect === 'heal') {
    const fallbackTarget = targets[0].id;
    const recipient = e.players.get(gift.healTargetId ?? fallbackTarget);
    if (recipient?.alive) {
      const recovered = Math.min(recipient.maxHp - recipient.hp, gift.amount * count);
      recipient.hp += recovered;
      if (recovered > 0) e.narrator.push(`${recipient.username} recuperou ${recovered} de vida com ${gift.name}!`, 'powerup', e.time);
    }
  }
  for (const fighter of targets) {
    const player = e.players.get(fighter.id);
    if (!player) continue;
    const action = fighter.giftMoves?.[id];
    if (action) queueAction(player, action, count);
    else queueRandomAttacks(player, Math.min(count, 100), e.random);
    if (gift.effect === 'damage' || gift.effect === 'weapon' || gift.effect === 'giant') {
      const amount = Math.min(80, gift.amount * count);
      const buff = player.buffs.find(item => item.effect === gift.effect);
      if (buff) { buff.amount = Math.min(80, buff.amount + amount); buff.until = Math.max(buff.until, e.time + Math.max(1, gift.duration) * 1000); }
      else player.buffs.push({ effect: gift.effect, amount, until: e.time + Math.max(1, gift.duration) * 1000 });
      e.narrator.push(`${fighter.name} ganhou +${amount} de dano por ${Math.max(1, gift.duration)} segundos com ${gift.name}!`, 'powerup', e.time);
    } else if (gift.effect === 'boss') {
      activateEvent(e, 'boss');
      e.narrator.push(`${sender} invocou um chefe na arena com ${gift.name}!`, 'event', e.time);
    }
    e.award(player, gift.points * count);
  }
  const target = targets.length === 1 ? e.players.get(targets[0].id)?.username ?? '' : '';
  e.lastGift = { username: sender, name: gift.name, count, target, targetIds: targets.map(fighter => fighter.id), points: gift.points * count, image: gift.image || undefined };
  e.narrator.push(`Obrigado, ${sender}, pelo presente ${gift.name}!${count > 1 ? ` Foram ${count} presentes!` : ''}`, 'gift-voice', e.time);
}
