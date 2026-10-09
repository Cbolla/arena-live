import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { Engine } from '../game/engine';
import type { Player, PoseImages, Snapshot } from '../../shared/types';
type FighterAssets = Pick<Player, 'id' | 'avatar' | 'fullBody' | 'damageImage' | 'poseImages'>;
type ArenaAssets = { fighters: FighterAssets[]; arenaBackgrounds: string[]; arenaBackground: string; presenterAvatar: string };

function assetsFor(engine: Engine): ArenaAssets {
  const arenaBackgrounds = engine.config.arenaBackgrounds?.length ? [...engine.config.arenaBackgrounds] : engine.config.arenaBackground ? [engine.config.arenaBackground] : [];
  return { fighters: engine.config.fighters.map(fighter => ({ id: fighter.id, avatar: fighter.avatar, fullBody: fighter.fullBody ?? '', damageImage: fighter.damageImage ?? '', poseImages: fighter.poseImages ?? {} })), arenaBackgrounds, arenaBackground: engine.config.arenaBackground ?? arenaBackgrounds[0] ?? '', presenterAvatar: engine.config.presenterAvatar ?? '' };
}

function samePoses(a: PoseImages = {}, b: PoseImages = {}) {
  return (['punch', 'kick', 'sweep', 'jump'] as const).every(move => {
    const left = a[move] ?? []; const right = b[move] ?? [];
    return left.length === right.length && left.every((image, index) => image === right[index]);
  });
}

function sameAssets(a: ArenaAssets, b: ArenaAssets) {
  return a.arenaBackgrounds.length === b.arenaBackgrounds.length && a.arenaBackgrounds.every((scene, index) => scene === b.arenaBackgrounds[index]) && a.presenterAvatar === b.presenterAvatar && a.fighters.length === b.fighters.length && a.fighters.every((left, index) => {
    const right = b.fighters[index];
    return left.id === right.id && left.avatar === right.avatar && left.fullBody === right.fullBody && left.damageImage === right.damageImage && samePoses(left.poseImages, right.poseImages);
  });
}

export function withoutAssets(snapshot: Snapshot): Snapshot {
  const { arenaBackground: _arenaBackground, presenterAvatar: _presenterAvatar, ...dynamic } = snapshot;
  return { ...dynamic, lastGift: snapshot.lastGift ? { ...snapshot.lastGift, image: undefined } : null, players: snapshot.players.map(({ avatar: _avatar, fullBody: _fullBody, damageImage: _damageImage, poseImages: _poseImages, ...player }) => player as Player) };
}

export function createSocket(server: HttpServer, engine: Engine) {
  const io = new Server(server, { maxHttpBufferSize: 10000, cors: { origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ } });
  let previousAssets = assetsFor(engine);
  io.on('connection', socket => { socket.emit('assets', previousAssets); socket.emit('state', withoutAssets(engine.snapshot())); });
  const timer = setInterval(() => {
    const assets = assetsFor(engine);
    if (!sameAssets(previousAssets, assets)) { previousAssets = assets; io.emit('assets', assets); }
    io.emit('state', withoutAssets(engine.snapshot()));
  }, 100);
  return { io, stop: () => { clearInterval(timer); io.close(); } };
}
