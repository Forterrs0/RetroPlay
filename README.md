> **Nova etapa PostgreSQL:** leia [ETAPA_1_POSTGRESQL.md](ETAPA_1_POSTGRESQL.md). A API ainda roda em SQLite até concluir a conversão do backend.

# Retro Play 2.0 — cinema retrô em bege e rosa

Aplicação de streaming **funcional para demonstração local**, com frontend, backend, banco SQLite, cadastro/login, catálogo, séries demonstrativas, perfis, favoritos, assinatura e aluguel em sandbox, player de vídeos de teste e administração. **Inclui modo claro e modo noturno**; a escolha fica salva no navegador.

> **Aviso de escopo:** é uma aplicação de demonstração testável, não uma plataforma comercial pronta para receber pagamentos reais ou distribuir filmes licenciados. O sandbox de pagamento é interno, sem cobrança de dinheiro. Existem integrações de produção ainda não implementadas; veja o final deste documento.

## 1. Instalar e abrir no Windows

**É essencial seguir estes passos. Abrir `public/index.html` diretamente não inicia o backend e impede login e cadastro.**

1. **Extraia o ZIP inteiro** para uma pasta. Não execute arquivos dentro da janela de visualização do ZIP.
2. Instale **Node.js versão 22.13 ou mais recente**, em https://nodejs.org/. Em um terminal, `node -v` deve mostrar `v22` ou superior. Feche e reabra o terminal após instalar.
3. Dê duplo clique em **`INICIAR_RETRO_PLAY.bat`**, que inicia o servidor, confere se está funcionando e abre o navegador.
4. Se o navegador não abrir sozinho, acesse **http://127.0.0.1:4173**.
5. Clique em **Cadastrar**, informe nome, e-mail e uma senha de **10 ou mais caracteres**. Use o mesmo e-mail e senha em **Entrar** depois. Não há usuário/senha padrão exposto.
6. **Mantenha a janela “Retro Play - Servidor” aberta** enquanto usar a plataforma.

**Linux/macOS:** execute `./INICIAR_RETRO_PLAY.sh` no terminal dentro da pasta. Alternativa universal: `npm start` e abra a URL acima.

Não é preciso instalar MySQL, PostgreSQL, npm packages extras nem fazer configurações manuais de banco de dados. O SQLite é gerado automaticamente em `data/retro-play.sqlite`. As contas criadas permanecem salvas entre reinicializações enquanto você conservar esse arquivo.

## 2. Se cadastro ou login não funcionarem

- **Aparece “Não conseguimos abrir o cinema”**: geralmente você abriu `index.html` sem servidor. Feche essa guia e execute `INICIAR_RETRO_PLAY.bat`.
- **O site abre, mas você continua vendo a versão antiga**: feche a janela do servidor antigo. O novo inicializador verifica a versão e avisa quando a porta 4173 está ocupada por outro Retro Play.
- **Erro “Node.js não encontrado”**: instale Node 22.13+ e reinicie o terminal/Windows se necessário.
- **E-mail já cadastrado**: use **Entrar** com aquela conta ou cadastre outro e-mail.
- **Credenciais inválidas**: confira e-mail e senha. O servidor diferencia maiúsculas/minúsculas na senha.
- **Senha muito curta**: use pelo menos 10 caracteres; o registro agora confirma que as duas senhas coincidem.
- **Tela em branco ou erros de conexão**: confirme que `http://127.0.0.1:4173/api/health` exibe um objeto com `ok: true`, `version: 3.0.0`. Se não exibir, volte à janela do servidor para ver a falha.
- **Usou outro navegador ou computador**: contas vivem no banco da máquina onde o servidor está executando; dados não são sincronizados pela internet.
- **Para reiniciar completamente os dados de teste**, feche o servidor e apague `data/retro-play.sqlite` (isso APAGA todos os usuários, cadastros e pagamentos fictícios; faça backup antes). Não é necessário apagar para atualizar o programa.

## 3. O que funciona nesta versão

| Área | Funcionalidades |
|---|---|
| **Visual** | Tema bege e rosa, modo noturno persistido, responsividade, busca no celular, carrosséis, navegação por décadas |
| **Conta** | Cadastro, login, logout, hash seguro de senha, sessões por cookie HTTP-only, validações, confirmação visual de erros, alteração de nome e senha |
| **Catálogo** | Filmes demonstrativos, busca por título/sinopse/direção/elenco/gênero, filtros por acesso, gênero, década, ordenação |
| **Séries** | Antologias originais de demonstração, temporadas e episódios ligados a vídeos autorizados, próximo episódio, painel para adicionar séries/episódios |
| **Perfis** | Até 5 perfis por usuário, perfis infantis com restrição de classificação indicativa |
| **Interação** | Favoritos por perfil, avaliações, histórico, retomar a reprodução, conquistas e Retro Recap |
| **Streaming** | Player no site, arquivos MP4 protegidos por autorização, HLS em 240p/360p para demonstrações, legenda, velocidade, tela cheia, modo cinema e visual VHS |
| **Acesso pago** | Simulação de planos e locações individuais, liberação após aprovação no backend, prazos e expiração, cancelamento sem acesso indevido |
| **Administração** | Estatísticas, contas, transações de teste, cadastro/edição/publicação de filmes, upload de imagens e MP4, preços de planos, séries e episódios |
| **Segurança** | Senhas `scrypt`, rotas com verificação de sessão/função, SQL parametrizado, CSRF, validação de arquivos, tokens temporários de vídeo, rate limiting básico |

Todos os títulos e vídeos iniciais são fictícios ou criados especificamente para testes; não incluem filmes comerciais ou de terceiros.

