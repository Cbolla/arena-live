import type { Config, FighterMove, FighterProfile, Player } from '../../shared/types';

const moves: { id: FighterMove; label: string }[] = [
  { id: 'punch', label: 'Soco' },
  { id: 'kick', label: 'Chute' },
  { id: 'sweep', label: 'Rasteira' },
  { id: 'jump', label: 'Salto' },
];

function poseList(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

export function FighterSettings({ config, players, update, save, action, busy }: {
  config: Config; players: Player[]; update: (fighters: FighterProfile[]) => void;
  save: () => void; action: (name: string, data: Record<string, unknown>) => void; busy: boolean;
}) {
  async function toWebp(file: File, width: number, height: number, quality: number) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) throw new Error('Escolha PNG, JPEG ou WebP de até 5 MB.');
    const source = await createImageBitmap(file);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!;
    const ratio = Math.min(width / source.width, height / source.height);
    const scaledWidth = source.width * ratio; const scaledHeight = source.height * ratio;
    context.drawImage(source, (width - scaledWidth) / 2, (height - scaledHeight) / 2, scaledWidth, scaledHeight);
    source.close();
    return canvas.toDataURL('image/webp', quality);
  }

  async function upload(index: number, kind: 'avatar' | 'fullBody' | 'damageImage', file?: File) {
    if (!file) return;
    try {
      const image = await toWebp(file, kind === 'avatar' ? 512 : 480, kind === 'avatar' ? 512 : 800, kind === 'damageImage' ? .78 : .88);
      update(config.fighters.map((fighter, i) => i === index ? { ...fighter, [kind]: image } : fighter));
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Não consegui abrir essa imagem.'); }
  }

  async function uploadPoses(index: number, move: FighterMove, files: FileList | null) {
    if (!files?.length) return;
    const current = poseList(config.fighters[index].poseImages?.[move]);
    if (current.length + files.length > 6) { window.alert('Você pode salvar até 6 imagens para cada golpe.'); return; }
    try {
      const images = await Promise.all(Array.from(files, file => toWebp(file, 384, 640, .82)));
      update(config.fighters.map((fighter, i) => i === index ? { ...fighter, poseImages: { ...fighter.poseImages, [move]: [...current, ...images] } } : fighter));
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Não consegui abrir uma das imagens.'); }
  }

  function removePose(index: number, move: FighterMove, poseIndex: number) {
    const poses = poseList(config.fighters[index].poseImages?.[move]);
    edit(index, { poseImages: { ...config.fighters[index].poseImages, [move]: poses.filter((_, i) => i !== poseIndex) } });
  }
  function edit(index: number, patch: Partial<FighterProfile>) {
    update(config.fighters.map((fighter, i) => i === index ? { ...fighter, ...patch } : fighter));
  }

  return <>
    <div className="section-toolbar">
      <p>Somente estes dois personagens lutam. Comentários não criam jogadores.</p>
      <button className="primary" disabled={busy} onClick={save}>Salvar lutadores</button>
    </div>
    <div className="fighter-grid">
      {config.fighters.map((profile, index) => {
        const current = players.find(player => player.id === profile.id);
        return <section className="panel fighter-card" key={profile.id}>
          <div className="fighter-card-top">
            <div className="fighter-portrait" style={{ borderColor: profile.color }}>
              {profile.avatar ? <img src={profile.avatar} alt={'Rosto de ' + profile.name}/> : <span>{profile.name.slice(0, 1).toUpperCase()}</span>}
              <b>#{index + 1}</b>
            </div>
            <div><span className="eyebrow">LUTADOR {index + 1}</span><h2>{profile.name}</h2><p>{current ? `${current.points.toLocaleString('pt-BR')} pontos nesta luta` : 'Pronto para lutar'}</p></div>
          </div>
          <label>Nome do personagem<input maxLength={32} value={profile.name} onChange={event => edit(index, { name: event.target.value })}/></label>
          <div className="fighter-controls">
            <label>Cor da armadura<input aria-label={'Cor do ' + profile.name} type="color" value={profile.color} onChange={event => edit(index, { color: event.target.value })}/><small>Usada pelo personagem desenhado.</small></label>
            <div>
              <label className="image-picker">Avatar de rosto<input aria-label={'Foto de ' + profile.name} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void upload(index, 'avatar', event.target.files?.[0])}/><small>Retrato opcional.</small></label>
              <label className="image-picker">Avatar de corpo inteiro<input aria-label={'Corpo inteiro de ' + profile.name} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void upload(index, 'fullBody', event.target.files?.[0])}/><small>PNG transparente recomendado — até 5 MB {profile.fullBody ? 'imagem carregada' : ''}</small></label>
              {profile.fullBody && <button className="text-button danger" onClick={() => edit(index, { fullBody: '' })}>Remover imagem de corpo</button>}
              <label className="image-picker">Imagem ao receber golpe<input aria-label={'Imagem de dano de ' + profile.name} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void upload(index, 'damageImage', event.target.files?.[0])}/><small>Mostrada rapidamente quando o oponente acerta; PNG transparente recomendado.</small></label>
              {profile.damageImage && <div className="damage-image-preview"><img src={profile.damageImage} alt={'Reação de dano de ' + profile.name}/><button className="text-button danger" onClick={() => edit(index, { damageImage: '' })}>Remover imagem de dano</button></div>}
            </div>
          </div>
          <details className="pose-upload">
            <summary>Imagens das poses</summary>
            <p className="field-hint">Envie uma pose para cada golpe. No acerto, ela ganha avanão, impacto e recuperação animados.</p>
            {moves.map(move => {
              const poses = poseList(profile.poseImages?.[move.id]);
              return <div className="pose-group" key={move.id}>
                <label className="image-picker">Imagens de {move.label.toLowerCase()} ({poses.length}/6)<input aria-label={`Imagens de ${move.label.toLowerCase()} de ${profile.name}`} type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={poses.length >= 6} onChange={event => { void uploadPoses(index, move.id, event.target.files); event.currentTarget.value = ''; }}/><small>Selecione várias imagens; a arena alterna entre elas em cada golpe. PNG transparente recomendado.</small></label>
                {poses.length > 0 && <div className="pose-thumbnails">{poses.map((pose, poseIndex) => <div className="pose-thumbnail" key={poseIndex}><img src={pose} alt={`${move.label}, imagem ${poseIndex + 1}`}/><button type="button" className="text-button danger" onClick={() => removePose(index, move.id, poseIndex)}>Remover {poseIndex + 1}</button></div>)}</div>}
              </div>;
            })}
          </details>
          <label>Estilo de luta<select aria-label={'Skin de ' + profile.name} value={profile.style ?? 'boxing'} onChange={event => edit(index, { style: event.target.value as FighterProfile['style'] })}><option value="boxing">Boxe arcade</option><option value="kickboxing">Kickboxing</option><option value="karate">Karatê</option></select></label>
          <h3>PRESENTES RECEBIDOS PELO LUTADOR</h3>
          <div className="fighter-gifts">{config.gifts.map(gift => {
            const selected = profile.giftIds.includes(gift.id);
            return <div className="fighter-gift" key={gift.id}>
              <label className="check-label"><input type="checkbox" checked={selected} onChange={event => {
                const giftIds = event.target.checked ? [...profile.giftIds, gift.id] : profile.giftIds.filter(id => id !== gift.id);
                edit(index, { giftIds });
              }}/><span>{gift.name}<small>{gift.points} pontos por unidade</small></span></label>
              {selected && <span className="field-hint">Ação aleatória a cada presente</span>}
            </div>;
          })}</div>
          <p className="field-hint">Cada presente associado soma seus pontos e sorteia uma ação, evitando repetir o golpe anterior.</p>
          <h3>COMANDOS DO CHAT</h3>
          <p className="field-hint">Os comandos configuráveis na aba Configurações também somam pontos para a luta.</p>

          <div className="fighter-actions"><button className="button" onClick={() => action('xp', { username: profile.name, amount: 50 })}>+50 XP</button></div>
        </section>;
      })}
    </div>
  </>;
}
