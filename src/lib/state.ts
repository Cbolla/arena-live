import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Player, Snapshot } from '../../shared/types';
export const socket = io({ autoConnect: false });
export let latest: Snapshot | null = null;
type FighterAssets = Pick<Player, 'id' | 'avatar' | 'fullBody' | 'damageImage' | 'poseImages'>;
type ArenaAssets = { fighters: FighterAssets[]; arenaBackgrounds: string[]; arenaBackground: string; presenterAvatar: string };
const assets = new Map<string, FighterAssets>();
let arenaAssets: Pick<Snapshot, 'arenaBackground' | 'presenterAvatar'> & { arenaBackgrounds: string[] } = { arenaBackgrounds: [] };
const listeners = new Set<(state: Snapshot) => void>();

function mergeAssets(state: Snapshot): Snapshot {
  if (state.arenaBackground !== undefined) arenaAssets = { ...arenaAssets, arenaBackground: state.arenaBackground };
  if (state.presenterAvatar !== undefined) arenaAssets = { ...arenaAssets, presenterAvatar: state.presenterAvatar };
  if (state.arenaBackgroundIndex !== undefined) arenaAssets = { ...arenaAssets, arenaBackground: arenaAssets.arenaBackgrounds[state.arenaBackgroundIndex] ?? arenaAssets.arenaBackground };
  const players = state.players.map(player => {
    const incoming = player as Player & Partial<FighterAssets>;
    if (incoming.avatar !== undefined || incoming.fullBody !== undefined || incoming.damageImage !== undefined || incoming.poseImages !== undefined) {
      assets.set(player.id, { id: player.id, avatar: incoming.avatar ?? '', fullBody: incoming.fullBody ?? '', damageImage: incoming.damageImage ?? '', poseImages: incoming.poseImages ?? {} });
    }
    return { ...player, ...assets.get(player.id) };
  });
  return { ...state, ...arenaAssets, players };
}

function publish(state: Snapshot) {
  latest = mergeAssets(state);
  listeners.forEach(listener => listener(latest!));
}

socket.on('assets', (payload: ArenaAssets | FighterAssets[]) => {
  const fighterAssets = Array.isArray(payload) ? payload : payload.fighters;
  assets.clear(); fighterAssets.forEach(fighter => assets.set(fighter.id, fighter));
  if (!Array.isArray(payload)) arenaAssets = { arenaBackground: payload.arenaBackground, arenaBackgrounds: payload.arenaBackgrounds, presenterAvatar: payload.presenterAvatar };
  if (latest) {
    const arenaBackground = latest.arenaBackgroundIndex !== undefined ? arenaAssets.arenaBackgrounds[latest.arenaBackgroundIndex] ?? arenaAssets.arenaBackground : arenaAssets.arenaBackground;
    latest = { ...latest, ...arenaAssets, arenaBackground, players: latest.players.map(player => ({ ...player, ...assets.get(player.id) })) };
    listeners.forEach(listener => listener(latest!));
  }
});
socket.on('state', publish);
export function useArena() {
  const [state, setState] = useState<Snapshot | null>(latest); const [connected, setConnected] = useState(socket.connected);
  useEffect(() => { const update = (s: Snapshot) => setState(s); const on = () => setConnected(true); const off = () => setConnected(false); listeners.add(update); if (latest) update(latest); socket.on('connect', on); socket.on('disconnect', off); socket.connect(); return () => { listeners.delete(update); socket.off('connect', on); socket.off('disconnect', off); }; }, []);
  return { state, connected };
}
