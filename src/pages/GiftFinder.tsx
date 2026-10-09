import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Config, Gift } from '../../shared/types';

type ScannedGift = { id: string; name: string; imageUrl?: string; diamonds: number; count: number; lastSeen: string; sender: string; liveUsernames: string[] };
type LiveScan = { username: string; roomId: string; status: 'connecting' | 'connected' | 'error'; message: string };
type ScannerStatus = { status: 'disconnected' | 'connecting' | 'connected' | 'error'; username: string; roomId: string; message: string; gifts: ScannedGift[]; lives: LiveScan[] };
const empty: ScannerStatus = { status: 'disconnected', username: '', roomId: '', message: '', gifts: [], lives: [] };

export function GiftFinder() {
  const [username, setUsername] = useState(() => localStorage.getItem('arena-gift-finder-user') ?? '');
  const [status, setStatus] = useState<ScannerStatus>(empty);
  const [config, setConfig] = useState<Config | null>(null);
  const [fighterId, setFighterId] = useState('');
  const [search, setSearch] = useState('');
  const [token, setToken] = useState(sessionStorage.getItem('arena-token') ?? '');
  const [needsToken, setNeedsToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function refresh() { try { setStatus(await api<ScannerStatus>('admin/presentes/status')); setNeedsToken(false); } catch { setNeedsToken(true); } }
  async function loadConfig() { try { setConfig(await api<Config>('admin/config')); setNeedsToken(false); } catch { setNeedsToken(true); } }
  useEffect(() => { void refresh(); void loadConfig(); const timer = window.setInterval(() => { void refresh(); }, 1500); return () => window.clearInterval(timer); }, []);
  async function connect() {
    setBusy(true); setNotice(''); localStorage.setItem('arena-gift-finder-user', username.trim());
    try { setStatus(await api<ScannerStatus>('admin/presentes/connect', { username: username.trim() })); setNeedsToken(false); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); try { setStatus(await api<ScannerStatus>('admin/presentes/disconnect', {})); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function stopLive(liveUsername: string) {
    try { setStatus(await api<ScannerStatus>('admin/presentes/disconnect', { username: liveUsername })); }
    catch (error) { setNotice((error as Error).message); }
  }
  async function registerGift(scanned: ScannedGift) {
    if (!config) { setNeedsToken(true); return; }
    if (config.gifts.some(gift => gift.tiktokGiftId === scanned.id || gift.id === scanned.id)) { setNotice('Esse presente já está cadastrado na arena.'); return; }
    if (config.gifts.length >= 30) { setNotice('O banco da arena chegou ao limite de 30 presentes.'); return; }
    if (scanned.id.length > 30) { setNotice('O ID é longo demais para o campo TikTok dos presentes.'); return; }
    let id = ('tiktok-' + scanned.id).toLocaleLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
    const base = id; let suffix = 2;
    while (config.gifts.some(gift => gift.id === id)) { const ending = '-' + suffix++; id = base.slice(0, 40 - ending.length) + ending; }
    const gift: Gift = { id, name: scanned.name.slice(0, 50) || `Presente ${scanned.id}`, image: scanned.imageUrl || '', tiktokGiftId: scanned.id, tiktokDiamonds: scanned.diamonds, effect: 'damage', amount: 10, duration: 10, points: 1 };
    const fighters = config.fighters.map(fighter => {
      if (fighter.id === fighterId) return { ...fighter, giftIds: [...fighter.giftIds.filter(value => value !== id), id], giftMoves: { ...fighter.giftMoves, [id]: 'punch' as const } };
      if (fighterId && fighter.giftIds.includes(id)) { const giftMoves = { ...fighter.giftMoves }; delete giftMoves[id]; return { ...fighter, giftIds: fighter.giftIds.filter(value => value !== id), giftMoves }; }
      return fighter;
    });
    setBusy(true);
    try {
      const saved = await api<Config>('admin/config', { ...config, fighters, gifts: [...config.gifts, gift] }, 'PUT');
      setConfig(saved); setNotice(fighterId ? 'Presente e imagem salvos e associados ao lutador escolhido.' : 'Presente e imagem salvos. Associe o lutador na aba Jogadores.');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function copy(value: string, label = 'ID copiado') {
    try { await navigator.clipboard.writeText(value); setNotice(label); }
    catch { setNotice('Não consegui copiar. Selecione e copie o texto manualmente.'); }
    window.setTimeout(() => setNotice(''), 2500);
  }
  const gifts = useMemo(() => status.gifts.filter(gift => `${gift.name} ${gift.id} ${gift.sender}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [status.gifts, search]);
  const total = status.gifts.reduce((sum, gift) => sum + gift.count, 0);
  return <main className="gift-finder-page">
    <header className="gift-finder-header"><a className="logo" href="/admin"><span className="brand-mark">A<span>/</span>L</span><div>arena<span>live<span className="logo-dot">.</span></span></div></a><a className="button" href="/admin">Voltar ao painel</a></header>
    <section className="gift-finder-content">
      <span className="eyebrow">FERRAMENTA DE CAPTURA · SOMENTE LEITURA</span><h1>Encontrar IDs de presentes</h1>
      <p className="muted">Informe o @usuário de quem está ao vivo. A captura é independente da conexão da arena.</p>
      {needsToken && <form className="gift-finder-auth panel" onSubmit={event => { event.preventDefault(); sessionStorage.setItem('arena-token', token); void refresh(); void loadConfig(); }}>
        <strong>Acesso administrativo</strong><span className="muted">Use a mesma senha do painel Arena Live.</span>
        <div><input aria-label="Senha administrativa" type="password" autoComplete="current-password" placeholder="Senha administrativa" value={token} onChange={event => setToken(event.target.value)} /><button className="primary" type="submit">Entrar</button></div>
      </form>}
      <form className="gift-finder-connect panel" onSubmit={event => { event.preventDefault(); void connect(); }}>
        <label>Usuário da LIVE<input aria-label="Usuário da LIVE" placeholder="@nome_do_perfil" value={username} onChange={event => setUsername(event.target.value)} /></label>
        <button className="primary" type="submit" disabled={busy || !username.trim() || status.lives.filter(live => live.status !== 'error').length >= 5}>{busy ? 'Conectando…' : 'Adicionar LIVE'}</button>
      </form>
      <div className="gift-finder-status panel"><div className="gift-finder-status-line"><span className={'pill ' + (status.status === 'connected' ? '' : status.status === 'error' ? 'amber' : 'neutral')}><i className={status.status === 'connected' ? 'green-dot' : ''}/>{status.status === 'connected' ? 'CONECTADO' : status.status === 'connecting' ? 'CONECTANDO' : status.status === 'error' ? 'ERRO' : 'DESCONECTADO'}</span>{status.roomId && <span className="muted">Sala: {status.roomId}</span>}</div><p>{notice || status.message || 'Conecte a uma LIVE para começar a identificar os presentes.'}</p></div>
      {status.lives.length > 0 && <section className="panel gift-finder-lives"><div className="panel-head"><h2>LIVES monitoradas <span className="pill neutral">{status.lives.length}/5</span></h2><button className="button small" onClick={() => void disconnect()}>Parar todas</button></div>{status.lives.map(live => <div className="gift-finder-live" key={live.username}><div><strong>@{live.username}</strong><small>{live.message}{live.roomId ? ` · Sala ${live.roomId}` : ''}</small></div><span className={'pill ' + (live.status === 'connected' ? '' : live.status === 'error' ? 'amber' : 'neutral')}>{live.status === 'connected' ? 'CONECTADO' : live.status === 'connecting' ? 'CONECTANDO' : 'ERRO'}</span><button className="button small" onClick={() => void stopLive(live.username)}>Parar</button></div>)}</section>}
      <section className="panel gift-finder-results">
        <div className="panel-head"><h2>Presentes encontrados <span className="pill neutral">{status.gifts.length}</span></h2><button className="button small" disabled={!status.gifts.length} onClick={() => void copy(JSON.stringify(status.gifts.map(({ id, name }) => ({ name, id })), null, 2), 'Lista copiada')}>Copiar lista</button></div>
        {config && <div className="gift-finder-register-options"><label>Associar novos presentes a<select value={fighterId} onChange={event => setFighterId(event.target.value)}><option value="">Escolher depois em Jogadores</option>{config.fighters.map((fighter, index) => <option key={fighter.id} value={fighter.id}>{fighter.name} · Lutador {index + 1}</option>)}</select></label><span className="muted">Adicionar salva ID e imagem no banco da arena.</span></div>}
        <div className="gift-finder-toolbar"><input aria-label="Filtrar presentes" placeholder="Buscar por nome ou ID" value={search} onChange={event => setSearch(event.target.value)} /><span className="muted">{total} envio(s) observados</span></div>
        {!gifts.length ? <div className="gift-finder-empty">{status.gifts.length ? 'Nenhum presente corresponde à busca.' : 'Aguardando um presente ser enviado nesta LIVE. Os IDs surgem quando cada presente aparece.'}</div> : <div className="gift-finder-list">{gifts.map(gift => <article className="gift-finder-item" key={gift.id}>
          <div className="gift-finder-image">{gift.imageUrl ? <img src={gift.imageUrl} alt=""/> : <span>🎁</span>}</div><div className="gift-finder-info"><strong>{gift.name}</strong><code>ID: {gift.id}</code><small>{gift.diamonds > 0 ? `${gift.diamonds} diamantes por unidade · ` : 'Valor em diamantes indisponível · '}{gift.liveUsernames.length ? 'LIVES: ' + gift.liveUsernames.map(value => '@' + value).join(', ') + ' · ' : ''}{gift.count} envio(s) · último por @{gift.sender} · {new Date(gift.lastSeen).toLocaleString('pt-BR')}</small></div><button className="button small" onClick={() => void copy(gift.id)}>Copiar ID</button>{config?.gifts.some(configured => configured.tiktokGiftId === gift.id || configured.id === gift.id) ? <span className="pill">NO BANCO</span> : <button className="primary small" disabled={busy || !config} onClick={() => void registerGift(gift)}>Cadastrar na arena</button>}
        </article>)}</div>}
      </section>
      <p className="gift-finder-footnote">Os IDs aparecem conforme alguém envia o presente durante a captura. Essa página não envia presentes nem aciona golpes na arena.</p>
    </section>
  </main>;
}
