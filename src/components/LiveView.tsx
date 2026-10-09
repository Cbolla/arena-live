import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import ArenaPhaser from '../game/ArenaPhaser';
import { PresenterAvatar } from './PresenterAvatar';
import type { Notice, Snapshot } from '../../shared/types';
import { isRecentDuplicateGiftSpeech } from '../../shared/speech-dedupe';

export function LiveView({ state: s, connected, preview = false, onPresenterPositionChange }: { state: Snapshot | null; connected: boolean; preview?: boolean; onPresenterPositionChange?: (position: { x: number; y: number }) => void }) {
  const liveViewRef = useRef<HTMLDivElement>(null);
  const presenterDrag = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const spokenIds = useRef(new Set<string>());
  const recentGiftSpeech = useRef(new Map<string, number>());
  const speechQueue = useRef<Notice[]>([]);
  const speechActive = useRef(false);
  const activeSpeechKind = useRef<string | null>(null);
  const speechToken = useRef(0);
  const speechInitialized = useRef(false);
  const speakNext = useRef<() => void>(() => {});
  const audio = useRef<AudioContext | null>(null);
  const [speakingNotice, setSpeakingNotice] = useState<Notice | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [giftFlight, setGiftFlight] = useState<{ id: string; image?: string; points: number; target: string; targetIds: string[] } | null>(null);
  const giftFeedInitialized = useRef(false);
  const lastGiftNoticeId = useRef<string | null>(null);
  const latestGiftNoticeId = s?.feed.find(item => item.kind === 'gift-voice')?.id;
  const presenterPosition = dragPosition ?? s?.presenterPosition ?? { x: 0.76, y: 0.02 };

  function movePresenter(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = presenterDrag.current; const root = liveViewRef.current;
    if (!preview || !drag || !root || drag.pointerId !== event.pointerId) return;
    const bounds = root.getBoundingClientRect(); const avatar = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1 - avatar.width / bounds.width, (event.clientX - bounds.left - drag.offsetX) / bounds.width));
    const y = Math.max(0, Math.min(1 - avatar.height / bounds.height, (event.clientY - bounds.top - drag.offsetY) / bounds.height));
    setDragPosition({ x, y });
  }

  function finishPresenterDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (presenterDrag.current?.pointerId !== event.pointerId) return;
    presenterDrag.current = null;
    if (dragPosition) onPresenterPositionChange?.(dragPosition);
  }

  useEffect(() => {
    if (!giftFeedInitialized.current) {
      giftFeedInitialized.current = true;
      lastGiftNoticeId.current = latestGiftNoticeId ?? null;
      return;
    }
    if (!latestGiftNoticeId || latestGiftNoticeId === lastGiftNoticeId.current) return;
    lastGiftNoticeId.current = latestGiftNoticeId;
    const gift = s?.lastGift;
    if (!gift) return;
    setGiftFlight({ id: latestGiftNoticeId, image: gift.image, points: gift.points ?? 0, target: gift.target, targetIds: gift.targetIds ?? [] });
    const timer = window.setTimeout(() => setGiftFlight(null), 1250);
    return () => window.clearTimeout(timer);
  }, [latestGiftNoticeId]);

  useEffect(() => {
    if (preview || !s) return;
    const enabled = s.settings.narrator && s.settings.tts && 'speechSynthesis' in window;
    if (!enabled) {
      speechQueue.current = [];
      speechActive.current = false;
      activeSpeechKind.current = null;
      speechToken.current++;
      setSpeakingNotice(null);
      window.speechSynthesis?.cancel();
      return;
    }

    const notices = [...s.feed].reverse();
    if (!speechInitialized.current) {
      notices.forEach(notice => spokenIds.current.add(notice.id));
      speechInitialized.current = true;
      return;
    }

    speakNext.current = () => {
      if (speechActive.current || !speechQueue.current.length) return;
      const notice = speechQueue.current.shift()!;
      speechActive.current = true;
      activeSpeechKind.current = notice.kind;
      const token = ++speechToken.current;
      setSpeakingNotice(notice);
      const utterance = new SpeechSynthesisUtterance(notice.text);
      utterance.lang = 'pt-BR';
      utterance.volume = s.settings.volume;
      utterance.pitch = notice.kind === 'gift' || notice.kind === 'gift-voice' ? 1.15 : .92;
      utterance.rate = .98;
      const finish = () => {
        if (token !== speechToken.current) return;
        speechActive.current = false;
        activeSpeechKind.current = null;
        if (speechQueue.current.length) speakNext.current();
        else setSpeakingNotice(null);
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    };

    let latestGiftNotice: Notice | null = null;
    for (const notice of notices) {
      if (spokenIds.current.has(notice.id)) continue;
      spokenIds.current.add(notice.id);
      if (notice.kind === 'gift-voice') {
        if (isRecentDuplicateGiftSpeech(notice.text, recentGiftSpeech.current, Date.now())) continue;
        latestGiftNotice = notice;
        continue;
      }
      if (notice.kind === 'comment') {
        // Keep the current sentence audible; only replace comments waiting in line.
        speechQueue.current = speechQueue.current.filter(item => item.kind !== 'comment');
      }
      if (notice.kind === 'comment') speechQueue.current.unshift(notice);
      else speechQueue.current.push(notice);
    }
    if (latestGiftNotice) {
      // Thank only the newest donor and give the acknowledgment immediate priority.
      speechQueue.current = speechQueue.current.filter(item => item.kind !== 'gift-voice');
      speechToken.current++;
      speechActive.current = false;
      activeSpeechKind.current = null;
      window.speechSynthesis.cancel();
      speechQueue.current.unshift(latestGiftNotice);
    }
    if (spokenIds.current.size > 500) spokenIds.current = new Set([...spokenIds.current].slice(-250));
    speakNext.current();
  }, [s?.feed, s?.settings.narrator, s?.settings.tts, s?.settings.volume, preview]);

  useEffect(() => {
    const unlock = () => {
      if (!preview) {
        audio.current ??= new AudioContext();
        void audio.current.resume();
        window.speechSynthesis?.resume();
        speakNext.current();
      }
    };
    window.addEventListener('pointerdown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      void audio.current?.close();
      if (!preview) window.speechSynthesis?.cancel();
    };
  }, [preview]);

  useEffect(() => {
    if (preview || !s?.notice || !s.settings.sound) return;
    try {
      audio.current ??= new AudioContext();
      if (audio.current.state !== 'running') return;
      const oscillator = audio.current.createOscillator();
      const gain = audio.current.createGain();
      oscillator.connect(gain);
      gain.connect(audio.current.destination);
      oscillator.frequency.value = s.notice.kind === 'kill' ? 220 : 660;
      gain.gain.setValueAtTime(s.settings.volume * .08, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.current.currentTime + .2);
      oscillator.start();
      oscillator.stop(audio.current.currentTime + .2);
    } catch { /* The browser may require a click to enable audio. */ }
  }, [s?.notice?.id, s?.settings.sound, s?.settings.volume, preview]);

  const seconds = s?.phase === 'result' ? Math.ceil(s.nextRoundIn) : Math.max(0, Math.ceil((s?.duration ?? 300) - (s?.elapsed ?? 0)));
  const candidateNotice = speakingNotice ?? s?.notice;
  const notice = candidateNotice?.kind === 'gift-voice'
    ? (s?.notice?.kind === 'gift-voice' ? null : s?.notice)
    : candidateNotice;
  const presenterSpeaking = Boolean(speakingNotice) || Boolean(preview && s?.settings.narrator && s.settings.tts && s.notice);
  const presenterLabel = speakingNotice?.kind === 'comment' ? 'LENDO COMENTÁRIO DO CHAT' : speakingNotice?.kind === 'gift-voice' ? 'AGRADECENDO PRESENTE' : presenterSpeaking ? 'FALANDO AO VIVO' : 'APRESENTADOR DA ARENA';
  const presenterText = speakingNotice?.kind === 'gift-voice' ? 'Obrigado pelo presente recebido!' : speakingNotice?.text ?? notice?.text ?? 'Aguardando comentários do chat...';

  return <div className={'live-view ' + (preview ? 'preview' : '')} ref={liveViewRef}>
    <div className="live-title"><span>DOIS LUTADORES.<br/><em>UMA ARENA.</em></span></div>
    <div className={'presenter-float ' + (presenterSpeaking ? 'speaking' : '') + (preview ? ' draggable' : '')} style={{ left: `${presenterPosition.x * 100}%`, top: `${presenterPosition.y * 100}%` }} onPointerDown={event => { if (!preview) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); presenterDrag.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }; }} onPointerMove={movePresenter} onPointerUp={finishPresenterDrag} onPointerCancel={finishPresenterDrag} title={preview ? 'Arraste para reposicionar o avatar' : undefined}><PresenterAvatar image={s?.presenterGuest?.avatar || s?.presenterAvatar} label={s?.presenterGuest ? `Foto de ${s.presenterGuest.username}` : 'Rosto do apresentador'} speaking={presenterSpeaking}/><small>{preview ? 'ARRASTE' : presenterSpeaking ? 'FALANDO' : s?.presenterGuest ? `@${s.presenterGuest.username}` : 'AO VIVO'}</small></div>
    <div className="match-strip"><span><i className="green-dot"/>{s?.running ? 'LUTA AO VIVO' : s?.phase === 'result' ? 'FIM DE LUTA' : s?.phase === 'paused' ? 'LUTA PAUSADA' : 'PRONTO PARA LUTAR'}</span><strong>{s?.phase === 'result' ? `PRÓXIMA ${seconds}s` : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</strong><span className="scene-rotation-status">2 LUTADORES{s?.arenaRotationRemaining != null && <small>PRÓXIMO CENÁRIO <b>{Math.floor(s.arenaRotationRemaining / 60).toString().padStart(2, '0')}:{(s.arenaRotationRemaining % 60).toString().padStart(2, '0')}</b></small>}</span></div>
    <div className="live-arena">
      <ArenaPhaser state={s}/>
      {giftFlight && (giftFlight.targetIds.length ? giftFlight.targetIds : giftFlight.target ? s?.players.filter(player => player.username.toLocaleLowerCase('pt-BR') === giftFlight.target.toLocaleLowerCase('pt-BR')).map(player => player.id) ?? [] : s?.players.map(player => player.id) ?? []).map(targetId => {
        const playerIndex = s?.players.findIndex(player => player.id === targetId) ?? 0;
        return <div className={'gift-flight ' + (playerIndex === 0 ? 'to-left' : 'to-right')} key={`${giftFlight.id}-${targetId}`} aria-hidden="true">
          {giftFlight.image ? <img src={giftFlight.image} alt=""/> : <span className="gift-flight-fallback">🎁</span>}
        </div>;
      })}
      {!connected && <div className="connection-banner">Reconectando ao servidor…</div>}
      <div className="arena-community">
        <section className="arena-like-ranking"><b>♥ TOP CURTIDAS</b>{s?.likeRanking?.length ? s.likeRanking.slice(0, 3).map((liker, index) => <span key={liker.username}><i>{index + 1}.</i> {liker.username} <strong>{liker.count.toLocaleString('pt-BR')}</strong></span>) : <span>Aguardando curtidas</span>}</section>
        <section className="arena-chat-points"><b>AÇÕES DO CHAT</b>{s?.chatActions?.map(item => <span key={item.fighterId}><code>{item.command}</code> → {({ punch: 'soco', kick: 'chute', sweep: 'rasteira', jump: 'pular', walk: 'andar', run: 'correr', dash: 'dash' } as const)[item.action]}</span>)}</section>
      </div>
      <div className="arena-event"><span>✦</span>{s?.event?.name ?? 'Luta automática'}<small>{s?.event ? Math.max(0, Math.ceil((s.event.until - s.time) / 1000)) + 's' : 'A VIDA DECIDE O VENCEDOR'}</small></div>
    </div>
    <div className={'narrator-line ' + (notice?.kind ?? '')} aria-live="polite"><span>◈</span><div><small>{presenterLabel}</small><p>{presenterText}</p></div></div>
  </div>;
}
