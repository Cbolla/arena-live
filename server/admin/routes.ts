import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Engine } from '../game/engine';
import type { EventGateway } from '../tiktok/events';
import type { Repository } from '../database/repository';
import { usernameSchema } from '../tiktok/events';
import { eventId, saveConfig } from '../config';
import { gainXp, identity } from '../players/players';
import { activateEvent } from '../events/events';
import type { TikTokLiveAdapter } from '../tiktok/live-adapter';
import type { GiftCatalogScanner } from '../tiktok/gift-catalog-scanner';
export function adminRoutes(e: Engine, gateway: EventGateway, repo: Repository, token: string, tiktok: TikTokLiveAdapter, giftScanner: GiftCatalogScanner) {
  const router = Router(); let configWriting = false;
  router.use((req, res, next) => {
    if (req.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)) { res.status(403).json({ error: 'Origem não autorizada' }); return; }
    const provided = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (token && (Buffer.byteLength(token) !== Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(token), Buffer.from(provided)))) { res.status(401).json({ error: 'Informe a senha administrativa' }); return; } next();
  });
  const limits = new Map<string, { at: number; n: number }>();
  router.use((req, res, next) => { const key = req.ip ?? 'local'; const now = Date.now(); const current = limits.get(key); const bucket = current && now - current.at < 1000 ? current : { at: now, n: 0 }; limits.set(key, bucket); if (++bucket.n > 50) { res.status(429).json({ error: 'Muitas solicitações' }); return; } next(); });
  router.get('/config', (_req, res) => res.json(e.config));
  router.get('/tiktok/status', (_req, res) => res.json(tiktok.status()));
  router.get('/presentes/status', (_req, res) => res.json(giftScanner.status()));
  router.post('/presentes/connect', async (req, res, next) => {
    try { const input = z.object({ username: usernameSchema }).parse(req.body); res.json(await giftScanner.connect(input.username)); } catch (error) { next(error); }
  });
  router.post('/presentes/disconnect', async (_req, res, next) => {
    try { const input = z.object({ username: usernameSchema.optional() }).parse(_req.body); res.json(await giftScanner.disconnect(input.username)); } catch (error) { next(error); }
  });
  router.post('/tiktok/connect', async (req, res, next) => {
    try { const input = z.object({ username: usernameSchema }).parse(req.body); res.json(await tiktok.connect(input.username)); } catch (error) { next(error); }
  });
  router.post('/tiktok/disconnect', async (_req, res, next) => {
    try { res.json(await tiktok.disconnect()); } catch (error) { next(error); }
  });
  router.put('/config', async (req, res, next) => {
    if (configWriting) { res.status(409).json({ error: 'Configuração sendo salva; tente novamente' }); return; }
    configWriting = true;
    try { e.config = await saveConfig(req.body); e.syncFighters(); e.nextEvent = e.elapsed + e.config.eventInterval; res.json(e.config); } catch (error) { next(error); } finally { configWriting = false; }
  });
  router.post('/simulate', (req, res, next) => { try { res.json(gateway.accept(req.body)); } catch (error) { next(error); } });
  router.post('/action', async (req, res, next) => {
    try {
      const a = z.object({ action: z.enum(['start', 'pause', 'reset', 'xp', 'event', 'clearNarrator']), username: usernameSchema.optional(), amount: z.number().int().min(1).max(10000).optional(), event: eventId.optional() }).parse(req.body);
      if (a.action === 'start') e.start();
      else if (a.action === 'pause') { e.running = false; e.phase = 'paused'; e.nextRoundIn = 0; }
      else if (a.action === 'reset') { e.reset(); gateway.clear(); await repo.start(e.session); }
      else if (a.action === 'clearNarrator') e.narrator.clear();
      else if (a.action === 'event') { if (!a.event) throw new Error('Escolha um evento'); activateEvent(e, a.event); }
      else {
        if (!a.username) throw new Error('Informe o usuário');
        const p = e.players.get(identity(a.username));
        if (!p) throw new Error('Jogador não encontrado');
        if (a.action === 'xp') gainXp(p, a.amount ?? 50);
      }
      res.json({ message: 'Comando aplicado' });
    } catch (error) { next(error); }
  });
  return router;
}
