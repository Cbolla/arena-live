import { test } from 'node:test';
import assert from 'node:assert/strict';
import defaults from '../config/game.json';
import type { Config } from '../shared/types';
import { Engine } from '../server/game/engine';
import { scoreForMove } from '../server/combat/combat';
import { EventGateway } from '../server/tiktok/events';
import { periodKeys } from '../server/database/repository';
import { configSchema } from '../server/config';
import { isFinalTikTokGift, matchTikTokGift, TikTokGiftCounter, tiktokUserAvatar } from '../server/tiktok/live-adapter';
import { Narrator } from '../server/tts/narrator';
import { isRecentDuplicateGiftSpeech } from '../shared/speech-dedupe';
import { withoutAssets } from '../server/websocket/socket';
function make(random = () => .5) { const config = structuredClone(defaults) as unknown as Config; config.autoFight = true; config.eventInterval = 3600; config.matchDuration = 30; config.fighters.forEach(fighter => { fighter.randomAttacks = false; }); return new Engine(config, random); }
function advance(e: Engine, seconds: number) { for (let i = 0; i < seconds * 20; i++) e.tick(.05); }
test('automatic arena rotation follows the configured interval while the match is waiting', () => {
  const e = make(); e.config.arenaBackgrounds = ['scene-a', 'scene-b', 'scene-c']; e.config.arenaBackground = 'scene-b'; e.config.autoRotateArena = true; e.config.arenaRotationInterval = 10;
  assert.equal(e.snapshot().arenaBackground, 'scene-b'); assert.equal(e.snapshot().arenaBackgroundIndex, 1); assert.equal(e.snapshot().arenaRotationRemaining, 10);
  advance(e, 4); assert.equal(e.snapshot().arenaRotationRemaining, 6);
  advance(e, 6); assert.equal(e.snapshot().arenaBackground, 'scene-c'); assert.equal(e.snapshot().arenaBackgroundIndex, 2); assert.equal(e.snapshot().arenaRotationRemaining, 10);
  advance(e, 10); assert.equal(e.snapshot().arenaBackground, 'scene-a'); assert.equal(e.snapshot().arenaBackgroundIndex, 0);
  e.config.autoRotateArena = false; assert.equal(e.snapshot().arenaBackground, 'scene-b'); assert.equal(e.snapshot().arenaBackgroundIndex, 1); assert.equal(e.snapshot().arenaRotationRemaining, null);
});
test('a gift and chat command enqueue the exact configured fighter actions', () => {
  const e = make(); e.config.fighters[0].giftMoves = { rose: 'run' }; e.config.fighters[1].chatAction = 'dash';
  const gateway = new EventGateway(e);
  gateway.accept({ id: 'mapped-gift', type: 'gift', username: 'Ana', giftId: 'rose', count: 2 });
  gateway.accept({ id: 'mapped-command', type: 'comment', username: 'Bia', text: '!lula' });
  assert.deepEqual(e.players.get('fighter-azul')!.attackQueue, ['run', 'run']);
  assert.deepEqual(e.players.get('fighter-rosa')!.attackQueue, ['dash']);
  assert.equal(e.players.get('fighter-azul')!.points, e.config.gifts.find(gift => gift.id === 'rose')!.points * 2);
  assert.equal(e.players.get('fighter-rosa')!.points, 0);
});test('audience comments never create fighters; configured roster remains two', () => {
  const e = make(); let now = 10000; const g = new EventGateway(e, () => now); const ids = [...e.players.keys()];
  g.accept({ id: 'join', type: 'join', username: 'William' }); assert.equal(e.players.size, 2);
  g.accept({ id: '1', type: 'comment', username: 'William', text: 'Ataque o chefe!' }); assert.equal(e.players.size, 2);
  assert.deepEqual([...e.players.keys()], ids); assert.match(e.narrator.feed[0].text, /William comentou: Ataque o chefe/);
  const oldFeed = e.narrator.feed.length; g.accept({ id: '2', type: 'comment', username: 'William', text: '!atacar' }); assert.equal(e.narrator.feed.length, oldFeed);
  now += 3100; g.accept({ id: '3', type: 'comment', username: 'William', text: '!atacar' });
  assert.ok([...e.players.values()].every(p => p.buffs.some(b => b.effect === 'damage')));
});
test('the rose can trigger and visibly retain its configured dash pose', () => {
  const e = make(); const fighter = e.players.get('fighter-azul')!; const dashImage = 'data:image/webp;base64,dGVzdA==';
  e.config.fighters[0].giftMoves = { rose: 'dash' }; e.config.fighters[0].poseImages = { dash: [dashImage] };
  e.syncFighters(); const gateway = new EventGateway(e);
  gateway.accept({ id: 'rose-dash', type: 'gift', username: 'Ana', giftId: 'rose', count: 1 });
  assert.deepEqual(fighter.attackQueue, ['dash']); assert.deepEqual(fighter.poseImages?.dash, [dashImage]);
  fighter.x = 400; fighter.y = 850; fighter.attackAt = 0; fighter.invulnerableUntil = 10000; e.players.get('fighter-rosa')!.x = 800;
  advance(e, .1);
  assert.equal(fighter.activeAction, 'dash'); assert.equal(fighter.actionSequence, 1);
});
test('fighter life and per-move damage use the saved settings', () => {
  const e = make(); const [a, b] = [...e.players.values()];
  e.config.fighters[0].maxHp = 240; e.config.fighters[0].moveDamage = { punch: 7, kick: 31, sweep: 18, jump: 22 };
  e.syncFighters(); e.start();
  assert.equal(a.hp, 240); assert.equal(a.maxHp, 240);
  assert.equal(scoreForMove(a, 'kick'), 31); assert.equal(scoreForMove(a, 'punch'), 7);
  assert.ok(b.maxHp > 0);
});
test('!bolsonaro and !lula trigger their assigned actions without the comment cooldown', () => {
  const e = make(); const g = new EventGateway(e, () => 1000);
  const bolsonaro = e.players.get('fighter-azul')!; const lula = e.players.get('fighter-rosa')!;
  g.accept({ id: 'vote-bolsonaro-1', type: 'comment', username: 'Ana', text: '!bolsonaro' });
  g.accept({ id: 'vote-bolsonaro-2', type: 'comment', username: 'Ana', text: '!bolsonaro' });
  g.accept({ id: 'vote-lula', type: 'comment', username: 'Ana', text: '!lula' });
  assert.equal(bolsonaro.points, 0); assert.equal(lula.points, 0);
  assert.deepEqual(bolsonaro.attackQueue, ['punch', 'punch']); assert.deepEqual(lula.attackQueue, ['punch']);
  assert.equal(e.phase, 'fight');
  assert.match(e.narrator.feed[0].text, /Ana comandou LULA: punch/);
});
test('plain name mentions remain comments and do not award points', () => {
  const e = make(); const g = new EventGateway(e, () => 1000);
  const bolsonaro = e.players.get('fighter-azul')!; const lula = e.players.get('fighter-rosa')!;
  g.accept({ id: 'plain-bolsonaro', type: 'comment', username: 'Ana', text: 'Bolsonaro!' });
  g.accept({ id: 'mention-lula', type: 'comment', username: 'Bia', text: 'Eu voto na LULA hoje' });
  g.accept({ id: 'word-inside', type: 'comment', username: 'Caio', text: 'bolsonarismo' });
  assert.equal(bolsonaro.points, 0); assert.equal(lula.points, 0);
  assert.equal(bolsonaro.attackQueue.length, 0); assert.equal(lula.attackQueue.length, 0);
  assert.match(e.narrator.feed[0].text, /Caio comentou: bolsonarismo/);
});
test('chat commands and actions are configurable per fighter and exposed in the live snapshot', () => {
  const e = make(); const [blue, pink] = [...e.players.values()]; const g = new EventGateway(e);
  e.config.fighters[0].chatCommand = '!azul'; e.config.fighters[0].chatAction = 'dash';
  e.config.fighters[1].chatCommand = '!rosa'; e.config.fighters[1].chatAction = 'sweep';
  g.accept({ id: 'custom-blue', type: 'comment', username: 'Ana', text: '!AZUL' });
  g.accept({ id: 'custom-pink', type: 'comment', username: 'Bia', text: '!rosa' });
  assert.equal(blue.points, 0); assert.equal(pink.points, 0);
  assert.deepEqual(blue.attackQueue, ['dash']); assert.deepEqual(pink.attackQueue, ['sweep']);
  blue.x = 490; blue.y = 850; pink.x = 550; pink.y = 850;
  blue.attackAt = 0; pink.attackAt = 0; blue.invulnerableUntil = 10000; pink.invulnerableUntil = 10000;
  advance(e, .1);
  assert.equal(blue.actionSequence, 1); assert.equal(blue.activeAction, 'dash'); assert.notEqual(blue.x, 490);
  assert.equal(pink.attackSequence, 1);
  assert.deepEqual(e.snapshot().chatActions.map(item => [item.command, item.action]), [['!azul', 'dash'], ['!rosa', 'sweep']]);
  assert.match(e.narrator.feed.find(notice => notice.text.includes('Ana'))!.text, /comandou Flavio Bolsonaro: dash/);
});
test('narrator replaces an in-progress comment with the latest one instead of queuing comments', () => {
  const narrator = new Narrator();
  narrator.push('Primeira mensagem', 'comment', 0); narrator.push('Leo', 'comment', 1);
  narrator.tick(0, true);
  assert.equal(narrator.current?.text, 'Leo');
  assert.equal(narrator.queue.some(notice => notice.kind === 'comment'), false);
  narrator.push('Mensagem mais nova', 'comment', 2); narrator.tick(1, true);
  assert.equal(narrator.current?.text, 'Mensagem mais nova');
  assert.equal(narrator.feed.length, 3);
});
test('gifts award configured points, queue their saved move, and thank the sender by voice only', () => {
  const e = make(); const g = new EventGateway(e); const blue = e.players.get('fighter-azul')!; const pink = e.players.get('fighter-rosa')!;
  e.config.gifts.find(item => item.id === 'rose')!.points = 4;
  e.config.fighters[0].giftMoves = { ...e.config.fighters[0].giftMoves, rose: 'punch' };
  g.accept({ id: 'rose-combo', type: 'gift', username: 'Carlos', giftId: 'rose', count: 3 });
  g.accept({ id: 'rose-combo', type: 'gift', username: 'Carlos', giftId: 'rose', count: 3 });
  assert.equal(e.phase, 'fight'); assert.equal(e.running, true);
  assert.equal(blue.points, 12); assert.equal(pink.points, 0);
  assert.deepEqual(blue.attackQueue, ['punch', 'punch', 'punch']); assert.deepEqual(pink.attackQueue, []);
  assert.equal(e.snapshot().lastGift?.target, blue.username);
  assert.equal(e.snapshot().lastGift?.points, 12); assert.deepEqual(e.snapshot().lastGift?.targetIds, ['fighter-azul']);
  const thanks = e.narrator.feed.find(notice => notice.kind === 'gift-voice');
  assert.equal(thanks?.text, 'Obrigado, Carlos, pelo presente Rosa! Foram 3 presentes!');
  assert.equal(e.narrator.feed.some(notice => notice.kind === 'gift'), false);
});
test('a gift assigned to the second fighter carries only that fighter as its target', () => {
  const e = make(); const g = new EventGateway(e); const spark = e.config.gifts.find(item => item.id === 'spark')!;
  e.config.fighters[0].giftIds = e.config.fighters[0].giftIds.filter(id => id !== spark.id);
  g.accept({ id: 'spark-for-pink', type: 'gift', username: 'Ana', giftId: spark.id, count: 2 });
  assert.equal(e.lastGift?.target, e.config.fighters[1].name);
  assert.deepEqual(e.lastGift?.targetIds, [e.config.fighters[1].id]);
  assert.equal(e.lastGift?.points, spark.points * 2);
  assert.equal(e.players.get(e.config.fighters[0].id)?.points, 0);
  assert.equal(e.players.get(e.config.fighters[1].id)?.points, spark.points * 2);
});
test('automatic rounds stay stopped when automatic fighting is disabled', () => {
  const e = make(); e.config.autoFight = false; e.start(); e.finish(); advance(e, 10);
  assert.equal(e.running, false); assert.equal(e.phase, 'result'); assert.equal(e.nextRoundIn, 0);
});
test('the latest gift sender photo replaces the presenter until the session resets', () => {
  const e = make(); const gateway = new EventGateway(e);
  gateway.accept({ id: 'gift-avatar-1', type: 'gift', username: 'Ana', giftId: 'rose', avatar: 'https://example.com/ana.jpg' });
  assert.deepEqual(e.snapshot().presenterGuest, { username: 'Ana', avatar: 'https://example.com/ana.jpg' });
  assert.deepEqual(withoutAssets(e.snapshot()).presenterGuest, e.snapshot().presenterGuest);
  e.finish(); e.start();
  assert.equal(e.snapshot().presenterGuest?.username, 'Ana');
  gateway.accept({ id: 'gift-avatar-2', type: 'gift', username: 'Bia', giftId: 'rose', avatar: 'https://example.com/bia.jpg' });
  assert.equal(e.snapshot().presenterGuest?.username, 'Bia');
  e.reset(); assert.equal(e.snapshot().presenterGuest, null);
});
test('duplicate gift thanks are suppressed briefly while another donor still gets read', () => {
  const recent = new Map<string, number>();
  assert.equal(isRecentDuplicateGiftSpeech('Obrigado, Ana, pelo presente Rosa!', recent, 1000), false);
  assert.equal(isRecentDuplicateGiftSpeech('obrigado, ana, pelo presente rosa!', recent, 1800), true);
  assert.equal(isRecentDuplicateGiftSpeech('Obrigado, Bia, pelo presente Rosa!', recent, 1900), false);
  assert.equal(isRecentDuplicateGiftSpeech('Obrigado, Ana, pelo presente Rosa!', recent, 4000), false);
});
test('likes build a per-viewer leaderboard without adding narration', () => {
  const e = make(); const g = new EventGateway(e);
  g.accept({ id: 'likes-ana-1', type: 'like', username: 'Ana', count: 4 });
  g.accept({ id: 'likes-ana-2', type: 'like', username: 'ana', count: 3 });
  g.accept({ id: 'likes-bia', type: 'like', username: 'Bia', count: 2 });
  assert.deepEqual(e.snapshot().likeRanking, [{ username: 'Ana', count: 7 }, { username: 'Bia', count: 2 }]);
  assert.equal(e.narrator.feed.some(notice => notice.kind === 'like'), false);
  e.reset(); assert.deepEqual(e.snapshot().likeRanking, []);
});
test('a gift without an assigned fighter reports a configuration error', () => {
  const e = make(); const g = new EventGateway(e); e.config.fighters.forEach(f => { f.giftIds = f.giftIds.filter(id => id !== 'rose'); });
  assert.throws(() => g.accept({ id: 'rose', type: 'gift', username: 'A', giftId: 'rose' }), /Configure um lutador/);
  assert.equal(e.players.get('fighter-azul')!.points, 0);
  assert.equal(e.players.size, 2);
});
test('TikTok gifts map by saved provider ID and fall back to an unambiguous normalized name', () => {
  const gifts = structuredClone(defaults.gifts) as Config['gifts'];
  gifts[0].tiktokGiftId = '5655';
  assert.equal(matchTikTokGift(gifts, '5655', 'Another name')?.id, 'rose');
  assert.equal(matchTikTokGift(gifts, '9', 'Rose')?.id, 'rose');
  gifts[0].tiktokGiftId = '';
  assert.equal(matchTikTokGift(gifts, '9', 'Rósa')?.id, 'rose');
  assert.equal(matchTikTokGift(gifts, '5655', 'Rose')?.id, 'rose');
  assert.equal(matchTikTokGift(gifts, '9', 'unknown'), undefined);
  assert.equal(matchTikTokGift([...gifts, { ...gifts[0], id: 'another-rose' }], '9', 'Rose'), undefined);
});
test('combo gifts fire once after TikTok marks the streak final', () => {
  assert.equal(isFinalTikTokGift({ gift: { type: 1 }, repeatCount: 1, repeatEnd: 0 }), false);
  assert.equal(isFinalTikTokGift({ gift: { type: 1 }, repeatCount: 2, repeatEnd: 1 }), true);
  assert.equal(isFinalTikTokGift({ gift: { type: 0 }, repeatCount: 1, repeatEnd: 0 }), true);
  assert.equal(isFinalTikTokGift({ giftDetails: { giftType: 1 }, repeatCount: 2, repeatEnd: 0 }), false);
});
test('TikTok gifts count immediately and combo updates add only the new units', () => {
  const counter = new TikTokGiftCounter();
  const gift = { gift: { type: 1 }, groupId: '9007199254740993', repeatEnd: 0 };
  assert.equal(counter.count({ ...gift, repeatCount: 1 }, 'viewer', '5655').count, 1);
  assert.equal(counter.count({ ...gift, repeatCount: 3 }, 'viewer', '5655').count, 2);
  assert.equal(counter.count({ ...gift, repeatCount: 3, repeatEnd: 1 }, 'viewer', '5655').count, 0);
  assert.equal(counter.count({ ...gift, groupId: '9007199254740994', repeatCount: 1 }, 'viewer', '5655').count, 1);
  assert.equal(counter.count({ gift: { type: 0 }, repeatCount: 1 }, 'viewer', '5655').count, 1);
  assert.equal(counter.count({ giftDetails: { giftType: 1 }, groupId: 'new-provider', repeatCount: 2 }, 'viewer', '5655').count, 2);
  assert.equal(counter.count({ giftDetails: { giftType: 1 }, groupId: 'new-provider', repeatCount: 3 }, 'viewer', '5655').count, 1);
});
test('TikTok avatar extraction prefers the medium profile photo', () => {
  assert.equal(tiktokUserAvatar({ avatarThumb: { urlList: ['https://example.com/small.jpg'] }, avatarMedium: { urlList: ['https://example.com/medium.jpg'] } }), 'https://example.com/medium.jpg');
  assert.equal(tiktokUserAvatar({ avatarThumb: { urlList: ['javascript:bad'] } }), undefined);
});
test('TikTok display names with spaces and emoji are accepted and shown in comments', () => {
  const e = make(); const g = new EventGateway(e);
  g.accept({ id: 'display-name', type: 'comment', username: 'Ana Maria âœ¨', text: 'oi' });
  assert.match(e.narrator.feed[0].text, /Ana Maria âœ¨ comentou: oi/);
});
test('likes strengthen both fighters; follows drop pickups that fighters can collect', () => {
  const e = make(); const g = new EventGateway(e); const fighters = [...e.players.values()];
  g.accept({ id: 'likes', type: 'like', username: 'Maria', count: 10 }); assert.ok(fighters.every(p => p.buffs.some(b => b.effect === 'damage')));
  g.accept({ id: 'follow', type: 'follow', username: 'Joao' }); assert.equal(e.weapons.length, 2);
  e.start(); e.addWeaponDrops(); const p = fighters[0]; const drop = e.weapons[0]; p.x = drop.x; p.y = drop.y; p.invulnerableUntil = 0; e.tick(.05);
  assert.ok(p.buffs.some(b => b.amount >= 18)); assert.match(e.narrator.feed.find(n => n.kind === 'powerup')?.text ?? '', /pegou uma arma/);
});
test('fighters keep separation while approaching to strike', () => {
  const e = make(); e.start(); advance(e, 8);
  const [a, b] = [...e.players.values()];
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 149);
});
test('a distant punch misses and a successful hit knocks the opponent back to re-approach', () => {
  const e = make(); const [a, b] = [...e.players.values()]; e.start(); a.invulnerableUntil = 0; b.invulnerableUntil = 0;
  a.x = 400; b.x = 800; a.y = b.y = 850; a.attackAt = 0; a.attackQueue.push('punch'); e.tick(.05);
  assert.equal(b.hp, b.maxHp);
  a.x = 490; b.x = 550; a.attackAt = e.time; e.tick(.05);
  assert.ok(b.hp < b.maxHp);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 250);
});
test('fighters attack each other automatically with varied moves during an active round', () => {
  const e = make(); const [a, b] = [...e.players.values()]; e.config.fighters.forEach(fighter => { fighter.randomAttacks = true; }); e.start();
  a.x = 490; a.y = 850; b.x = 550; b.y = 850; a.invulnerableUntil = 0; b.invulnerableUntil = 0; a.attackAt = 0; b.attackAt = 0;
  e.tick(.05);
  assert.ok(a.attackSequence > 0); assert.ok(b.hp < b.maxHp);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 250);
  advance(e, 5);
  assert.ok(b.attackSequence > 0); assert.ok(a.hp < a.maxHp);
  assert.equal(a.points, 0); assert.equal(b.points, 0);
});
test('gifts restore the assigned fighter life or grant a timed damage bonus', () => {
  const e = make(); const [a, b] = [...e.players.values()]; const gateway = new EventGateway(e); e.start(); a.hp = 50;
  Object.assign(e.config.gifts.find(gift => gift.id === 'rose')!, { effect: 'heal', amount: 10, duration: 0 });
  Object.assign(e.config.gifts.find(gift => gift.id === 'spark')!, { effect: 'damage', amount: 20, duration: 30 });
  gateway.accept({ id: 'heal-rose', type: 'gift', username: 'Ana', giftId: 'rose', count: 3 });
  assert.equal(a.hp, 80);
  e.config.gifts.find(gift => gift.id === 'rose')!.healTargetId = b.id; a.hp = 50; b.hp = 40;
  gateway.accept({ id: 'heal-rose-selected-player', type: 'gift', username: 'Ana', giftId: 'rose', count: 3 });
  assert.equal(a.hp, 50); assert.equal(b.hp, 70);
  gateway.accept({ id: 'damage-spark', type: 'gift', username: 'Bia', giftId: 'spark', count: 2 });
  assert.equal(b.buffs.find(buff => buff.effect === 'damage')?.amount, 40);
  assert.equal(b.buffs.find(buff => buff.effect === 'damage')?.until, e.time + 30000);
});
test('gifts add their saved value and comments trigger configured combat actions', () => {
  const e = make(); const [a, b] = [...e.players.values()]; const gateway = new EventGateway(e); e.start();
  e.config.gifts.find(gift => gift.id === 'rose')!.points = 1;
  a.x = 490; a.y = 850; b.x = 550; b.y = 850; a.attackAt = 0; b.invulnerableUntil = 0;
  advance(e, 1); assert.equal(a.points, 0); assert.equal(b.points, 0);
  gateway.accept({ id: 'kick-rose', type: 'gift', username: 'Viewer', giftId: 'rose', targetId: a.id });
  gateway.accept({ id: 'vote-bolsonaro', type: 'comment', username: 'Viewer', text: '!bolsonaro' });
  advance(e, .1);
  assert.equal(a.points, 1); assert.equal(b.points, 0); assert.equal(a.attackSequence, 1); assert.equal(b.damageSequence, 1);
});
test('hits reduce life; the fighter with more life wins on timeout and the next round starts', () => {
  const e = make(); const [a, b] = [...e.players.values()]; e.start(); a.x = 490; a.y = 850; b.x = 550; b.y = 850; a.moveDamage = { ...a.moveDamage, punch: 100 }; a.attackAt = 0; a.attackQueue.push('punch'); b.invulnerableUntil = 0; e.tick(.05);
  assert.equal(b.hp, 1); assert.equal(a.damageDealt, 99); assert.equal(a.points, 0);
  a.hp = 80; b.hp = 20; e.finish(); assert.equal(e.phase, 'result'); assert.deepEqual(e.winner, { name: a.username, damage: 80 });
  advance(e, 8.1); assert.equal(e.phase, 'fight'); assert.equal(e.running, true); assert.equal(e.winner, null); assert.equal(a.damageDealt, 0);
});
test('ties show draw; manual pause prevents an automatic new match', () => {
  const e = make(); const [a, b] = [...e.players.values()]; a.hp = b.hp = 125; e.start(); a.hp = b.hp = 125; e.finish();
  assert.equal(e.winner?.name, 'Empate'); e.phase = 'paused'; e.running = false; advance(e, 10); assert.equal(e.phase, 'paused');
});
test('match duration ends fight by remaining life and roster reset preserves configured names', () => {
  const e = make(); const [a, b] = [...e.players.values()]; e.start(); a.hp = 88; b.hp = 29; e.elapsed = 29.99; e.running = true; e.tick(.05);
  assert.equal(e.phase, 'result'); assert.equal(e.winner?.name, a.username); const oldSession = e.session; e.reset();
  assert.notEqual(oldSession, e.session); assert.equal(e.players.size, 2); assert.deepEqual([...e.players.values()].map(p => p.username), e.config.fighters.map(f => f.name));
});
test('São Paulo day rollover and Monday week boundaries', () => {
  assert.deepEqual(periodKeys(new Date('2026-10-05T02:30:00Z')), { day: '2026-10-04', week: '2026-09-28' });
  assert.deepEqual(periodKeys(new Date('2026-10-05T03:30:00Z')), { day: '2026-10-05', week: '2026-10-05' });
});
test('configuration validates exactly two unique fighters and valid gift assignments', () => {
  const e = make();
  const legacy = structuredClone(e.config) as Config; delete legacy.autoRotateArena; delete legacy.arenaRotationInterval; legacy.fighters.forEach(fighter => { delete fighter.randomAttacks; });
  delete legacy.autoFight; legacy.fighters.forEach(fighter => { delete fighter.maxHp; delete fighter.moveDamage; });
  const upgraded = configSchema.parse(legacy); assert.equal(upgraded.autoRotateArena, false); assert.equal(upgraded.arenaRotationInterval, 60); assert.equal(upgraded.autoFight, true); assert.ok(upgraded.fighters.every(fighter => fighter.randomAttacks === true && fighter.maxHp === 100 && fighter.moveDamage.kick === 16));
  assert.throws(() => configSchema.parse({ ...e.config, fighters: [e.config.fighters[0]] }));
  assert.throws(() => configSchema.parse({ ...e.config, fighters: e.config.fighters.map(f => ({ ...f, chatCommand: '!mesmo' })) }));
  assert.throws(() => configSchema.parse({ ...e.config, fighters: e.config.fighters.map((f, i) => i ? f : { ...f, chatPoints: 0 }) }));
  assert.equal(configSchema.parse({ ...e.config, fighters: e.config.fighters.map((f, i) => i === 0 ? { ...f, fullBody: 'data:image/webp;base64,dGVzdA==' } : f) }).fighters[0].fullBody, 'data:image/webp;base64,dGVzdA==');
  assert.throws(() => configSchema.parse({ ...e.config, fighters: e.config.fighters.map((f, i) => i === 0 ? { ...f, giftMoves: { missing: 'kick' } } : f) }));
  assert.throws(() => configSchema.parse({ ...e.config, fighters: e.config.fighters.map(f => ({ ...f, giftIds: ['missing'] })) }));
  assert.throws(() => configSchema.parse({ ...e.config, gifts: [e.config.gifts[0], e.config.gifts[0]] }));
  assert.equal(configSchema.parse({ ...e.config, gifts: e.config.gifts.map((gift, i) => i === 0 ? { ...gift, image: 'https://cdn.example.com/gift.png' } : gift) }).gifts[0].image, 'https://cdn.example.com/gift.png');
  assert.equal(configSchema.parse({ ...e.config, gifts: e.config.gifts.map((gift, i) => i === 0 ? { ...gift, tiktokDiamonds: 5 } : gift) }).gifts[0].tiktokDiamonds, 5);
  assert.throws(() => configSchema.parse({ ...e.config, gifts: e.config.gifts.map((gift, i) => i ? gift : { ...gift, healTargetId: 'missing-fighter' }) }));
  const damageImage = 'data:image/webp;base64,dGVzdA==';
  assert.equal(configSchema.parse({ ...e.config, fighters: e.config.fighters.map((f, i) => i === 0 ? { ...f, damageImage } : f) }).fighters[0].damageImage, damageImage);
});
test('pose images accept multiple uploads and convert legacy single images', () => {
  const e = make(); const image = 'data:image/webp;base64,dGVzdA==';
  const legacy = configSchema.parse({ ...e.config, fighters: e.config.fighters.map((fighter, index) => index === 0 ? { ...fighter, poseImages: { punch: '', kick: image, sweep: '', jump: '' } } : fighter) });
  assert.deepEqual(legacy.fighters[0].poseImages?.kick, [image]);
  const multiple = configSchema.parse({ ...e.config, fighters: e.config.fighters.map((fighter, index) => index === 0 ? { ...fighter, poseImages: { punch: [image, image], kick: [], sweep: [], jump: [] } } : fighter) });
  assert.deepEqual(multiple.fighters[0].poseImages?.punch, [image, image]);
});
test('live snapshots send static image data separately from frequent fight updates', () => {
  const e = make(); const largeImage = 'data:image/webp;base64,' + 'x'.repeat(100_000);
  const fighter = [...e.players.values()][0]; fighter.avatar = largeImage; fighter.fullBody = largeImage; fighter.damageImage = largeImage; fighter.poseImages = { punch: [largeImage, largeImage] };
  e.config.arenaBackground = largeImage; e.config.presenterAvatar = largeImage; e.lastGift = { username: 'Ana', name: 'Rosa', count: 1, target: fighter.username, image: largeImage };
  const full = e.snapshot(); const dynamic = withoutAssets(full);
  assert.ok(JSON.stringify(dynamic).length < JSON.stringify(full).length / 10);
  assert.equal(dynamic.players[0].avatar, undefined);
  assert.equal(dynamic.arenaBackground, undefined);
  assert.equal(dynamic.arenaBackgroundIndex, full.arenaBackgroundIndex);
  assert.equal(dynamic.lastGift?.image, undefined);
});

