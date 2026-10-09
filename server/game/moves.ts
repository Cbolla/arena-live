import type { FighterAction, FighterMove, Player } from '../../shared/types';

const randomMoves: FighterMove[] = ['punch', 'kick', 'sweep', 'jump'];

export function randomFighterMove(random: () => number, previous?: FighterMove): FighterMove {
  const choices = previous ? randomMoves.filter(move => move !== previous) : randomMoves;
  const value = Math.min(0.999999999, Math.max(0, random()));
  return choices[Math.floor(value * choices.length)];
}

export function queueRandomAttacks(player: Pick<Player, 'attackQueue' | 'attackMove' | 'attackSequence'>, count: number, random: () => number) {
  const queued = player.attackQueue[player.attackQueue.length - 1];
  let previous: FighterMove | undefined = queued && randomMoves.includes(queued as FighterMove) ? queued as FighterMove : player.attackSequence > 0 ? player.attackMove : undefined;
  for (let i = 0; i < count; i++) {
    previous = randomFighterMove(random, previous);
    player.attackQueue.push(previous);
  }
}

export function queueAction(player: Pick<Player, 'attackQueue'>, action: FighterAction, count = 1) {
  for (let i = 0; i < Math.min(100, count); i++) player.attackQueue.push(action);
}
