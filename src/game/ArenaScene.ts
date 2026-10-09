import Phaser from 'phaser';
import { latest } from '../lib/state';
import type { FighterAction, FighterMove, Player, Snapshot } from '../../shared/types';
export const W = 1000;
export const H = 1150;
type FighterView = { sprite: Phaser.Physics.Arcade.Sprite; name: Phaser.GameObjects.Text; cardName: Phaser.GameObjects.Text; score: Phaser.GameObjects.Text; caption: Phaser.GameObjects.Text; label: Phaser.GameObjects.Text; lastPoints: number; lastAttack: number; lastDamage: number; attackUntil: number; damageUntil: number; attackTexture: string; damageTexture: string; poseIndices: Partial<Record<FighterAction, number>>; reaction: { x: number; y: number }; attackOffsetX: number; attackOffsetY: number; attackRotation: number; idlePhase: number; movementFrame: string };

function textureKey(src: string) {
  let hash = 2166136261;
  for (let i = 0; i < src.length; i++) hash = Math.imul(hash ^ src.charCodeAt(i), 16777619);
  return `upload-${(hash >>> 0).toString(16)}`;
}

export class ArenaScene extends Phaser.Scene {
  private fighters = new Map<string, FighterView>();
  private getSnapshot: () => Snapshot | null;
  private bg!: Phaser.GameObjects.Graphics;
  private bgImage?: Phaser.GameObjects.Image;
  private cards: Phaser.GameObjects.Graphics[] = [];
  private centerVs!: Phaser.GameObjects.Text;
  private result!: Phaser.GameObjects.Container;
  private weaponSprites = new Map<string, Phaser.GameObjects.Text>();
  private loading = new Set<string>();
  private lastNotice = '';
  private collide?: Phaser.Physics.Arcade.Collider;

  constructor(getSnapshot: () => Snapshot | null) {
    super('Arena');
    this.getSnapshot = getSnapshot;
  }

  create() {
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.cameras.main.setBackgroundColor('#17212b');
    this.bg = this.add.graphics().setDepth(-20);
    this.drawStreet();
    this.cards = [0, 1].map(index => this.add.graphics().setDepth(10));
    this.centerVs = this.add.text(W / 2, 93, 'VS', { fontFamily: 'Arial Black, Arial', fontSize: '54px', color: '#ffe281', stroke: '#101725', strokeThickness: 8 }).setOrigin(.5).setDepth(12);
    const resultBack = this.add.rectangle(500, 560, 800, 260, 0x101725, .94).setStrokeStyle(6, 0xffe076);
    const resultTitle = this.add.text(500, 480, 'VENCEDOR DA LUTA', { fontFamily: 'Arial Black, Arial', fontSize: '34px', color: '#ffe076' }).setOrigin(.5);
    const resultWinner = this.add.text(500, 552, '', { fontFamily: 'Arial Black, Arial', fontSize: '66px', color: '#ffffff', align: 'center', wordWrap: { width: 730 } }).setOrigin(.5);
    const resultPoints = this.add.text(500, 615, '', { fontFamily: 'Arial Black, Arial', fontSize: '34px', color: '#ffffff' }).setOrigin(.5);
    const resultNext = this.add.text(500, 660, '', { fontFamily: 'Arial', fontSize: '22px', color: '#d7dce8' }).setOrigin(.5);
    this.result = this.add.container(0, 0, [resultBack, resultTitle, resultWinner, resultPoints, resultNext]).setDepth(30).setVisible(false);
    this.events.on('update', this.renderSnapshot, this);
  }

