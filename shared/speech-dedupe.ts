export function isRecentDuplicateGiftSpeech(text: string, recent: Map<string, number>, now: number, windowMs = 2200) {
  const key = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
  for (const [known, at] of recent) if (now - at >= windowMs * 4) recent.delete(known);
  const previous = recent.get(key);
  recent.set(key, now);
  return previous !== undefined && now - previous < windowMs;
}
