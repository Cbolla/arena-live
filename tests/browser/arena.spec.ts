import { test, expect } from '@playwright/test';

test('chat actions, optional gift thanks, arena rankings, and vertical OBS screen', async ({ page, request, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await request.post('/api/admin/action', { data: { action: 'reset' } });
  await page.goto('/admin'); await expect(page.getByText('Servidor conectado')).toBeVisible();
  await page.getByRole('button', { name: 'Começar luta de demonstração' }).click();
  await expect(page.getByRole('button', { name: /Pausar luta/ })).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).players.length).toBe(2);
  const gift = await request.post('/api/admin/simulate', { data: { id: 'e2e-gift-blue', type: 'gift', username: 'William', giftId: 'rose', count: 1 } }); expect(gift.ok()).toBeTruthy();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).lastGift?.username).toBe('William');
  await request.post('/api/admin/simulate', { data: { id: 'e2e-chat-vote', type: 'comment', username: 'Torcedor', text: '!bolsonaro' } });
  await request.post('/api/admin/simulate', { data: { id: 'e2e-likes', type: 'like', username: 'Maria', count: 12 } });
  await page.screenshot({ path: 'artifacts/admin-desktop.png', fullPage: true });
  const live = await context.newPage(); await live.setViewportSize({ width: 1080, height: 1920 }); await live.goto('/live');
  await expect(live.locator('canvas')).toBeVisible(); await expect(live.locator('canvas')).toHaveJSProperty('width', 1000); await expect(live.locator('canvas')).toHaveJSProperty('height', 1150); await expect(live.getByText('DOIS LUTADORES.', { exact: false })).toBeVisible();
  await expect(live.locator('.sidebar')).toHaveCount(0); await expect(live.locator('.live-header')).toHaveCount(0); await expect(live.locator('.arena-community')).toContainText('TOP CURTIDAS'); await expect(live.locator('.arena-community')).toContainText('Maria'); await live.screenshot({ path: 'artifacts/live-1080x1920.png' });
  await expect(live.locator('.presenter-float')).toBeVisible(); await expect(live.getByRole('img', { name: 'Capivara apresentadora da Arena Live' })).toBeVisible();
  expect(await live.evaluate(() => { const arena = document.querySelector('.live-arena')!.getBoundingClientRect(); const presenter = document.querySelector('.presenter-float')!.getBoundingClientRect(); return presenter.width > arena.width * .18; })).toBeTruthy();
  await expect.poll(async () => { const { players } = await (await request.get('/api/state')).json(); return Math.abs(players[0].x - players[1].x); }).toBeGreaterThanOrEqual(390);
  await page.getByRole('button', { name: 'Jogadores', exact: false }).first().click();
  await expect(page.getByText('Somente estes dois personagens lutam.', { exact: false })).toBeVisible();
  const response = await request.post('/api/admin/action', { data: { action: 'event', event: 'boss' } }); expect(response.ok()).toBeTruthy();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).event?.id).toBe('boss');
  await page.locator('nav button').filter({ hasText: 'Ranking' }).click(); await expect(page.getByText('Placar dos participantes')).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('nav button').filter({ hasText: 'Visão geral' }).click();
  await page.screenshot({ path: 'artifacts/admin-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); expect(errors).toEqual([]);
});