  private drawStreet() {
    const g = this.bg;
    g.fillGradientStyle(0x151b2b, 0x151b2b, 0x65564d, 0x65564d, 1);
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 13; i++) {
      const x = i * 82 - 20;
      g.fillStyle(i % 2 ? 0x292b38 : 0x34313b).fillRect(x, 115, 65, 470);
      g.fillStyle(0x171e2a).fillRect(x + 7, 160, 49, 177);
      g.fillStyle(i % 3 ? 0x293542 : 0x443442).fillRect(x + 11, 178, 41, 130);
      g.fillStyle(0x66564d).fillRect(x, 342, 65, 15);
    }
    g.fillStyle(0x6e2859).fillRect(42, 145, 70, 224).fillStyle(0xe94cac).fillRect(48, 151, 58, 212);
    g.fillStyle(0x7945c6).fillRect(775, 205, 154, 27).fillStyle(0xd5a9ff).fillRect(781, 211, 142, 15);
    g.fillStyle(0xd04e9b).fillRect(705, 360, 175, 18);
    for (let y = 600; y < H; y += 34) {
      const spread = (y - 580) * .85;
      g.lineStyle(4, y % 2 ? 0x988578 : 0x786b65, .8).lineBetween(500 - spread, y, 500 + spread, y);
    }
    for (let i = -8; i <= 8; i++) g.lineStyle(4, 0x514d4c, .9).lineBetween(500, 580, 500 + i * 90, H);
    g.fillStyle(0x292d35).fillRect(835, 625, 94, 138).fillStyle(0x4a4b51).fillRect(825, 610, 113, 20);
    g.fillStyle(0x292d35).fillRect(105, 570, 28, 236).fillStyle(0x9a8c79).fillRect(91, 560, 55, 17);
  }

  private ensureImage(src: string, ready: (key: string) => void) {
    if (!src) return;
    const key = textureKey(src);
    if (this.textures.exists(key)) { ready(key); return; }
    if (this.loading.has(key)) return;
    this.loading.add(key);
    const image = new Image();
    image.onload = () => {
      this.loading.delete(key);
      if (!this.sys.isActive()) return;
      if (!this.textures.exists(key)) this.textures.addImage(key, image);
      ready(key);
    };
    image.onerror = () => this.loading.delete(key);
    image.src = src;
  }

  private makePlaceholder(player: Player) {
    const key = `placeholder-${player.id}`;
    if (!this.textures.exists(key)) {
      const art = this.make.graphics({ x: 0, y: 0 });
      art.fillStyle(0x172536).fillRoundedRect(22, 100, 76, 55, 12);
      art.fillStyle(Phaser.Display.Color.HexStringToColor(player.color).color).fillRoundedRect(15, 75, 90, 95, 16);
      art.fillStyle(0xf1c6a1).fillCircle(60, 47, 36);
      art.fillStyle(0x202b35).fillRoundedRect(21, 10, 78, 25, 12);
      art.fillStyle(Phaser.Display.Color.HexStringToColor(player.color).color).fillRoundedRect(22, 160, 32, 80, 8).fillRoundedRect(66, 160, 32, 80, 8);
      art.fillStyle(0xf5ede0).fillRoundedRect(14, 225, 48, 14, 6).fillRoundedRect(60, 225, 48, 14, 6);
      art.generateTexture(key, 120, 245);
      art.destroy();
    }
    return key;
  }

  private createFighter(player: Player, index: number) {
    const key = this.makePlaceholder(player);
    const x = Phaser.Math.Clamp(player.x, 160, 840);
    const sprite = this.physics.add.sprite(x, player.y || 900, key).setOrigin(.5, 1).setDepth(5 + index).setFlipX(index === 1);
    sprite.setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
    sprite.setCollideWorldBounds(true);
    sprite.body.setSize(150 / sprite.scaleX, 96 / sprite.scaleY).setOffset((sprite.width - 150 / sprite.scaleX) / 2, sprite.height - 96 / sprite.scaleY);
    const name = this.add.text(x, 0, '', { fontFamily: 'Arial Black, Arial', fontSize: '27px', color: '#ffffff', stroke: '#101725', strokeThickness: 6, align: 'center' }).setOrigin(.5, 1).setDepth(8);
    const cardName = this.add.text(index ? 790 : 210, 40, player.username, { fontFamily: 'Arial Black, Arial', fontSize: '27px', color: '#e9f4ff', align: 'center' }).setOrigin(.5).setDepth(16);
    const score = this.add.text(index ? 790 : 210, 109, '100', { fontFamily: 'Arial Black, Arial', fontSize: '72px', color: '#ffffff', stroke: '#101725', strokeThickness: 4, align: 'center' }).setOrigin(.5).setDepth(13);
    const caption = this.add.text(index ? 790 : 210, 151, 'VIDA', { fontFamily: 'Arial', fontSize: '18px', color: '#bad2e8', align: 'center' }).setOrigin(.5).setDepth(16);
    const label = this.add.text(x, 0, '', { fontFamily: 'Arial Black, Arial', fontSize: '28px', color: '#ffe281', stroke: '#101725', strokeThickness: 6, align: 'center' }).setOrigin(.5, 1).setDepth(8);
    const entry: FighterView = { sprite, name, cardName, score, caption, label, lastPoints: -1, lastAttack: player.attackSequence, lastDamage: player.damageSequence, attackUntil: 0, damageUntil: 0, attackTexture: '', damageTexture: '', poseIndices: {}, reaction: { x: 0, y: 0 }, attackOffsetX: 0, attackOffsetY: 0, attackRotation: 0, idlePhase: index * Math.PI, movementFrame: '' };
    this.fighters.set(player.id, entry);
    if (player.fullBody) this.ensureImage(player.fullBody, texture => {
      sprite.setTexture(texture).setDisplaySize(285, 450);
      sprite.body.setSize(150 / sprite.scaleX, 96 / sprite.scaleY).setOffset((sprite.width - 150 / sprite.scaleX) / 2, sprite.height - 96 / sprite.scaleY);
    });
    return entry;
  }

  private playAttack(player: Player, opponent: Player, view: FighterView) {
    view.lastAttack = player.attackSequence;
    view.attackUntil = this.time.now + 295;
    view.attackTexture = '';
    const move = player.attackMove;
    const labels = { punch: 'SOCO!', kick: 'CHUTE!', sweep: 'RASTEIRA!', jump: 'SALTO!' };
    const direction = opponent.x >= player.x ? 1 : -1;
    const motion = {
      punch: { x: 72, y: 0, angle: 0 },
      kick: { x: 82, y: -34, angle: -.08 },
      sweep: { x: 58, y: 20, angle: .12 },
      jump: { x: 42, y: -88, angle: -.04 },
    }[move];
    view.label.setText(labels[move]).setAlpha(1);
    const poseSources = player.poseImages?.[move] ?? [];
    let poseSource: string | undefined;
    if (poseSources.length) {
      let candidates = poseSources.map((_, index) => index);
      const previousIndex = view.poseIndices[move];
      if (candidates.length > 1 && previousIndex !== undefined) candidates = candidates.filter(index => index !== previousIndex);
      const selectedIndex = candidates[Phaser.Math.Between(0, candidates.length - 1)];
      view.poseIndices[move] = selectedIndex;
      poseSource = poseSources[selectedIndex];
    }
    const baseTexture = player.fullBody ? textureKey(player.fullBody) : `placeholder-${player.id}`;
    if (poseSource) this.ensureImage(poseSource, key => {
      if (view.lastAttack === player.attackSequence && this.time.now < view.attackUntil && this.time.now >= view.damageUntil) {
        view.attackTexture = key;
        view.sprite.setTexture(key).setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
      }
    });
    this.tweens.killTweensOf(view);
    this.tweens.add({
      targets: view,
      attackOffsetX: direction * motion.x,
      attackOffsetY: motion.y,
      attackRotation: direction * motion.angle,
      duration: 115,
      hold: 65,
      yoyo: true,
      ease: 'Cubic.Out',
      onComplete: () => {
        view.attackOffsetX = 0; view.attackOffsetY = 0; view.attackRotation = 0;
        view.attackUntil = 0;
        if (view.lastAttack === player.attackSequence && this.time.now >= view.damageUntil && this.textures.exists(baseTexture)) view.sprite.setTexture(baseTexture).setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
        this.tweens.add({ targets: view.label, alpha: 0, duration: 220, delay: 80 });
      },
    });
    this.cameras.main.shake(80, .0015);
  }

  private playDamageReaction(player: Player, attacker: Player, view: FighterView) {
    view.lastDamage = player.damageSequence;
    view.damageUntil = this.time.now + 380;
    const sequence = player.damageSequence;
    const baseTexture = player.fullBody ? textureKey(player.fullBody) : `placeholder-${player.id}`;
    if (player.damageImage) this.ensureImage(player.damageImage, key => {
      if (view.lastDamage === sequence && this.time.now < view.damageUntil) {
        view.damageTexture = key;
        view.sprite.setTexture(key).setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
      }
    });
    view.sprite.setTint(0xff6675);
    this.tweens.killTweensOf(view.reaction);
    view.reaction.x = player.x < attacker.x ? -20 : 20;
    view.reaction.y = -12;
    this.tweens.add({ targets: view.reaction, x: 0, y: 0, duration: 95, ease: 'Cubic.Out' });
    this.cameras.main.shake(110, .004);
    this.time.delayedCall(380, () => {
      if (view.lastDamage !== sequence) return;
      view.sprite.clearTint();
      const currentTexture = view.attackUntil > this.time.now && view.attackTexture ? view.attackTexture : baseTexture;
      if (this.textures.exists(currentTexture)) view.sprite.setTexture(currentTexture).setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
      view.damageTexture = '';
    });
  }

  private showMovementFrame(player: Player, view: FighterView) {
    const action = player.activeAction;
    if (action === 'idle' || action === 'punch' || action === 'kick' || action === 'sweep') {
      if (view.movementFrame && this.time.now >= view.damageUntil && this.time.now >= view.attackUntil) {
        const base = player.fullBody ? textureKey(player.fullBody) : `placeholder-${player.id}`;
        if (this.textures.exists(base)) view.sprite.setTexture(base).setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
        view.movementFrame = '';
      }
      return;
    }
    const sources = player.poseImages?.[action]?.length
      ? player.poseImages[action]!
      : action === 'dash' ? player.poseImages?.run ?? [] : [];
    if (!sources.length) {
      if (view.movementFrame && this.time.now >= view.damageUntil) {
        const base = player.fullBody ? textureKey(player.fullBody) : `placeholder-${player.id}`;
        if (this.textures.exists(base)) view.sprite.setTexture(base).setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
        view.movementFrame = '';
      }
      return;
    }
    const frame = sources[Math.floor(this.time.now / (action === 'dash' ? 75 : 135)) % sources.length];
    const key = textureKey(frame);
    if (view.movementFrame === key) return;
    view.movementFrame = key;
    this.ensureImage(frame, texture => {
      if (view.movementFrame === key && player.activeAction === action && this.time.now < player.actionUntil && this.time.now >= view.damageUntil) {
        view.sprite.setTexture(texture).setDisplaySize(player.fullBody ? 285 : 250, player.fullBody ? 450 : 410);
      }
    });
  }

  private renderSnapshot() {
    const state = this.getSnapshot() ?? latest;
    if (!state) return;
    const customBg = state.arenaBackground;
    if (customBg) this.ensureImage(customBg, key => {
      if (!this.bgImage || this.bgImage.texture.key !== key) {
        this.bgImage?.destroy();
        this.bgImage = this.add.image(0, 0, key).setOrigin(0).setDisplaySize(W, H).setDepth(-19);
      }
    });
    else { this.bgImage?.destroy(); this.bgImage = undefined; }

    const players = [...state.players].sort((a, b) => a.x - b.x).slice(0, 2);
    players.forEach((player, index) => {
      const view = this.fighters.get(player.id) ?? this.createFighter(player, index);
      const targetX = Phaser.Math.Clamp(player.x, 160, 840);
      const idling = this.time.now >= view.attackUntil && this.time.now >= view.damageUntil && player.activeAction === 'idle';
      const idleBeat = this.time.now / 250 + view.idlePhase;
      const idleBob = idling ? Math.sin(idleBeat) * 10 : 0;
      const idleSway = idling ? Math.sin(idleBeat * .7) * 5 : 0;
      const idleLean = idling ? Math.sin(idleBeat * .7) * .03 : 0;
      const jumping = player.jumpUntil > this.time.now;
      const jumpProgress = jumping ? Phaser.Math.Clamp(1 - (player.jumpUntil - this.time.now) / 760, 0, 1) : 0;
      const jumpOffset = jumping ? -Math.sin(jumpProgress * Math.PI) * 125 : 0;
      view.sprite.setPosition(targetX + view.attackOffsetX + view.reaction.x + idleSway, Phaser.Math.Clamp(player.y || 900, 700, 1020) + view.attackOffsetY + view.reaction.y + idleBob + jumpOffset).setFlipX(index === 1).setRotation(view.attackRotation + idleLean);
      view.sprite.setDepth(5 + index);
      this.showMovementFrame(player, view);
      view.name.setText(player.username).setPosition(targetX, view.sprite.y - (player.fullBody ? 445 : 405));
      view.label.setPosition(targetX, view.sprite.y - (player.fullBody ? 470 : 430));
      if (view.lastPoints !== player.hp) {
        view.score.setText(player.hp.toLocaleString('pt-BR'));
        if (view.lastPoints >= 0 && player.hp < view.lastPoints) this.pointsPop(targetX, view.sprite.y - 320, `-${view.lastPoints - player.hp}`, '#ff657c');
        view.lastPoints = player.hp;
      }
      this.drawCard(this.cards[index], player.color, index ? 580 : 0, player.username, player.hp / player.maxHp);
      if (view.lastAttack !== player.attackSequence) this.playAttack(player, players[1 - index], view);
      if (view.lastDamage !== player.damageSequence) this.playDamageReaction(player, players[1 - index], view);
    });
    const active = new Set(players.map(player => player.id));
    for (const [id, view] of this.fighters) if (!active.has(id)) {
      view.sprite.destroy(); view.name.destroy(); view.cardName.destroy(); view.score.destroy(); view.caption.destroy(); view.label.destroy(); this.fighters.delete(id);
    }
    if (players.length === 2) {
      const [a, b] = players.map(player => this.fighters.get(player.id)!);
      if (!this.collide) this.collide = this.physics.add.collider(a.sprite, b.sprite);
      else if (this.collide.object1 !== a.sprite || this.collide.object2 !== b.sprite) { this.physics.world.removeCollider(this.collide); this.collide = this.physics.add.collider(a.sprite, b.sprite); }
      this.centerVs.setVisible(true);
    } else this.centerVs.setVisible(false);

    if (state.notice && state.notice.id !== this.lastNotice) {
      this.lastNotice = state.notice.id;
      if (state.notice.kind === 'gift' || state.notice.kind === 'powerup') {
        const target = players.find(p => state.notice?.text.includes(p.username));
        if (target) this.pointsPop(target.x, target.y - 260, state.notice.text, target.color);
      }
    }
    const weaponIds = new Set(state.weapons.map(weapon => weapon.id));
    for (const [id, sprite] of this.weaponSprites) if (!weaponIds.has(id)) { sprite.destroy(); this.weaponSprites.delete(id); }
    for (const weapon of state.weapons) {
      const sprite = this.weaponSprites.get(weapon.id) ?? this.add.text(weapon.x, weapon.y, '⚔', { fontSize: '46px', color: '#ffe076' }).setOrigin(.5).setDepth(4);
      sprite.setPosition(weapon.x, weapon.y + Math.sin(this.time.now / 100 + Number(weapon.id)) * 6);
      this.weaponSprites.set(weapon.id, sprite);
    }
    if (state.phase === 'result' && state.winner) {
      const [, title, winner, points, next] = this.result.list as Phaser.GameObjects.GameObject[];
      (title as Phaser.GameObjects.Text).setText('VENCEDOR DA LUTA');
      (winner as Phaser.GameObjects.Text).setText(state.winner.name === 'Empate' ? 'EMPATE!' : state.winner.name);
      (points as Phaser.GameObjects.Text).setText(`${state.winner.damage.toLocaleString('pt-BR')} VIDA RESTANTE`);
      (next as Phaser.GameObjects.Text).setText(`Próxima luta em ${Math.ceil(state.nextRoundIn)}s`);
      this.result.setVisible(true);
    } else this.result.setVisible(false);
  }

  private drawCard(graphics: Phaser.GameObjects.Graphics, color: string, x: number, name: string, health: number) {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    graphics.clear().fillStyle(0x101725, .93).fillRoundedRect(x + 3, 3, 414, 182, 8).lineStyle(7, tint, 1).strokeRoundedRect(x + 4, 4, 412, 182, 8);
    graphics.fillStyle(0x293342, 1).fillRoundedRect(x + 26, 169, 370, 13, 6);
    graphics.fillStyle(health > .35 ? 0x5de98a : 0xff5269, 1).fillRoundedRect(x + 26, 169, 370 * Phaser.Math.Clamp(health, 0, 1), 13, 6);
    const view = [...this.fighters.values()].find(item => item.score.x === (x ? 790 : 210));
    if (view) view.cardName.setText(name).setPosition(x + 210, 40).setDepth(16);
  }

  private pointsPop(x: number, y: number, amount: number | string, color: string) {
    const text = this.add.text(x, y, typeof amount === 'number' ? `+${amount}` : amount, { fontFamily: 'Arial Black, Arial', fontSize: '38px', color, stroke: '#101725', strokeThickness: 7, align: 'center', wordWrap: { width: 350 } }).setOrigin(.5).setDepth(20);
    this.tweens.add({ targets: text, y: y - 100, alpha: 0, duration: 1100, ease: 'Quad.Out', onComplete: () => text.destroy() });
  }
}