## 4. Testar a assinatura e o aluguel

1. Cadastre uma conta e entre nela.
2. Acesse **Assine já** e selecione o plano mensal ou anual. O pagamento é criado com o estado `pending` no banco.
3. No checkout de teste, clique em **Simular aprovação**. O backend registra a aprovação e libera os filmes de assinatura. **Nenhum cartão é solicitado e nenhuma cobrança real acontece**.
4. Abra um título marcado como **Aluguel**, clique em **Alugar filme** e simule a aprovação. O acesso dura até o prazo configurado e independe de possuir assinatura.
5. Confira **Minha conta → Aluguéis e pagamentos**. Pagamento recusado ou pendente não libera conteúdo.

## 5. Criar um administrador

1. No terminal, dentro da pasta do projeto, execute `npm run admin` (de preferência com o servidor fechado).
2. Informe e-mail, nome e senha com pelo menos 10 caracteres.
3. Inicie novamente a plataforma e faça login com essa conta.
4. O menu **Admin** ficará visível. Você poderá cadastrar filmes, subir MP4 autorizados, editar metadados e preços e montar séries ligando episódios a filmes existentes.

Não há conta de administrador pré-configurada ou senha compartilhada no pacote.

## 6. Pastas e comandos

```text
retro-play-completo/
├── INICIAR_RETRO_PLAY.bat       # Inicia, checa e abre o site no Windows
├── INICIAR_RETRO_PLAY.sh        # Linux/macOS
├── INSTRUCOES_RAPIDAS.txt
├── README.md
├── package.json
├── .env.example
├── public/                    # Frontend, estilos e cartazes
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── assets/posters/
│   └── assets/captions/
├── server/                    # API, segurança, streaming e SQLite
│   ├── server.mjs
│   ├── app.mjs
│   ├── auth.mjs
│   └── db.mjs
├── storage/                   # MP4 e HLS protegidos
├── scripts/                   # Criação de admin e mídias de teste
├── tests/                     # Integração HTTP e eventos simulados da interface
└── data/                      # Criada automaticamente; armazena banco local
```

Comandos: `npm start` para iniciar, `npm test` para testar, `npm run admin` para criar um admin, `npm run media` para gerar vídeos de demonstração se houver FFmpeg. Testado no Node.js v22.16.0.

Se quiser personalizar servidor/banco, copie `.env.example` para `.env` e ajuste `HOST`, `PORT`, `RETRO_DB_PATH`, `RETRO_SECRET` e `COOKIE_SECURE`. Nunca publique credenciais ou `.env` em repositórios.

## 7. O que ainda falta para um serviço comercial

Esta versão mantém a arquitetura de baixo atrito **JavaScript/HTML/CSS + Node.js nativo + SQLite**. O projeto original especificava **React/TypeScript/Vite, NestJS/Express e PostgreSQL**; essa migração não foi realizada. Também permanecem pendentes para produção:

- Integração real com **Mercado Pago em sandbox**, autenticação do provedor e webhooks; o simulador incluído é apenas interno e **não deve ser exposto publicamente**.
- Armazenamento de mídia S3, CDN, URLs assinadas adaptadas a múltiplas instâncias, transcodificação HLS automática de novos uploads, faixas alternativas de áudio, DRM e streaming com licenças legítimas.
- Renovação/cobrança recorrente real, emissão fiscal, adequação operacional e jurídica, proteção contra fraude e gerenciamento avançado de assinaturas.
- Infraestrutura e monitoramento, backups/restore, revisão independente de segurança, proteção de dados (LGPD), limites de carga e testes em dispositivos reais.

**Antes de publicar na internet**, substitua o simulador de pagamentos por um provedor real e faça uma revisão de segurança e arquitetura. Não rode com `COOKIE_SECURE=false` sob domínio público; use HTTPS, ambiente seguro e credenciais próprias no servidor. O uso de filmes requer autorização dos titulares.

## 8. Testes realizados

Execute `npm test` para a bateria de testes de integração HTTP. Ela verifica cadastro, login, alteração de senha, cookies/CSRF, perfis, catálogo, séries, streaming protegido, assinatura, aluguel, prazos, administração e upload de vídeo. **Não equivale a testes de navegador em todos os dispositivos nem a auditoria de produção.**

## Atualização V3 — cadastro e diagnóstico

- Feche a versão anterior e extraia o novo ZIP completamente, fora da pasta compactada.
- Execute `INICIAR_RETRO_PLAY.bat`. Se a porta já estiver ocupada, o inicializador mostrará o problema e não abrirá uma versão diferente por engano.
- O formulário de cadastro valida nome, e-mail, tamanho da senha e confirmação, com mensagens visíveis.
- O servidor detecta uma pasta de instalação sem permissão para gravar e, no Windows, usa uma pasta de dados do usuário em `%LOCALAPPDATA%\RetroPlay` quando necessário.
- Em caso de falha, mantenha o servidor aberto e execute `DIAGNOSTICAR_CADASTRO.bat`: ele testa o cadastro e informa se o servidor principal está acessível. O teste cria somente uma conta temporária em um banco temporário e a apaga ao fim.

**Limite da verificação:** testes automatizados foram executados em Linux, não substituem um teste manual no seu Windows. Se aparecer uma mensagem específica de erro, envie esse texto para facilitar a correção exata.

**Conflito verificado no ambiente de desenvolvimento:** a porta 4173 estava ocupada por uma versão 1.0.0 do Retro Play. O inicializador V3 impede que o usuário abra essa versão antiga sem perceber. Isso não confirma que seja a mesma causa no computador do usuário.