test('configuration, gift routing, events and input validation', async ({ page, request }) => {
  const original = await (await request.get('/api/admin/config')).json();
  try {
    await request.post('/api/admin/action', { data: { action: 'reset' } });
    const invalid = await request.post('/api/admin/simulate', { data: { id: 'bad', type: 'gift', username: 'Test', giftId: 'rose', count: -3 } }); expect(invalid.status()).toBe(400);
    const crossOrigin = await request.post('/api/admin/action', { headers: { Origin: 'https://not-local.example' }, data: { action: 'start' } }); expect(crossOrigin.status()).toBe(403);
    await page.goto('/admin'); await page.locator('nav button').filter({ hasText: 'Configurações' }).click();
    await page.getByLabel('Duração da luta (segundos)').fill('120'); await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Configuração salva'); expect((await (await request.get('/api/admin/config')).json()).matchDuration).toBe(120);
    await page.locator('nav button').filter({ hasText: 'Jogadores' }).click();
    const firstFighterName = (await (await request.get('/api/admin/config')).json()).fighters[0].name;
    await page.getByLabel(`Skin de ${firstFighterName}`).selectOption('karate');
    await page.getByRole('button', { name: 'Salvar lutadores' }).click();
    await expect(page.getByRole('status')).toContainText('Configuração salva');
    const savedFighter = (await (await request.get('/api/admin/config')).json()).fighters[0];
    expect(savedFighter.style).toBe('karate');
    await page.getByLabel(`Corpo inteiro de ${firstFighterName}`).setInputFiles({ name: 'fighter.png', mimeType: 'image/png', buffer: await page.screenshot() });
    await page.getByRole('button', { name: 'Salvar lutadores' }).click();
    await expect(page.getByRole('status')).toContainText('Configuração salva');
    expect((await (await request.get('/api/admin/config')).json()).fighters[0].fullBody).toMatch(/^data:image\/webp;base64,/);
    await page.getByLabel(`Imagem de dano de ${firstFighterName}`).setInputFiles({ name: 'damage.png', mimeType: 'image/png', buffer: await page.screenshot() });
    await page.getByRole('button', { name: 'Salvar lutadores' }).click();
    await expect(page.getByRole('status')).toContainText('Configuração salva');
    expect((await (await request.get('/api/admin/config')).json()).fighters[0].damageImage).toMatch(/^data:image\/webp;base64,/);
    await page.getByLabel(`Chute de ${firstFighterName}`).setInputFiles({ name: 'kick.png', mimeType: 'image/png', buffer: await page.screenshot() });
    await page.getByRole('button', { name: 'Salvar lutadores' }).click();
    await expect(page.getByRole('status')).toContainText('Configuração salva');
    expect((await (await request.get('/api/admin/config')).json()).fighters[0].poseImages.kick[0]).toMatch(/^data:image\/webp;base64,/);
    await page.locator('nav button').filter({ hasText: 'Configurações' }).click();
    const initialSceneCount = original.arenaBackgrounds?.length ?? (original.arenaBackground ? 1 : 0);
    await page.getByLabel('Adicionar cenário').setInputFiles({ name: 'scene-one.png', mimeType: 'image/png', buffer: await page.screenshot() });
    await page.getByRole('dialog').getByRole('button', { name: /Salvar cenario/i }).click();
    await expect(page.getByRole('status')).toContainText('Cenário salvo');
    await page.getByLabel('Adicionar cenário').setInputFiles({ name: 'scene-two.png', mimeType: 'image/png', buffer: await page.screenshot() });
    await page.getByRole('dialog').getByRole('button', { name: /Salvar cenario/i }).click();
    await expect(page.getByRole('status')).toContainText('Cenário salvo');
    let savedScenes = await (await request.get('/api/admin/config')).json();
    expect(savedScenes.arenaBackgrounds.length).toBe(initialSceneCount + 2);
    expect(savedScenes.arenaBackground).toBe(savedScenes.arenaBackgrounds.at(-1));
    await page.locator('.arena-scene-card').first().getByRole('button', { name: 'Ativar' }).click();
    await expect(page.getByRole('status')).toContainText('Cenário ativado');
    savedScenes = await (await request.get('/api/admin/config')).json();
    expect(savedScenes.arenaBackground).toBe(savedScenes.arenaBackgrounds[0]);
    const state = await (await request.get('/api/state')).json(); expect(state.players).toHaveLength(2);
    const scoreBefore = state.players[0].points;
    await request.post('/api/admin/simulate', { data: { id: 'score-hit', type: 'comment', username: 'Torcedor', text: '!atacar' } });
    expect((await (await request.get('/api/state')).json()).players[0].points).toBe(scoreBefore);
    await request.post('/api/admin/action', { data: { action: 'start' } });
    const running = await (await request.get('/api/state')).json();
    expect(running.players).toHaveLength(2);
    for (const event of original.events) { const activated = await request.post('/api/admin/action', { data: { action: 'event', event: event.id } }); expect(activated.ok()).toBeTruthy(); expect((await (await request.get('/api/state')).json()).event.id).toBe(event.id); }
    await page.locator('nav button').filter({ hasText: 'Presentes' }).click(); await expect(page.getByRole('button', { name: 'Salvar presentes' })).toBeVisible();
    await page.locator('nav button').filter({ hasText: 'Eventos' }).click(); await expect(page.getByRole('button', { name: 'Ativar agora', exact: false })).toHaveCount(8);
  } finally { await request.put('/api/admin/config', { data: original }); await request.post('/api/admin/action', { data: { action: 'reset' } }); }
});

