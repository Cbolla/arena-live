import { randomUUID } from 'node:crypto';
import type { Config, FighterMove, FighterProfile, Player, Snapshot } from '../../shared/types';
import { createPlayer, gainXp, respawn } from '../players/players';
import { distance, moveReach, scoreForMove } from '../combat/combat';
import { Narrator } from '../tts/narrator';
import { tickEvents } from '../events/events';
import type { ScoreDelta } from '../database/repository';
import { chatVoteFor } from '../../shared/chat-votes';

const positions = [{ x: 220, y: 850 }, { x: 780, y: 850 }];
export class Engine {
  players = new Map<string, Player>(); running = false; phase: Snapshot['phase'] = 'waiting'; elapsed = 0; time = 0; session = randomUUID();
  event: Snapshot['event'] = null; boss: Snapshot['boss'] = null; hazards: Snapshot['hazards'] = []; coins: Snapshot['coins'] = [];
  weapons: Snapshot['weapons'] = [];
  lastGift: Snapshot['lastGift'] = null; presenterGuest: Snapshot['presenterGuest'] = null; likeRanking = new Map<string, { username: string; count: number }>(); winner: Snapshot['winner'] = null; nextRoundIn = 0; zoneRadius = 750; narrator = new Narrator(); nextEvent: number; serial = 0;
  private bossAttackAt = 0; private narrationTime = 0; private sceneClock = 0;
  private rotationScenes: string[] = []; private rotationActive = ''; private rotationEnabled = false; private rotationInterval = 60; private rotationStartedAt = 0; private rotationBaseIndex = 0;
  onScore: (delta: ScoreDelta) => void = () => {}; onEnd: (id: string) => void = () => {};
  constructor(public config: Config, public random = Math.random) { this.nextEvent = config.eventInterval; this.syncFighters(); }
  private makeFighter(profile: FighterProfile, index: number): Player {
    const p = createPlayer(profile.name, this.time, () => .5);
    return { ...p, id: profile.id, username: profile.name, avatar: profile.avatar, fullBody: profile.fullBody ?? '', damageImage: profile.damageImage ?? '', poseImages: profile.poseImages ?? {}, color: profile.color, style: profile.style ?? 'boxing', x: positions[index].x, y: positions[index].y, speed: 94, damage: 12, defense: 1, hp: 100, maxHp: 100, damageDealt: 0, attackQueue: [], attackMove: 'punch', attackSequence: 0, damageSequence: 0, team: index === 0 ? 'azul' : 'vermelho' };
  }
  syncFighters() {
    this.players = new Map(this.config.fighters.map((profile, index) => {
      const old = this.players.get(profile.id); const p = old ?? this.makeFighter(profile, index);
      p.username = profile.name; p.avatar = profile.avatar; p.fullBody = profile.fullBody ?? ''; p.damageImage = profile.damageImage ?? ''; p.poseImages = profile.poseImages ?? {}; p.color = profile.color; p.style = profile.style ?? 'boxing'; p.team = index === 0 ? 'azul' : 'vermelho';
      return [profile.id, p];
    }));
  }
  add(username: string) { const p = [...this.players.values()].find(f => f.username.toLowerCase() === username.toLowerCase()); if (!p) throw new Error('Cadastre os dois lutadores no painel. Comentários não criam jogadores.'); return p; }
  showGiftSender(username: string, avatar?: string) {
    this.presenterGuest = avatar ? { username: username.replace(/^@/, ''), avatar } : null;
  }
  award(p: Player, points: number, kills = 0, wins = 0) {
    const safe = Math.max(0, Math.floor(points)); p.points += safe; p.kills += kills;
    this.onScore({ sessionId: this.session, userId: p.id, username: p.username, points: safe, kills, wins, at: new Date() });
  }
  hurt(target: Player, amount: number, attacker?: Player) {
    if (!attacker) return;
    // Hits remain visible and track damage,
    // but do not add a second, damage-based score on top of the gift points.
    const points = Math.max(1, Math.floor(amount)); attacker.damageDealt += points;
    target.damageSequence++;
    target.invulnerableUntil = this.time + 180;
  }
  addWeaponDrops(count = 2) {
    for (let i = 0; i < count && this.weapons.length < 10; i++) this.weapons.push({ id: String(++this.serial), x: 430 + this.random() * 140, y: 440 + this.random() * 270, expiresAt: this.time + 25000 });
  }
  boostBoth(amount: number, duration = 12000) {
    for (const p of this.players.values()) {
      const existing = p.buffs.find(b => b.effect === 'damage');
      if (existing) { existing.amount = Math.min(80, existing.amount + amount); existing.until = Math.max(existing.until, this.time + duration); }
      else p.buffs.push({ effect: 'damage', amount: Math.min(80, amount), until: this.time + duration });
    }
  }
  private prepareRound() {
    this.elapsed = 0; this.event = null; this.boss = null; this.hazards = []; this.coins = []; this.weapons = []; this.zoneRadius = 750;
    this.winner = null; this.lastGift = null;
    [...this.players.values()].forEach((p, i) => { p.x = positions[i].x; p.y = positions[i].y; p.hp = p.maxHp; p.alive = true; p.damageDealt = 0; p.points = 0; p.kills = 0; p.buffs = []; p.attackQueue = []; p.attackAt = this.time + 700; p.invulnerableUntil = this.time + 1600; });
  }
  start() { this.prepareRound(); this.phase = 'fight'; this.running = true; this.nextRoundIn = 0; this.narrator.push('Lutadores, preparem-se! A luta começou!', 'event', this.time); }
  finish() {
    if (this.phase !== 'fight') return;
    const fighters = [...this.players.values()]; const first = fighters[0]; const second = fighters[1];
    const winner = first.points === second.points ? null : first.points > second.points ? first : second;
    this.winner = winner ? { name: winner.username, damage: winner.points } : { name: 'Empate', damage: first.points };
    if (winner) this.award(winner, 0, 0, 1);
    this.phase = 'result'; this.running = false; this.nextRoundIn = 8;
    this.narrator.push(winner ? `${winner.username} venceu com ${winner.points} pontos!` : `Empate! ${first.points} pontos para cada lutador.`, 'win', this.time);
  }
  reset() {
    this.onEnd(this.session); this.session = randomUUID(); this.running = false; this.phase = 'waiting'; this.elapsed = 0; this.time = 0;
    this.event = null; this.boss = null; this.hazards = []; this.coins = []; this.weapons = []; this.lastGift = null; this.presenterGuest = null; this.winner = null; this.nextRoundIn = 0; this.zoneRadius = 750;
    this.narrator = new Narrator(); this.likeRanking.clear(); this.nextEvent = this.config.eventInterval; this.bossAttackAt = 0; this.narrationTime = 0; this.syncFighters();
  }
  tick(dt: number) {
    dt = Math.min(dt, .1); this.narrationTime += dt * 1000; this.sceneClock += dt * 1000;
    if (!this.running) {
      if (this.phase === 'result') { this.time += dt * 1000; this.nextRoundIn = Math.max(0, this.nextRoundIn - dt); if (this.nextRoundIn <= 0) this.start(); }
      this.narrator.tick(this.narrationTime, this.config.narrator); return;
    }
    this.time += dt * 1000; this.elapsed += dt; tickEvents(this, dt);
    const list = [...this.players.values()]; const [a, b] = list;
    for (const p of list) {
      if (!p.alive) { if (this.time >= p.respawnAt) respawn(p, this.time, this.random); continue; }
      p.buffs = p.buffs.filter(buff => buff.until > this.time);
      let target = list.find(other => other.id !== p.id)!;
      const drop = this.weapons.filter(w => w.expiresAt > this.time).sort((x, y) => distance(p, x) - distance(p, y))[0];
      if (drop && distance(p, drop) < distance(p, target) * 1.15) {
        target = { ...target, x: drop.x, y: drop.y };
        if (distance(p, drop) < 46) { p.buffs.push({ effect: 'damage', amount: 18, until: this.time + 12000 }); this.weapons = this.weapons.filter(w => w.id !== drop.id); this.narrator.push(`${p.username} pegou uma arma! Dano aumentado!`, 'powerup', this.time); }
      }
      const dx = target.x - p.x; const dy = target.y - p.y; const d = Math.hypot(dx, dy) || 1;
      const defaultRange = p.buffs.some(buff => buff.effect === 'weapon') ? 430 : p.buffs.some(buff => buff.effect === 'giant') ? 415 : 400;
      const range = p.attackQueue.length ? moveReach[p.attackQueue[0]] : defaultRange;
      if (d > range) { const speed = p.speed * (this.event?.id === 'speed' ? 1.5 : 1); p.x += dx / d * Math.min(speed * dt, d - range); p.y += dy / d * Math.min(speed * dt, d - range); }
      p.x = Math.max(180, Math.min(820, p.x)); p.y = Math.max(700, Math.min(950, p.y));
      const opponent = list.find(other => other.id !== p.id)!;
      const move: FighterMove | undefined = p.attackQueue[0];
      if (move && this.time >= p.attackAt && opponent.alive && distance(p, opponent) <= moveReach[move]) {
        p.attackQueue.shift(); p.attackMove = move; p.attackSequence++; p.attackAt = this.time + 700;
        this.hurt(opponent, scoreForMove(p, move), p);
      }
    }
    this.weapons = this.weapons.filter(weapon => weapon.expiresAt > this.time);
    if (this.boss && this.time >= this.bossAttackAt) { for (const p of list) if (distance(p, this.boss) < 180) this.hurt(p, 10); this.bossAttackAt = this.time + 1800; }
    if (this.elapsed >= this.config.matchDuration) this.finish();
    this.narrator.tick(this.narrationTime, this.config.narrator);
  }
  private currentArenaScene() {
    const scenes = this.config.arenaBackgrounds?.length ? this.config.arenaBackgrounds : this.config.arenaBackground ? [this.config.arenaBackground] : [];
    const active = this.config.arenaBackground ?? scenes[0] ?? '';
    const enabled = this.config.autoRotateArena === true && scenes.length > 1;
    const interval = this.config.arenaRotationInterval ?? 60;
    if (scenes !== this.rotationScenes || active !== this.rotationActive || enabled !== this.rotationEnabled || interval !== this.rotationInterval) {
      this.rotationScenes = scenes; this.rotationActive = active; this.rotationEnabled = enabled; this.rotationInterval = interval; this.rotationStartedAt = this.sceneClock;
      this.rotationBaseIndex = Math.max(0, scenes.indexOf(active));
    }
    const elapsed = this.sceneClock - this.rotationStartedAt;
    const rotationStep = Math.floor(elapsed / (interval * 1000));
    const index = enabled ? (this.rotationBaseIndex + rotationStep) % scenes.length : this.rotationBaseIndex;
    const rotationRemaining = enabled ? Math.max(0, Math.ceil((interval * 1000 - (elapsed % (interval * 1000))) / 1000)) : null;
    return { background: scenes[index] ?? active, index, rotationRemaining };
  }
  snapshot(): Snapshot {
    const arenaScene = this.currentArenaScene();
    const likeRanking = [...this.likeRanking.values()].sort((a, b) => b.count - a.count || a.username.localeCompare(b.username)).slice(0, 5);
    return { players: [...this.players.values()], running: this.running, phase: this.phase, elapsed: this.elapsed, duration: this.config.matchDuration, session: this.session, winner: this.winner, nextRoundIn: this.nextRoundIn, event: this.event, boss: this.boss, hazards: this.hazards, coins: this.coins, weapons: this.weapons, zoneRadius: this.zoneRadius, notice: this.narrator.current, feed: this.narrator.feed, lastGift: this.lastGift, presenterGuest: this.presenterGuest, likeRanking, chatVotes: this.config.fighters.map(chatVoteFor), settings: { narrator: this.config.narrator, sound: this.config.sound, volume: this.config.volume, tts: this.config.tts }, arenaBackground: arenaScene.background, arenaBackgroundIndex: arenaScene.index, arenaRotationRemaining: arenaScene.rotationRemaining, presenterAvatar: this.config.presenterAvatar ?? '', presenterPosition: this.config.presenterPosition ?? { x: 0.76, y: 0.02 }, time: this.time, nextEventIn: Math.max(0, this.nextEvent - this.elapsed), source: 'simulator' };
  }
}
