import type { FighterMove, Player } from '../../shared/types';
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export const moveReach: Record<FighterMove, number> = { punch: 405, kick: 445, sweep: 420, jump: 435 };
export function damageFor(p: Player) { return p.damage + p.buffs.reduce((v, b) => v + b.amount, 0); }
export function scoreForMove(p: Player, move: FighterMove) { return Math.max(1, Math.floor(damageFor(p) * ({ punch: 1, kick: 1.35, sweep: 1.15, jump: 1.25 })[move])); }
export function opposing(a: Player, b: Player, teams: boolean) { return a.id !== b.id && b.alive && (!teams || !a.team || a.team !== b.team); }
export function hit(target: Player, amount: number, now: number): boolean {
  if (!target.alive || now < target.invulnerableUntil) return false;
  target.hp = Math.max(0, target.hp - Math.max(1, amount - target.defense));
  if (target.hp === 0) { target.alive = false; target.respawnAt = now + 5000; target.buffs = []; return true; } return false;
}
