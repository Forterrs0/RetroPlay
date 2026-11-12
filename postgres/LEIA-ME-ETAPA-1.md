# Retro Play — Etapa 1: preparação e cópia segura para PostgreSQL

**Escopo desta entrega:** adiciona esquema PostgreSQL, teste de conexão e migração dos registros do SQLite para um banco PostgreSQL **vazio**. **Não modifica o site para usar PostgreSQL ainda**, porque o backend atual usa a API síncrona `node:sqlite`; a segunda etapa adaptará consultas e transações para `pg` assíncrono. Continuar usando o site com SQLite após a cópia não sincroniza os bancos!

## Instalação

1. Faça backup de `data/retro-play.sqlite` e de sua pasta de mídia. Se o banco estiver em `%LOCALAPPDATA%\RetroPlay\retro-play.sqlite`, use essa localização no `RETRO_DB_PATH`. Pare o servidor antes de fazer backup/migração. Se houver arquivos SQLite `-wal` ou `-shm`, pare o servidor corretamente primeiro.
2. Crie um banco **PostgreSQL novo e vazio** (ex.: no Supabase). Nunca use o banco de produção com dados preexistentes para esta importação.
3. No terminal dentro da pasta `RetroPlay-V3`, execute `npm install`.
4. Crie um `.env` a partir de `.env.example`. Ajuste `RETRO_DB_PATH` se necessário e preencha `DATABASE_URL` com a **string de conexão do servidor** (não coloque URL/credenciais no JavaScript do navegador, nem em repositório). O `PGSSL=require` exige cadeia de CA válida; se o serviço usar certificado privado, configure a CA no ambiente em vez de desativar a validação.
5. Teste `npm run pg:check`.
6. Depois de encerrar o site, execute no PowerShell: `$env:RETRO_PG_CONFIRM='MIGRAR'; npm run pg:migrate`. No CMD: `set RETRO_PG_CONFIRM=MIGRAR` e depois `npm run pg:migrate`.
7. Confirme que cada tabela terminou com a contagem esperada e guarde o arquivo SQLite original como backup.

## Dados preservados

Usuários e hashes de senha, perfis, sessões, administradores (`users.role`), planos, assinaturas, pagamentos, aluguéis, filmes, gêneros, séries, episódios, progresso, listas, avaliações e conquistas. Os IDs originais são preservados e as sequências PostgreSQL são ajustadas.

## Limites / segurança

- Nenhum vídeo ou capa é enviado para PostgreSQL: apenas metadados e caminhos. Os arquivos devem ser migrados separadamente para armazenamento de mídia.
- A cópia usa transação para os registros, confere a contagem de cada tabela e não apaga os registros do SQLite.
- A criação da estrutura ocorre antes da transação de cópia; se a importação falhar, as tabelas vazias continuarão existentes. Reexecutar em banco vazio é permitido.
- Não use `PGSSL=disable` em um serviço exposto à internet.
- PostgreSQL público e autenticação pela internet **ainda não estão ativados** nesta etapa. Não publique esta versão como um serviço pronto.
- Versão anterior do ZIP tinha um bug do modal. Esta entrega incorpora a correção de clique do backdrop.
