import { useState } from 'react';
import type { Config, FighterAction, FighterProfile, Player } from '../../shared/types';

const actions: { id: FighterAction; label: string }[] = [
  { id: 'punch', label: 'Soco' }, { id: 'kick', label: 'Chute' }, { id: 'sweep', label: 'Rasteira' },
  { id: 'jump', label: 'Pulo' }, { id: 'walk', label: 'Andar' }, { id: 'run', label: 'Correr' }, { id: 'dash', label: 'Dash' },
];
const poses = ['punch', 'kick', 'sweep', 'jump', 'walk', 'run', 'dash'] as const;
let backgroundPipeline: Promise<(image: Blob) => Promise<{ data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number }>> | undefined;

function poseList(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

async function removeImageBackground(image: Blob) {
  backgroundPipeline ??= import('@huggingface/transformers').then(async ({ pipeline }) => {
    const segment = await pipeline('background-removal', 'Xenova/modnet');
    return async (input: Blob) => await segment(input) as { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number };
  });
  const output = await (await backgroundPipeline)(image);
  if (!output?.data || output.channels !== 4) throw new Error('O removedor n?o retornou uma imagem transparente.');
  const canvas = document.createElement('canvas'); canvas.width = output.width; canvas.height = output.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('N?o foi poss?vel preparar a imagem sem fundo.');
  context.putImageData(new ImageData(new Uint8ClampedArray(output.data), output.width, output.height), 0, 0);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('N?o consegui salvar a imagem sem fundo.')), 'image/png'));
}

