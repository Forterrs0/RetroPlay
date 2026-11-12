# Retro Play — Etapa 2: backend PostgreSQL (versão para validação)

## O que mudou
- O servidor escolhe entre SQLite (padrão) e PostgreSQL (`RETRO_DB_ENGINE=postgres`).
- A API PostgreSQL adapta cadastro, login, sessões, perfis, assinaturas, pagamentos sandbox, filmes, séries, histórico, favoritos, avaliações e administração.
- Não altera o frontend nem os dados SQLite existentes.

## IMPORTANTE
Esta implementação teve análise estática e testes de regressão locais. **Ainda não foi executada contra um banco Supabase real** neste ambiente. Antes de abrir ao público, valide todos os fluxos num banco de teste e não use a versão como serviço comercial.

## Preparação
1. Faça backup de `data/retro-play.sqlite` e da pasta de vídeos. Não rode novamente o migrador se você já transferiu as tabelas.
2. Preserve o `.env` local. Nunca envie `DATABASE_URL` para GitHub ou para o frontend.
3. Verifique se seu banco PostgreSQL já tem as tabelas e dados migrados.
4. Execute `npm install` na pasta do projeto.
5. Acrescente ao seu `.env` (sem apagar a `DATABASE_URL`):

```env
RETRO_DB_ENGINE=postgres
RETRO_SECRET=COLOQUE_AQUI_UM_SEGREDO_ALEATORIO_COM_PELO_MENOS_32_BYTES
HOST=127.0.0.1
PORT=4173
COOKIE_SECURE=false
```

Para gerar o segredo no CMD, execute:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
Copie o resultado apenas para `RETRO_SECRET` no `.env`. Nunca o divulgue.

## Iniciar
`node --env-file=.env server/server.mjs`
Ou clique `INICIAR_RETRO_PLAY_POSTGRES.bat` no Windows.

## Verificar
- Acesse `http://127.0.0.1:4173/api/health` e verifique `"database":"postgresql"`.
- Teste cadastro novo, logout e login, reiniciando o servidor para conferir persistência.
- Teste usuário comum sem acesso a `/api/admin/stats` (deve retornar 403).
- Crie administrador novo, se necessário, usando `npm run admin:pg` (a senha será visível no CMD durante a digitação).
- Teste assinatura e aluguel **apenas sandbox**, favoritos, perfis e catálogo.

## Atenção: mídia
PostgreSQL centraliza os dados, **não hospeda os vídeos**. Nesta etapa arquivos MP4/HLS continuam locais; para a plataforma pública ainda será necessário armazenamento de objetos, URLs de acesso autorizadas, CDN, HTTPS, cookies seguros, backups e pagamentos reais.

## Retorno para SQLite
Remova `RETRO_DB_ENGINE=postgres` do `.env` ou configure `RETRO_DB_ENGINE=sqlite` e execute `npm start`. Os dados inseridos em PostgreSQL **não são sincronizados** automaticamente de volta para SQLite.

## Testes locais
`npm test` e `npm run test:pg-sql`.

## Riscos e pendências
- Migração realizada anteriormente precisa ser confirmada; não a repita.
- É necessária validação de integração com PostgreSQL real (ainda não realizada).
- Mantenha login e pagamentos apenas em ambiente controlado até validar segurança e integração.
