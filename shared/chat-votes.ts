import type { FighterProfile } from './types';

export function defaultChatCommand(fighter: Pick<FighterProfile, 'id'>, index: number) {
  if (fighter.id === 'fighter-azul') return '!bolsonaro';
  if (fighter.id === 'fighter-rosa') return '!lula';
  return index === 0 ? '!bolsonaro' : '!lula';
}

export function normalizeChatCommand(command: string) {
  return command.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

export function chatVoteFor(fighter: FighterProfile, index: number) {
  return {
    fighterId: fighter.id,
    fighterName: fighter.name,
    command: fighter.chatCommand ?? defaultChatCommand(fighter, index),
    points: fighter.chatPoints ?? 1,
  };
}
