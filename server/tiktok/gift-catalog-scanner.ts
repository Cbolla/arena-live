import { ControlEvent, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ScannedGift = { id: string; name: string; imageUrl?: string; diamonds: number; count: number; lastSeen: string; sender: string; liveUsernames: string[] };
export type GiftScannerStatus = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  username: string;
  roomId: string;
  message: string;
  gifts: ScannedGift[];
  lives: { username: string; roomId: string; status: 'connecting' | 'connected' | 'error'; message: string }[];
};

/** Separate read-only listener. Its events never enter the arena/event gateway. */
export class GiftCatalogScanner {
  private connections = new Map<string, TikTokLiveConnection>();
  private lives = new Map<string, { username: string; roomId: string; status: 'connecting' | 'connected' | 'error'; message: string }>();
  private gifts: ScannedGift[] = [];
  private message = '';
  private readonly historyPath = fileURLToPath(new URL('../../config/gift-history.json', import.meta.url));
  private saveChain: Promise<void> = Promise.resolve();

  async initialize() {
    try {
      const saved = JSON.parse(await readFile(this.historyPath, 'utf8')) as unknown;
      if (Array.isArray(saved)) {
        const unique = new Map<string, ScannedGift>();
        for (const item of saved as any[]) {
          if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isFinite(item.count)) continue;
          const liveUsernames = Array.isArray(item.liveUsernames) ? item.liveUsernames : typeof item.liveUsername === 'string' ? [item.liveUsername] : [];
          const previous = unique.get(item.id) as ScannedGift | undefined;
          if (!previous) unique.set(item.id, { ...item, diamonds: Math.max(0, Number(item.diamonds) || 0), liveUsernames: [...new Set(liveUsernames)] });
          else {
            previous.count += item.count;
            previous.liveUsernames = [...new Set([...previous.liveUsernames, ...liveUsernames])];
            if (String(item.lastSeen ?? '') > previous.lastSeen) {
              previous.name = item.name;
              previous.lastSeen = item.lastSeen;
              previous.sender = item.sender ?? previous.sender;
              previous.imageUrl = item.imageUrl ?? previous.imageUrl;
            }
          }
        }
        this.gifts = [...unique.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, 500);
        if (this.gifts.length !== saved.length) this.persistHistory();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Não foi possível carregar o histórico de presentes:', error);
        this.message = 'Não consegui ler o arquivo do histórico de presentes.';
      }
    }
  }

  status(): GiftScannerStatus {
    const lives = [...this.lives.values()];
    const status = lives.some(live => live.status === 'connected') ? 'connected' : lives.some(live => live.status === 'connecting') ? 'connecting' : lives.some(live => live.status === 'error') ? 'error' : 'disconnected';
    return structuredClone({ status, username: lives.map(live => live.username).join(', '), roomId: lives.map(live => live.roomId).filter(Boolean).join(', '), message: this.message || (lives.length ? `${lives.length} LIVE(s) monitorada(s).` : 'Nenhuma captura ativa.'), gifts: this.gifts, lives });
  }

  private persistHistory() {
    const snapshot = JSON.stringify(this.gifts.slice(0, 500), null, 2) + '\n';
    this.saveChain = this.saveChain.then(async () => {
      await mkdir(dirname(this.historyPath), { recursive: true });
      const temporaryPath = this.historyPath + '.tmp';
      await writeFile(temporaryPath, snapshot, 'utf8');
      await rename(temporaryPath, this.historyPath);
    }).catch(error => {
      console.error('Não foi possível salvar o histórico de presentes:', error);
      this.message = 'Presente capturado, mas houve um erro ao salvar o histórico.';
    });
  }

  async connect(username: string) {
    const uniqueId = username.trim().replace(/^@/, '');
    if (!uniqueId) throw new Error('Informe o usuário da LIVE.');
    const key = uniqueId.toLocaleLowerCase();
    if (this.connections.has(key)) return this.status();
    if (this.connections.size >= 5) throw new Error('Limite de 5 LIVES simultâneas atingido. Pare uma captura antes de adicionar outra.');
    const old = this.lives.get(key);
    if (old) this.lives.delete(key);
    const connection = new TikTokLiveConnection(uniqueId, {});
    this.connections.set(key, connection);
    this.lives.set(key, { username: uniqueId, roomId: '', status: 'connecting', message: 'Procurando a LIVE pública…' });
    this.message = '';

    connection.on(ControlEvent.CONNECTED, data => {
      if (this.connections.get(key) !== connection) return;
      const live = this.lives.get(key)!;
      live.roomId = String((data as any)?.roomId ?? '');
      live.status = 'connected';
      live.message = 'Conectado. Capturando presentes.';
    });
    connection.on(WebcastEvent.GIFT, data => {
      if (this.connections.get(key) !== connection) return;
      const event = data as any;
      const id = String(event.giftId ?? event.gift?.id ?? '').trim();
      if (!id) return;
      const name = String(event.giftDetails?.giftName ?? event.gift?.name ?? event.giftDetails?.describe ?? `Presente ${id}`).trim().slice(0, 100);
      const diamonds = Math.max(0, Math.floor(Number(event.giftDetails?.diamondCount ?? event.gift?.diamondCount ?? 0)) || 0);
      const rawImage = event.giftDetails?.giftImage?.giftPictureUrl ?? event.gift?.image?.urlList?.[0];
      const imageUrl = typeof rawImage === 'string' && /^https:\/\//i.test(rawImage) ? rawImage : undefined;
      const sender = String(event.user?.nickname ?? event.user?.uniqueId ?? event.user?.displayId ?? 'Visitante').replace(/^@/, '').trim().slice(0, 64);
      const found = this.gifts.find(gift => gift.id === id);
      if (found) {
        found.count += Math.max(1, Math.min(10_000, Number(event.repeatCount ?? 1) || 1));
        found.name = name;
        if (diamonds > 0) found.diamonds = diamonds;
        found.lastSeen = new Date().toISOString();
        found.sender = sender;
        if (!found.liveUsernames.some(value => value.toLocaleLowerCase() === uniqueId.toLocaleLowerCase())) found.liveUsernames.push(uniqueId);
        if (imageUrl) found.imageUrl = imageUrl;
      } else {
        this.gifts.unshift({ id, name, ...(imageUrl ? { imageUrl } : {}), diamonds, count: Math.max(1, Math.min(10_000, Number(event.repeatCount ?? 1) || 1)), lastSeen: new Date().toISOString(), sender, liveUsernames: [uniqueId] });
        this.gifts = this.gifts.slice(0, 500);
      }
      this.persistHistory();
    });
    connection.on(ControlEvent.DISCONNECTED, () => {
      if (this.connections.get(key) !== connection) return;
      this.connections.delete(key);
      const live = this.lives.get(key);
      if (live) { live.status = 'error'; live.message = 'A conexão foi encerrada. Clique em Adicionar LIVE para tentar novamente.'; }
    });
    connection.on(ControlEvent.ERROR, error => {
      if (this.connections.get(key) !== connection) return;
      const detail = (error as any)?.exception?.message ?? (error as any)?.info ?? (error instanceof Error ? error.message : String(error));
      this.lives.get(key)!.message = String(detail).slice(0, 240);
    });
    void connection.connect().then(state => {
      if (this.connections.get(key) !== connection) return;
      const live = this.lives.get(key)!;
      live.status = 'connected';
      live.roomId = String(state.roomId ?? live.roomId);
      live.message = 'Conectado. Capturando presentes.';
    }).catch(error => {
      if (this.connections.get(key) !== connection) return;
      this.connections.delete(key);
      const live = this.lives.get(key)!;
      live.status = 'error';
      live.message = (error instanceof Error ? error.message : 'Não foi possível conectar à LIVE.').slice(0, 240);
    });
    return this.status();
  }

  async disconnect(username?: string) {
    const targets = username ? [username.trim().replace(/^@/, '').toLocaleLowerCase()] : [...this.connections.keys()];
    for (const key of targets) {
      const previous = this.connections.get(key);
      if (previous) { this.connections.delete(key); previous.removeAllListeners(); await previous.disconnect(); }
      this.lives.delete(key);
    }
    this.message = this.lives.size ? '' : 'Captura parada. Histórico salvo neste computador.';
    await this.saveChain;
    return this.status();
  }
}
