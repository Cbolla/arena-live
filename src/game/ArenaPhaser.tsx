import { useEffect, useRef } from 'react';
import type { Snapshot } from '../../shared/types';

export default function ArenaPhaser({ state }: { state: Snapshot | null }) {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!host.current) return;
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;
    let cancelled = false;
    void Promise.all([import('phaser'), import('./ArenaScene')]).then(([phaserModule, sceneModule]) => {
      if (cancelled || !host.current) return;
      const Phaser = phaserModule.default;
      const { ArenaScene, W, H } = sceneModule;
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: W,
        height: H,
        parent: host.current,
        backgroundColor: '#17212b',
        pixelArt: true,
        antialias: false,
        physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
        scale: { mode: Phaser.Scale.NONE, width: W, height: H },
        render: { transparent: false, roundPixels: true },
        scene: [new sceneModule.ArenaScene(() => stateRef.current)],
      });
    });
    return () => { cancelled = true; game?.destroy(true); };
  }, []);
  return <div className="arena-canvas arena-2d arena-phaser" ref={host} aria-label="Arena Phaser com animações, placar e colisões de lutadores" />;
}