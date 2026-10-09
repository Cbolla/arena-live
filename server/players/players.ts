import type { Player } from '../../shared/types';
const colors = ['#91ee64', '#a18bff', '#ffaf69', '#64d5ee', '#f684b6', '#f2db65'];
export function identity(username: string) { return username.trim().replace(/^@/, '').toLowerCase(); }
export function createPlayer(username: string, now: number, random = Math.random): Player {
  const id = identity(username); let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { id, username: username.replace(/^@/, ''), avatar: '', damageImage: '', damageSequence: 0, color: colors[hash % colors.length], x: 100 + random() * 800, y: 100 + random() * 950, hp: 100, maxHp: 100, damage: 12, damageDealt: 0, defense: 3, speed: 78, level: 1, xp: 0, kills: 0, points: 0, alive: true, respawnAt: 0, team: null, buffs: [], attackAt: now, attackQueue: [], attackMove: 'punch', attackSequence: 0, invulnerableUntil: now + 3000 };
}
export function gainXp(p: Player, amount: number) {
  p.xp += amount;
  while (p.level < 50 && p.xp >= p.level * 50) { p.xp -= p.level * 50; p.level++; p.maxHp += 8; p.hp = Math.min(p.maxHp, p.hp + 20); p.damage += 2; }
}
export function respawn(p: Player, now: number, random = Math.random) { p.alive = true; p.hp = p.maxHp; p.x = 90 + random() * 820; p.y = 90 + random() * 970; p.invulnerableUntil = now + 3000; p.attackAt = now; p.buffs = []; }
