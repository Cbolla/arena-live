# Arena Live

Arena Live é uma arena 2D colorida para transmissões verticais. Você configura dois lutadores, escolhe o nome, a cor e a foto que aparece no rosto de cada robô. O público participa com comentários, curtidas, follows e presentes, mas nunca vira lutador. A partida termina pelo dano causado; a tela anuncia o vencedor e inicia outra luta após oito segundos.

## Iniciar no Windows

Requisitos: Node.js 22.13 ou superior e npm. No PowerShell:

```powershell
cd "C:\Users\XEON\Desktop\arena live"
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

Depois da primeira instalação, abra `npm run dev`:

- Painel administrativo: http://127.0.0.1:5173/admin
- Tela vertical para OBS: http://127.0.0.1:5173/live
- Saúde do servidor: http://127.0.0.1:3001/api/health

Pare com `Ctrl+C`. Para executar a versão compilada, use `npm run build` e `npm start`; nesse modo, as páginas também ficam na porta 3001. Não rode desenvolvimento e produção ao mesmo tempo.

## Configurar sua arena

1. No painel, abra **Jogadores**. Edite os dois nomes, escolha uma cor, selecione um estilo de luta (boxe, kickboxing ou karatê) e carregue um avatar de rosto e um PNG de corpo inteiro com fundo transparente. Abra “Imagens das poses” para enviar quadros de soco, chute, rasteira e salto; cada imagem é mostrada no respectivo movimento. Em Configurações, envie também uma imagem para substituir o cenário. A imagem é ajustada localmente.
2. Em cada lutador, marque os presentes que devem fortalecê-lo. Um mesmo presente pode ser associado a ambos.
3. Em **Presentes**, ajuste os efeitos, depois salve. Presentes mapeados para um lutador aumentam a força e os efeitos desse personagem; remetente, quantidade, alvo e efeito são anunciados.
4. Na visão geral, clique **Começar luta de demonstração**. O simulador tem um campo para escrever comentários e testar curtidas, follows e presentes.
5. Adicione a URL `/live` como fonte Navegador no OBS. Use 1080 × 1920 e 60 FPS.

O vencedor é quem somou mais pontos com golpes quando o tempo acaba. A tela mostra o resultado e começa a próxima luta automaticamente após oito segundos. O botão de pausa interrompe esse ciclo.

## Interações do público

- Comentário: aparece na tela e pode ser lido pelo narrador; `!atacar` dá um impulso temporário aos dois lutadores.
- Presente: fortalece o lutador associado àquele presente na aba **Jogadores**.
- Follow: derruba armas na arena; qualquer um dos robôs pode recolhê-las.
- Curtidas: aumentam temporariamente a força dos dois robôs; só golpes pontuam.
- Compartilhamento: também fortalece ambos.

A narração visual não depende de áudio. A arena mostra os lutadores em tamanho ampliado e mantém uma distância mínima entre eles. Sem sprite personalizado, o boneco ilustrativo alterna golpes; uma imagem de corpo inteiro fica visualmente inteira e requer uma folha de sprites para poses detalhadas de ataque. A voz sintetizada do navegador e efeitos sonoros podem ser controlados em **Configurações**. A voz varia conforme as vozes disponíveis no Windows e no navegador do OBS.

## Estado da integração

Para receber comentários, curtidas e presentes de uma LIVE pública, abra **Configurações**, informe o @usuário da conta que está transmitindo e clique **Conectar à live**. O painel mostra **CONECTADO** e a sala quando o canal de eventos abre. Não é preciso informar senha nem cookies. Se a LIVE não estiver no ar ou a conexão falhar, o painel mostra o erro; confira o usuário e tente novamente. O simulador continua disponível para testar efeitos. O sistema não promete dinheiro ou prêmios financeiros. Confira os IDs reais dos presentes antes de associá-los aos lutadores.

## Desenvolvimento e testes

```powershell
npm test
npm run build
npm run test:e2e # requer npm run dev em outro terminal e Microsoft Edge
```

Os testes de navegador alteram a arena local e usam eventos fictícios. Capturas são salvas em `artifacts/`.

O backend usa Node, Express e Socket.IO; a interface usa React e TypeScript; os rankings usam SQLite/Prisma. `config/game.json` guarda lutadores, presentes e regras. `.env` não deve ser compartilhado. O servidor é configurado para uso local.
