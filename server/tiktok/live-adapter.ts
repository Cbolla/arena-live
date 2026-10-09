import { randomUUID } from 'node:crypto';
import { EventType, isStreakOver, TikTokLiveClient } from 'piratetok-live-js';
import type { GiftData } from 'piratetok-live-js';
import type { Gift, LiveEvent } from '../../shared/types';
import type { EventGateway } from './events';

export type TikTokGiftOption = { id: string; name: string; imageUrl?: string };
export type TikTokConnectionStatus = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  username: string;
  roomId: string;
  message: string;
  gifts: TikTokGiftOption[];
};

function normalizeName(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

function canonicalGiftName(value: unknown) {
  const name = normalizeName(value);
  return name === 'rose' ? 'rosa' : name;
}

export function matchTikTokGift(gifts: Gift[], providerId: string, providerName: unknown) {
  return gifts.find(gift => gift.tiktokGiftId && gift.tiktokGiftId === providerId)
    ?? gifts.find(gift => !gift.tiktokGiftId && canonicalGiftName(gift.name) === canonicalGiftName(providerName));
}

export function tiktokUserAvatar(user: any): string | undefined {
  for (const image of [user?.avatarMedium, user?.avatarThumb, user?.avatarLarge, user?.avatarJpg]) {
    for (const value of image?.urlList ?? []) {
      if (typeof value === 'string' && value.length <= 1000 && /^https?:\/\//i.test(value)) return value;
    }
  }
  return undefined;
}

export function isFinalTikTokGift(data: GiftData) {
  return isStreakOver(data);
}

/** TikTok reports running totals for combo gifts, sometimes without a final event. */
export class TikTokGiftCounter {
  private streaks = new Map<string, { total: number; at: number }>();
  reset() { this.streaks.clear(); }
  count(data: GiftData, senderId: string, giftId: string, now = Date.now()) {
    if (Number(data.gift?.type ?? 0) !== 1) return { count: 1, id: '' };
    const total = Math.max(1, Math.floor(Number(data.repeatCount ?? 1)));
    const groupId = String(data.groupId ?? '');
    const key = `${senderId}:${giftId}:${groupId && groupId !== '0' ? groupId : 'fallback'}`;
    const previous = this.streaks.get(key);
    const count = previous && now - previous.at < 60_000 && total >= previous.total ? total - previous.total : total;
    if (Number(data.repeatEnd ?? 0) === 1) this.streaks.delete(key);
    else this.streaks.set(key, { total, at: now });
    if (this.streaks.size > 1000) for (const [id, streak] of this.streaks) if (now - streak.at >= 60_000) this.streaks.delete(id);
    return { count, id: groupId && groupId !== '0' ? `tiktok-gift-${groupId}-${total}` : '' };
  }
}

export class TikTokLiveAdapter {
  private connection: TikTokLiveClient | null = null;
  private giftCounter = new TikTokGiftCounter();
  private current: TikTokConnectionStatus = { status: 'disconnected', username: '', roomId: '', message: '', gifts: [] };

  constructor(private gateway: EventGateway, private gifts: () => Gift[]) {}

  status() { return structuredClone(this.current); }

  async connect(username: string) {
    await this.disconnect();
    const uniqueId = username.trim().replace(/^@/, '');
    if (!uniqueId) throw new Error('Informe o @usuário da conta que está ao vivo.');

    const connection = new TikTokLiveClient(uniqueId).maxRetries(8);
    this.connection = connection;
    this.current = { status: 'connecting', username: uniqueId, roomId: '', message: 'Procurando a LIVE pública…', gifts: [] };

    const emit = (type: LiveEvent['type'], data: any, extras: Partial<LiveEvent> = {}) => {
      const handle = String(data?.user?.nickname ?? data?.user?.uniqueId ?? data?.user?.displayId ?? 'Visitante').replace(/^@/, '').trim();
      const eventId = String(data?.common?.msgId ?? `${type}-${randomUUID()}`);
      try { this.gateway.accept({ id: `tiktok-${type}-${eventId}`, type, username: handle, ...extras }); }
      catch (error) { this.current.message = error instanceof Error ? error.message : 'Falha ao processar evento TikTok.'; }
    };

    connection.on(EventType.connected, data => {
      if (this.connection !== connection) return;
      this.current.status = 'connecting';
      this.current.roomId = String((data as any)?.roomId ?? '');
      this.current.message = 'LIVE encontrada. Abrindo conexão de eventos...';
    });
    connection.on(EventType.chat, data => {
      const event = data as any;
      emit('comment', event, { text: String(event.content ?? '').slice(0, 300) });
    });
    connection.on(EventType.join, data => emit('join', data as any));
    connection.on(EventType.like, data => {
      const event = data as any;
      emit('like', event, { count: Math.max(1, Math.min(100, Number(event.count ?? 1))) });
    });
    connection.on(EventType.follow, data => emit('follow', data as any));
    connection.on(EventType.share, data => emit('share', data as any));
    connection.on(EventType.gift, data => {
      const event = data as any;
      const providerId = String(event.giftId ?? event.gift?.id ?? '');
      const giftName = String(event.gift?.name ?? event.gift?.describe ?? '');
      const imageUrl = event.gift?.image?.urlList?.[0];
      if (providerId && giftName && !this.current.gifts.some(item => item.id === providerId)) {
        this.current.gifts.push({ id: providerId, name: giftName, ...(imageUrl ? { imageUrl } : {}) });
      }
      const senderId = String(event.user?.userId ?? event.user?.uniqueId ?? event.user?.nickname ?? 'Visitante');
      const giftCount = this.giftCounter.count(event, senderId, providerId);
      if (!giftCount.count) return;
      const eventId = (giftCount.id || `tiktok-gift-${String(event.common?.msgId ?? event.logId ?? randomUUID())}`).slice(0, 100);
      const avatar = tiktokUserAvatar(event.user);
      const configured = matchTikTokGift(this.gifts(), providerId, giftName);
      if (!configured) {
        this.current.message = giftName
          ? `Presente "${giftName}" sem associação. Vincule-o na aba Presentes.`
          : 'Presente recebido sem associação; confira a aba Presentes.';
        const handle = String(event.user?.nickname ?? event.user?.uniqueId ?? event.user?.displayId ?? 'Visitante').replace(/^@/, '').trim();
        try { this.gateway.showGiftSender(handle, avatar); }
        catch { /* Keep the gift mapping warning when TikTok sends an invalid profile. */ }
        return;
      }
      emit('gift', event, { id: eventId, giftId: configured.id, count: Math.min(giftCount.count, 10000), avatar });
    });

    connection.on(EventType.reconnecting, data => {
      if (this.connection !== connection) return;
      const retry = data as any;
      this.current.status = 'connecting';
      this.current.message = `Reconectando à LIVE (tentativa ${retry.attempt}/${retry.maxRetries})…`;
    });
    connection.on('error', error => {
      if (this.connection !== connection) return;
      this.current.status = 'connecting';
      this.current.message = (error instanceof Error ? error.message : String(error)).slice(0, 240);
    });
    connection.on(EventType.disconnected, () => {
      if (this.connection === connection && this.current.status !== 'error') {
        this.current.status = 'disconnected';
        this.current.message = 'A conexão com a LIVE foi encerrada.';
      }
    });

    const running = connection.connect();
    void running.then(roomId => {
      if (this.connection !== connection) return;
      this.current.status = 'connected';
      this.current.roomId = String(roomId || this.current.roomId);
      this.current.message = 'Conectado à LIVE. Aguardando comentários e presentes…';
    }).catch(error => {
      if (this.connection !== connection) return;
      this.current.status = 'error';
      this.current.message = (error instanceof Error ? error.message : 'Não foi possível conectar à LIVE.').slice(0, 240);
    });

    return new Promise<TikTokConnectionStatus>((resolve, reject) => {
      const check = setInterval(() => {
        if (this.current.status === 'connected' || this.current.status === 'error') {
          clearInterval(check);
          clearTimeout(timeout);
          if (this.current.status === 'error' && !this.current.roomId) reject(new Error(this.current.message));
          else resolve(this.status());
        }
      }, 100);
      const timeout = setTimeout(() => {
        if (this.current.status === 'connecting') {
          clearInterval(check);
          resolve(this.status());
        }
      }, 15_000);
    });
  }

  async disconnect() {
    const previous = this.connection;
    this.connection = null;
    this.giftCounter.reset();
    if (previous) {
      previous.removeAllListeners();
      previous.disconnect();
    }
    this.current = { status: 'disconnected', username: '', roomId: '', message: 'TikTok desconectado.', gifts: [] };
    return this.status();
  }
}
