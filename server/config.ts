import { readFile, writeFile, rename } from 'node:fs/promises';
import { z } from 'zod';
import type { Config } from '../shared/types';
import { defaultChatCommand, normalizeChatCommand } from '../shared/chat-votes';
const poseImage = z.string().max(600_000).refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP');
const poseImageList = z.union([z.array(poseImage).max(6), poseImage]).transform(value => Array.isArray(value) ? value : value ? [value] : []);
const effect = z.enum(['heal', 'damage', 'weapon', 'giant', 'boss']);
export const eventId = z.enum(['meteors', 'boss', 'zone', 'ffa', 'teams', 'speed', 'gravity', 'coins']);
export const configSchema = z.object({
  fighters: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]+$/).max(40), name: z.string().min(1).max(32), avatar: z.string().max(1_500_000).refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP'), fullBody: z.string().max(1_500_000).default('').refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP'), damageImage: z.string().max(600_000).default('').refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP'), poseImages: z.object({ punch: poseImageList.default([]), kick: poseImageList.default([]), sweep: poseImageList.default([]), jump: poseImageList.default([]) }).default({ punch: [], kick: [], sweep: [], jump: [] }), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), giftIds: z.array(z.string().max(40)).max(30), giftMoves: z.record(z.string().max(40), z.enum(['punch', 'kick', 'sweep', 'jump'])).default({}), randomAttacks: z.boolean().default(true), style: z.enum(['boxing', 'kickboxing', 'karate']).default('boxing'), chatCommand: z.string().trim().min(2).max(32).regex(/^![\p{L}\p{N}_-]+$/u, 'O comando deve começar com ! e usar letras, números, _ ou -').optional(), chatPoints: z.number().int().min(1).max(500).optional() })).length(2),
  arenaBackground: z.string().max(1_500_000).default('').refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP'),
  arenaBackgrounds: z.array(z.string().max(1_500_000).refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP')).max(6, 'A galeria aceita até 6 cenários').default([]),
  autoRotateArena: z.boolean().default(false), arenaRotationInterval: z.number().int().min(10).max(3600).default(60),
  presenterAvatar: z.string().max(1_500_000).default('').refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP'),
  presenterPosition: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).default({ x: 0.76, y: 0.02 }),
  tiktokUsername: z.string().max(41).regex(/^@?[a-zA-Z0-9_.-]*$/).default(''),
  gifts: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]+$/).max(40), name: z.string().min(1).max(50), image: z.string().max(1_500_000).default('').refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use imagem PNG, JPEG ou WebP'), tiktokGiftId: z.string().max(30).default(''), effect, amount: z.number().int().min(1).max(100), duration: z.number().int().min(0).max(120), points: z.number().int().min(0).max(500) })).min(1).max(30).refine(a => new Set(a.map(g => g.id)).size === a.length, 'IDs de presentes duplicados'),
  events: z.array(z.object({ id: eventId, name: z.string().min(1).max(50), enabled: z.boolean(), duration: z.number().int().min(5).max(120) })).length(8).refine(a => new Set(a.map(e => e.id)).size === 8, 'Eventos duplicados'),
  eventInterval: z.number().int().min(15).max(3600), matchDuration: z.number().int().min(30).max(7200),
  narrator: z.boolean(), sound: z.boolean(), volume: z.number().min(0).max(1), tts: z.boolean()
}).superRefine((config, ctx) => {
  const giftIds = new Set(config.gifts.map(g => g.id));
  if (new Set(config.fighters.map(f => f.id)).size !== 2) ctx.addIssue({ code: 'custom', path: ['fighters'], message: 'Os dois lutadores precisam de IDs diferentes' });
  const chatCommands = config.fighters.map((fighter, index) => normalizeChatCommand(fighter.chatCommand ?? defaultChatCommand(fighter, index)));
  if (new Set(chatCommands).size !== 2) ctx.addIssue({ code: 'custom', path: ['fighters'], message: 'Cada lutador precisa de um comando de chat diferente' });
  for (const fighter of config.fighters) if (fighter.giftIds.some(id => !giftIds.has(id)) || new Set(fighter.giftIds).size !== fighter.giftIds.length || Object.keys(fighter.giftMoves).some(id => !fighter.giftIds.includes(id))) ctx.addIssue({ code: 'custom', path: ['fighters', fighter.id, 'giftIds'], message: 'Presente inválido ou repetido no lutador' });
});
const path = new URL('../config/game.json', import.meta.url);
function normalizeConfig(value: unknown): Config {
  const parsed = configSchema.parse(value);
  const arenaBackgrounds = parsed.arenaBackgrounds.length ? [...parsed.arenaBackgrounds] : parsed.arenaBackground ? [parsed.arenaBackground] : [];
  if (parsed.arenaBackground && !arenaBackgrounds.includes(parsed.arenaBackground) && arenaBackgrounds.length < 6) arenaBackgrounds.unshift(parsed.arenaBackground);
  return { ...parsed, arenaBackgrounds, fighters: parsed.fighters.map((fighter, index) => ({ ...fighter, chatCommand: fighter.chatCommand ?? defaultChatCommand(fighter, index), chatPoints: fighter.chatPoints ?? 1 })) };
}
export async function loadConfig(): Promise<Config> { return normalizeConfig(JSON.parse(await readFile(path, 'utf8'))); }
export async function saveConfig(value: unknown): Promise<Config> {
  const config = normalizeConfig(value);
  const tmp = new URL('../config/game.json.tmp', import.meta.url);
  await writeFile(tmp, JSON.stringify(config, null, 2) + '\n'); await rename(tmp, path); return config;
}
