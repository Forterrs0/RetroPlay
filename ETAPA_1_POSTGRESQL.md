# Retro Play — Etapa 1: preparar PostgreSQL e migrar os dados

**Esta entrega NÃO altera a aplicação para usar PostgreSQL em tempo real.** O backend atual depende da API síncrona `node:sqlite`, e trocar somente `DATABASE_URL` não funcionaria. Esta etapa cria o esquema PostgreSQL e copia dados existentes sem modificar o banco de origem. Na etapa seguinte, as consultas do backend devem ser reescritas usando `pg` assíncrono e testes de autenticação, assinatura e catálogo.

## 1. Antes de começar

- Instale Node.js 22.13+.
- Crie um projeto PostgreSQL (ex.: Supabase) e obtenha a `DATABASE_URL` **do servidor**, nunca uma chave pública do navegador.
- Crie um banco ou esquema **vazio, exclusivamente para Retro Play**. Não use um banco contendo dados de outro app.
- Faça um backup do SQLite atual e guarde-o fora do ZIP.
- Não envie `.env`, `*.sqlite`, senhas ou `DATABASE_URL` a outras pessoas.

## 2. Encontre o arquivo SQLite real

Quando o Retro Play é executado, o servidor escreve `Banco de dados: <caminho>` no terminal. Por padrão fica em `data/retro-play.sqlite`. Em Windows com pasta protegida, ele pode estar em `%LOCALAPPDATA%\RetroPlay\retro-play.sqlite`. **Use o que contém suas contas reais**.

## 3. Configuração

Na pasta do projeto, copie `.env.example` para `.env`. Preencha:

```dotenv
DATABASE_URL=postgresql://usuario:senha@servidor:5432/retroplay
RETRO_SQLITE_SOURCE=C:/caminho/para/retro-play.sqlite
RETRO_CONFIRM_MIGRATION=SIM
PGSSL=require
```

Se o provedor oferecer certificado TLS próprio ou exigir uma configuração diferente de SSL, siga a documentação dele. Não desative validação de certificados em produção.

## 4. Copiar dados

No terminal dentro da pasta do projeto:

```bash
npm install
npm run db:migrate
```

A migração cria as tabelas e copia usuários (incluindo os hashes de senha existentes), administradores, perfis, planos, assinaturas, pagamentos simulados, filmes, gêneros, locações, listas, histórico e progressos. As sessões antigas não são copiadas; os usuários terão que entrar novamente quando a nova API estiver pronta.

A cópia acontece em **uma transação**; em caso de falha, será revertida. O script se recusa a copiar para um banco que já possua usuários ou filmes.

## 5. Após copiar

- Não apague nem substitua o SQLite local.
- O site ainda usa SQLite durante esta etapa.
- Arquivos `.mp4`, capas e HLS **não ficam no PostgreSQL**; terão armazenamento externo com controle de acesso posteriormente.
- No PostgreSQL, verifique as contagens com `SELECT COUNT(*) FROM users;`, `SELECT COUNT(*) FROM movies;` e `SELECT COUNT(*) FROM subscriptions;`.
- Não exponha a conexão PostgreSQL no frontend ou em um repositório público.

## Próxima etapa técnica

Converter `server/app.mjs`, `server/auth.mjs`, `server/db.mjs` e `scripts/create-admin.mjs` para consultas assíncronas no PostgreSQL, com testes reais de cadastro/login, admins, compras, assinatura, vídeos e preservação das permissões. Em seguida realizar implantação segura em HTTPS. O endpoint de pagamentos atual é **simulado** e não deve ser anunciado como cobrança real.
