import type { EventKind } from '../../shared/types';
import type { Engine } from '../game/engine';
export function activateEvent(engine: Engine, id: EventKind, duration?: number) {
  const definition = engine.config.events.find(e => e.id === id); if (!definition) throw new Error('Evento não encontrado');
  engine.event = { id, name: definition.name, until: engine.time + (duration ?? definition.duration) * 1000 };
  engine.boss = id === 'boss' ? { x: 500, y: 570, hp: Math.max(600, engine.players.size * 100), maxHp: Math.max(600, engine.players.size * 100) } : null;
  engine.hazards = []; engine.coins = []; engine.zoneRadius = 750;
  if (id === 'teams') [...engine.players.values()].forEach((p, i) => { p.team = i % 2 ? 'azul' : 'vermelho'; });
  engine.narrator.push(id === 'boss' ? 'Um chefe apareceu na arena!' : definition.name + ' começou!', 'event', engine.time);
}
export function tickEvents(e: Engine, dt: number) {
  if (e.event && e.time >= e.event.until) { e.event = null; e.boss = null; e.hazards = []; e.coins = []; e.zoneRadius = 750; }
  if (e.elapsed >= e.nextEvent) {
    const pool = e.config.events.filter(x => x.enabled);
    if (pool.length) activateEvent(e, pool[Math.floor(e.random() * pool.length)].id);
    e.nextEvent = e.elapsed + e.config.eventInterval;
  }
  const id = e.event?.id;
  if (id === 'zone') {
    e.zoneRadius = Math.max(180, e.zoneRadius - dt * 17);
    // The shrinking zone is a visual boundary only; it never removes a fighter or score.
  }
  if (id === 'meteors' && e.random() < dt * 1.5) e.hazards.push({ id: String(++e.serial), x: 70 + e.random() * 860, y: 70 + e.random() * 1010, hitAt: e.time + 1500 });
  // Meteor markers create dodge moments; no HP or score penalty is applied.
  e.hazards = e.hazards.filter(h => e.time < h.hitAt);
  if (id === 'coins' && e.coins.length < 30 && e.random() < dt * 5) e.coins.push({ id: String(++e.serial), x: 80 + e.random() * 840, y: 80 + e.random() * 990 });
  e.coins = e.coins.filter(c => { const p = [...e.players.values()].find(p => p.alive && Math.hypot(p.x - c.x, p.y - c.y) < 40); if (p) { const buff = p.buffs.find(b => b.effect === 'damage'); if (buff) { buff.amount = Math.min(80, buff.amount + 4); buff.until = Math.max(buff.until, e.time + 10000); } else p.buffs.push({ effect: 'damage', amount: 4, until: e.time + 10000 }); e.narrator.push(`${p.username} pegou energia extra para o próximo golpe!`, 'powerup', e.time); } return !p; });
}