export function FighterSettings({ config, players, update, save, action, busy }: {
  config: Config; players: Player[]; update: (fighters: FighterProfile[]) => void;
  save: () => void; action: (name: string, data: Record<string, unknown>) => void; busy: boolean;
}) {
  const [removeBackgroundFor, setRemoveBackgroundFor] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState('');

  function wantsBackgroundRemoval(key: string) { return removeBackgroundFor[key] ?? false; }
  function backgroundToggle(key: string) { return <label className="check-label image-bg-option"><input type="checkbox" checked={wantsBackgroundRemoval(key)} onChange={event => setRemoveBackgroundFor(previous => ({ ...previous, [key]: event.target.checked }))}/><span>Remover fundo ao enviar</span></label>; }

  async function encodeImage(file: Blob, removeBackground: boolean) {
    if (!file.type.startsWith('image/')) throw new Error('A área de transferência não contém uma imagem. Copie um print e tente Ctrl+V novamente.');
    if (file.size > 8_000_000) throw new Error('A imagem deve ter até 8 MB.');
    let image = file;
    if (removeBackground) image = await removeImageBackground(image);
    const bitmap = await createImageBitmap(image);
    const width = 384, height = 640;
    const scale = Math.min(width / bitmap.width, height / bitmap.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a imagem.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return new Promise<string>((resolve, reject) => canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Não consegui converter a imagem.')); return; }
      const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Imagem inválida.')); reader.onerror = () => reject(new Error('Não consegui ler a imagem.')); reader.readAsDataURL(blob);
    }, 'image/webp', .74));
  }

  async function addPoses(index: number, move: typeof poses[number], files: Blob[]) {
    if (!files.length) return;
    const profile = config.fighters[index]; const current = poseList(profile.poseImages?.[move]);
    if (current.length + files.length > 6) { window.alert('Você pode salvar até 6 imagens para cada ação.'); return; }
    setProcessing(`${profile.name} · ${actions.find(item => item.id === move)?.label}`);
    try {
      const images = await Promise.all(files.map(file => encodeImage(file, wantsBackgroundRemoval(`${index}:${move}`))));
      update(config.fighters.map((fighter, i) => i === index ? { ...fighter, poseImages: { ...fighter.poseImages, [move]: [...current, ...images] } } : fighter));
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Não consegui abrir essa imagem.'); }
    finally { setProcessing(''); }
  }

  async function upload(index: number, kind: 'avatar' | 'fullBody' | 'damageImage', file?: File) {
    if (!file) return;
    setProcessing(config.fighters[index].name);
    try {
      const image = await encodeImage(file, wantsBackgroundRemoval(`${index}:${kind}`));
      update(config.fighters.map((fighter, i) => i === index ? { ...fighter, [kind]: image } : fighter));
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Não consegui abrir essa imagem.'); }
    finally { setProcessing(''); }
  }

  function edit(index: number, patch: Partial<FighterProfile>) {
    update(config.fighters.map((fighter, i) => i === index ? { ...fighter, ...patch } : fighter));
  }
  function removePose(index: number, move: typeof poses[number], poseIndex: number) {
    const list = poseList(config.fighters[index].poseImages?.[move]);
    edit(index, { poseImages: { ...config.fighters[index].poseImages, [move]: list.filter((_, i) => i !== poseIndex) } });
  }
  function pastePoses(index: number, move: typeof poses[number], event: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.items).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((item): item is File => item !== null);
    if (files.length) { event.preventDefault(); void addPoses(index, move, files); }
  }

  return <>
    <div className="section-toolbar">
      <p>Somente estes dois personagens lutam. A vida decide quem vence.</p>
      <button className="primary" disabled={busy || !!processing} onClick={save}>Salvar lutadores</button>
    </div>
    <p className="field-hint">Marque "Remover fundo" em cada imagem que quiser processar. O modelo baixa na primeira utilização.</p>
    {processing && <p className="field-hint" role="status">Preparando imagem: {processing}…</p>}
    <div className="fighter-grid">
      {config.fighters.map((profile, index) => {
        const current = players.find(player => player.id === profile.id);
        return <section className="panel fighter-card" key={profile.id}>
          <div className="fighter-card-top">
            <div className="fighter-portrait" style={{ borderColor: profile.color }}>{profile.avatar ? <img src={profile.avatar} alt={'Rosto de ' + profile.name}/> : <span>{profile.name.slice(0, 1).toUpperCase()}</span>}<b>#{index + 1}</b></div>
            <div><span className="eyebrow">LUTADOR {index + 1}</span><h2>{profile.name}</h2><p>{current ? `${current.hp} / ${current.maxHp} de vida` : 'Pronto para lutar'}</p></div>
          </div>
          <label>Nome do personagem<input maxLength={32} value={profile.name} onChange={event => edit(index, { name: event.target.value })}/></label>
          <div className="fighter-controls">
            <label>Cor<input aria-label={'Cor do ' + profile.name} type="color" value={profile.color} onChange={event => edit(index, { color: event.target.value })}/></label>
            <div>
              <label className="image-picker">Avatar de rosto<input aria-label={'Foto de ' + profile.name} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void upload(index, 'avatar', event.target.files?.[0]); event.currentTarget.value = ''; }}/><small>Imagem opcional.</small></label>{backgroundToggle(`${index}:avatar`)}
              <label className="image-picker">Corpo inteiro<input aria-label={'Corpo inteiro de ' + profile.name} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void upload(index, 'fullBody', event.target.files?.[0]); event.currentTarget.value = ''; }}/><small>PNG transparente recomendado.</small></label>{backgroundToggle(`${index}:fullBody`)}
              {profile.fullBody && <button className="text-button danger" onClick={() => edit(index, { fullBody: '' })}>Remover corpo inteiro</button>}
              <label className="image-picker">Imagem ao receber golpe<input aria-label={'Imagem de dano de ' + profile.name} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void upload(index, 'damageImage', event.target.files?.[0]); event.currentTarget.value = ''; }}/><small>Reação visual curta.</small></label>{backgroundToggle(`${index}:damageImage`)}
              {profile.damageImage && <button className="text-button danger" onClick={() => edit(index, { damageImage: '' })}>Remover imagem de dano</button>}
            </div>
          </div>
          <label>Estilo visual<select aria-label={'Skin de ' + profile.name} value={profile.style ?? 'boxing'} onChange={event => edit(index, { style: event.target.value as FighterProfile['style'] })}><option value="boxing">Boxe arcade</option><option value="kickboxing">Kickboxing</option><option value="karate">Karatê</option></select></label>
          <section className="fighter-vitals"><h3>VIDA E DANO DOS GOLPES</h3><label>Vida inicial / máxima<input aria-label={'Vida de ' + profile.name} type="number" min={1} max={100000} value={profile.maxHp ?? 100} onChange={event => edit(index, { maxHp: Math.max(1, Number(event.target.value) || 1) })}/></label><div className="form-row">{([{ id: 'punch', label: 'Dano do soco' }, { id: 'kick', label: 'Dano do chute' }, { id: 'sweep', label: 'Dano da rasteira' }, { id: 'jump', label: 'Dano do salto' }] as const).map(move => <label key={move.id}>{move.label}<input aria-label={`Valor em ${move.id} de ${profile.name}`} type="number" min={1} max={10000} value={profile.moveDamage?.[move.id] ?? ({ punch: 12, kick: 16, sweep: 14, jump: 15 }[move.id])} onChange={event => edit(index, { moveDamage: { punch: 12, kick: 16, sweep: 14, jump: 15, ...profile.moveDamage, [move.id]: Math.max(1, Number(event.target.value) || 1) } })}/></label>)}</div><small>O dano configurado é aplicado ao golpe; a defesa do oponente ainda reduz 1 ponto.</small></section>
          <details className="pose-upload" open>
            <summary>Imagens das ações · colar ou selecionar</summary>
            <p className="field-hint">Copie um print, clique na área da ação e use Ctrl+V. Você também pode selecionar várias imagens.</p>
            {actions.map(item => {
              const list = poseList(profile.poseImages?.[item.id]);
              return <div className="pose-group" key={item.id}>
                <label className="image-picker">{item.label} ({list.length}/6)<input aria-label={`${item.label} de ${profile.name}`} type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={list.length >= 6 || !!processing} onChange={event => { void addPoses(index, item.id, Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }}/><small>Adicione quadros de animação. PNG transparente recomendado.</small></label>{backgroundToggle(`${index}:${item.id}`)}
                <div className="pose-paste-zone" tabIndex={0} onPaste={event => pastePoses(index, item.id, event)} title="Clique aqui e cole uma imagem copiada"><span>▣</span> Clique aqui e pressione <b>Ctrl+V</b> para colar print de {item.label.toLowerCase()}</div>
                {list.length > 0 && <div className="pose-thumbnails">{list.map((pose, poseIndex) => <div className="pose-thumbnail" key={poseIndex}><img src={pose} alt={`${item.label}, quadro ${poseIndex + 1}`}/><button type="button" className="text-button danger" onClick={() => removePose(index, item.id, poseIndex)}>Remover</button></div>)}</div>}
              </div>;
            })}
          </details>
          <h3>COMANDOS DO CHAT</h3>
          <div className="form-row fighter-chat-action"><label>Comando<input value={profile.chatCommand ?? ''} maxLength={32} placeholder={index === 0 ? '!bolsonaro' : '!lula'} onChange={event => edit(index, { chatCommand: event.target.value })}/></label><label>Ação<select value={profile.chatAction ?? 'punch'} onChange={event => edit(index, { chatAction: event.target.value as FighterAction })}>{actions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
          <h3>PRESENTES QUE CONTROLAM ESTE LUTADOR</h3>
          <div className="fighter-gifts">{config.gifts.map(gift => {
            const selected = profile.giftIds.includes(gift.id);
            return <div className="fighter-gift" key={gift.id}>
              <label className="check-label"><input type="checkbox" checked={selected} onChange={event => {
                const giftMoves = { ...profile.giftMoves };
                if (event.target.checked) giftMoves[gift.id] ??= 'punch'; else delete giftMoves[gift.id];
                update(config.fighters.map((fighter, fighterIndex) => {
                  if (fighterIndex === index) return { ...fighter, giftIds: event.target.checked ? [...fighter.giftIds, gift.id] : fighter.giftIds.filter(id => id !== gift.id), giftMoves };
                  if (event.target.checked && fighter.giftIds.includes(gift.id)) { const otherMoves = { ...fighter.giftMoves }; delete otherMoves[gift.id]; return { ...fighter, giftIds: fighter.giftIds.filter(id => id !== gift.id), giftMoves: otherMoves }; }
                  return fighter;
                }));
              }}/><span>{gift.image && <img className="gift-small-image" src={gift.image} alt=""/>}{gift.name}<small>{gift.points} pontos por unidade</small></span></label>
              {selected && <label className="gift-action-select">Ação deste presente<select value={profile.giftMoves?.[gift.id] ?? 'punch'} onChange={event => edit(index, { giftMoves: { ...profile.giftMoves, [gift.id]: event.target.value as FighterAction } })}>{actions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
            </div>;
          })}</div>
          <p className="field-hint">Um mesmo presente pode ser associado a apenas um lutador. A vida acaba quando um deles chega a zero.</p>
          <div className="fighter-actions"><button className="button" onClick={() => action('xp', { username: profile.name, amount: 50 })}>+50 XP</button></div>
        </section>;
      })}
    </div>
  </>;
}
