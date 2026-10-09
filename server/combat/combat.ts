import type { FighterMove, Player } from '../../shared/types';
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export const moveReach: Record<FighterMove, number> = { punch: 155, kick: 205, sweep: 180, jump: 210 };
export function damageFor(p: Player) { return p.damage + p.buffs.reduce((v, b) => v + b.amount, 0); }
export function scoreForMove(p: Player, move: FighterMove) { return Math.max(1, Math.floor((p.moveDamage?.[move] ?? p.damage) + p.buffs.reduce((value, buff) => value + buff.amount, 0))); }
export function opposing(a: Player, b: Player, teams: boolean) { return a.id !== b.id && b.alive && (!teams || !a.team || a.team !== b.team); }
export function hit(target: Player, amount: number, now: number): boolean {
  if (!target.alive || now < target.invulnerableUntil) return false;
  target.hp = Math.max(0, target.hp - Math.max(1, amount - target.defense));
  if (target.hp === 0) { target.alive = false; target.respawnAt = now + 5000; target.buffs = []; return true; } return false;
}