test('chat commands and movement actions can be configured and appear on the live screen', async ({ page, request, context }) => {
  const original = await (await request.get('/api/admin/config')).json();
  try {
    await page.goto('/admin');
    await page.locator('nav button').filter({ hasText: 'Jogadores' }).click();
    await page.getByLabel('Comando').nth(0).fill('!azul');
    await page.locator('.fighter-chat-action select').nth(0).selectOption('dash');
    await page.getByLabel('Comando').nth(1).fill('!rosa');
    await page.locator('.fighter-chat-action select').nth(1).selectOption('run');
    await page.getByRole('button', { name: 'Salvar lutadores' }).click();
    await expect(page.getByRole('status')).toContainText('salva');
    const saved = await (await request.get('/api/admin/config')).json();
    expect(saved.fighters.map((fighter: { chatCommand: string; chatAction: string }) => [fighter.chatCommand, fighter.chatAction])).toEqual([['!azul', 'dash'], ['!rosa', 'run']]);
    await expect(page.getByLabel(`Pulo de ${saved.fighters[0].name}`)).toHaveCount(1);
    await expect(page.getByLabel(`Chute de ${saved.fighters[0].name}`)).toHaveCount(1);
    await expect(page.getByLabel(`Correr de ${saved.fighters[0].name}`)).toHaveCount(1);
    const live = await context.newPage(); await live.goto('/live');
    await expect(live.locator('.arena-chat-points')).toContainText('!azul');
    await expect(live.locator('.arena-chat-points')).toContainText('dash');
    await expect(live.locator('.arena-chat-points')).toContainText('!rosa');
    await expect(live.locator('.arena-chat-points')).toContainText('correr');
  } finally {
    await request.put('/api/admin/config', { data: original });
  }
});
test('gift effects can be changed and saved from the gifts tab', async ({ page, request }) => {
  const original = await (await request.get('/api/admin/config')).json();
  try {
    await page.goto('/admin'); await page.locator('nav button').filter({ hasText: 'Presentes' }).click();
    await page.getByLabel('Efeito do presente Rosa', { exact: true }).selectOption('damage');
    await page.getByLabel('Valor do efeito Rosa', { exact: true }).fill('25');
    await page.getByLabel('Duração do efeito Rosa', { exact: true }).fill('20');
    await page.getByRole('button', { name: 'Salvar presentes' }).click();
    await expect(page.getByRole('status')).toContainText('salva');
    const saved = await (await request.get('/api/admin/config')).json();
    expect(saved.gifts.find((gift: { id: string }) => gift.id === 'rose')).toMatchObject({ effect: 'damage', amount: 25, duration: 20 });
  } finally { await request.put('/api/admin/config', { data: original }); }
});
test('a newer chat comment interrupts the one being spoken and becomes the next voice message', async ({ page, request }) => {
  await page.addInitScript(() => {
    const state = { spoken: [] as string[], cancellations: 0 };
    (window as any).__speechTest = state;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak: (utterance: SpeechSynthesisUtterance) => state.spoken.push(utterance.text),
      cancel: () => { state.cancellations++; },
    } });
  });
  await page.goto('/live');
  await expect(page.locator('canvas')).toBeVisible();
  await request.post('/api/admin/simulate', { data: { id: 'latest-comment-first', type: 'comment', username: 'Ana', text: 'Primeiro comentário longo' } });
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.spoken.includes('Ana comentou: Primeiro comentário longo'))).toBeTruthy();
  await expect(page.locator('.presenter-avatar')).toHaveClass(/speaking/);
  await request.post('/api/admin/simulate', { data: { id: 'latest-comment-second', type: 'comment', username: 'Bia', text: 'Este é o mais recente' } });
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.cancellations)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.spoken.includes('Bia comentou: Este é o mais recente'))).toBeTruthy();
  await expect(page.locator('.narrator-line')).toContainText('Este é o mais recente');
});
