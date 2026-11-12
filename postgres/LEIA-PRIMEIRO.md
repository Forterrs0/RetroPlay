# Retro Play — Etapa 1: exportação segura SQLite → PostgreSQL

Esta entrega **prepara e executa a migração dos dados** do SQLite para um banco PostgreSQL **vazio**. Ainda **não troca o backend** do site, porque `server/app.mjs` e `server/db.mjs` usam chamadas SQLite síncronas; mudar apenas `DATABASE_URL` não funcionaria. Isso será feito na etapa seguinte, com adaptação de todas as consultas e testes de login, cadastros e pagamentos.

## Passos

1. Faça cópia da pasta `data/` e de todo arquivo `retro-play.sqlite` (incluindo WAL/SHM, caso existam, com o servidor fechado). **Feche o servidor antes de migrar** para evitar cópias inconsistentes.
2. Contrate/crie um banco **PostgreSQL novo, vazio**, com usuário exclusivo para Retro Play, e permita conexões TLS. Não use um banco com tabelas existentes: a migração rejeita isso para evitar sobrescrever contas.
3. No terminal dentro da pasta `RetroPlay-V3`, rode `npm install` (instala o driver `pg`).
4. Configure as variáveis de ambiente sem divulgar senhas. No Windows PowerShell:

   ```powershell
   $env:DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO?sslmode=require"
   $env:SQLITE_SOURCE_PATH="./data/retro-play.sqlite"
   $env:CONFIRM_MIGRATION="YES"
   npm run db:migrate:pg
   ```

   Caso o banco local estivesse em `%LOCALAPPDATA%\\RetroPlay\\retro-play.sqlite`, defina `SQLITE_SOURCE_PATH` para esse caminho. A aplicação V3 pode salvar lá quando não tem permissão na pasta do projeto.
5. Confira as contagens de cada tabela e a mensagem `MIGRAÇÃO CONCLUÍDA`. O script gera tabelas, registros, índices únicos, chaves estrangeiras, verificações críticas e ajusta as sequências de IDs. O script aborta e faz rollback em caso de falha.
6. **Não publique ainda a versão atual em produção.** Ela continuará usando SQLite até que implementemos a camada de consultas PostgreSQL e testemos o site inteiro contra ela.

## O que será migrado

Todas as tabelas existentes da fonte SQLite, inclusive `users`, `profiles`, `sessions`, `subscriptions`, `subscription_plans`, `movies`, `genres`, `movie_genres`, `series`, `episodes`, `rentals`, `payments`, `favorites`, `watch_progress`, `reviews` e `video_assets`. Os hashes de senha são copiados sem alterações. **Arquivos MP4, imagens e HLS não são copiados**: eles ficam fora do banco e exigirão armazenamento separado.

## Segurança e limites

- Nunca envie `DATABASE_URL` ou `.env` a ninguém. Não publique a credencial no GitHub.
- Migre com o servidor SQLite parado. Faça backup antes. Evite executar repetidamente no mesmo banco de destino.
- A migração foi verificada quanto à sintaxe no Node.js, mas **não foi executada contra um PostgreSQL real neste ambiente**, por não existir instância ou acesso às credenciais. Antes de produção, valide numa instância de teste.
- O banco remoto sozinho não deixa o site online. Faltam hospedagem segura do Node.js, configuração de cookies/domínio, conversão do backend para operações assíncronas e integração de mídia.
