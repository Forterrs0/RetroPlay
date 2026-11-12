# Retro Play — Etapa 3: preparação para hospedagem (STAGING)

Este pacote é para **testes online**, não uma plataforma comercial pronta. O backend PostgreSQL da etapa 2 ainda não foi validado contra seu banco Supabase neste ambiente. A migração não deve ser repetida.

## O que foi adicionado
- `render.yaml`: configuração Render para serviço Node, usando variável PORT automática e bind 0.0.0.0.
- Servidor exige PostgreSQL, cookies seguros, segredo persistente e habilitação explícita ao iniciar com `NODE_ENV=production`.
- **Pagamentos simulados e aprovação de assinaturas por sandbox ficam desativados online**. Sem integração real, não é seguro liberar acesso pago a partir de um botão de teste.
- Upload de MP4/capas desativado online até ser implementado armazenamento externo persistente (R2/S3); os MP4 de demonstração incluídos no repositório permanecem apenas para testes.
- `npm run deploy:check`: inspeção local de variáveis sem imprimir segredos.

## Antes de subir
1. Faça backup do SQLite, dos vídeos e do banco Supabase.
2. Confirme que a API PostgreSQL realmente funciona **localmente**: `/api/health`, cadastro, login, favoritos, admin, catálogo. A etapa 2 passou somente por testes locais, não por conexão real ao Supabase.
3. Troque a senha do banco caso ela tenha aparecido em capturas de tela; atualize a URL de conexão.
4. Não coloque `.env` no Git. Este pacote ignora arquivos `.env*`, exceto `.env.example`.
5. Faça push do código-fonte para um repositório **privado** GitHub. Nunca suba `data/`, arquivos `.env` nem banco SQLite.

## Render
1. No Render, **New → Blueprint**, conecte seu repositório contendo `render.yaml`.
2. Escolha o serviço de staging. Render configurará `HOST=0.0.0.0`, `RETRO_DB_ENGINE=postgres`, `NODE_ENV=production`, `COOKIE_SECURE=true`.
3. Informe `DATABASE_URL` em **Environment** com a URI **Session pooler** copiada do Supabase. Nunca cole credenciais nos arquivos versionados. O usuário e host devem ser copiados exatamente do painel Supabase.
4. Render gerará `RETRO_SECRET`; mantenha-o estável entre deploys e não o divulgue.
5. Deploy: aguarde a mensagem de PostgreSQL conectado no log e abra a URL HTTPS `.onrender.com` gerada pelo serviço.
6. Confira `/api/health` e faça testes com conta descartável, sem dados reais.

## Diagnóstico
- `getaddrinfo ENOTFOUND`: host incorreto no `DATABASE_URL`.
- `password authentication failed`: credenciais ou senha codificada incorretamente.
- `Banco de dados indisponível`: verificar logs, URI e permissões.
- `Erro interno no servidor`: backend precisa de correção; não ative uso público sem testes.
- Upload/payments retornando 503 online: intencional até R2/S3 e provedor de pagamentos reais.
- No plano gratuito, o serviço pode hibernar; verifique limites e políticas atuais do Render.

## O que NÃO está pronto
- Integração R2/S3 + CDN e HLS adaptativo de produção.
- Checkout real com webhooks verificados, conciliação, cancelamento e cobrança.
- Backup/restauração automatizados, testes de segurança, política de privacidade, LGPD e direito de distribuição de filmes.
- Testes de integração PostgreSQL/Supabase reais e testes completos de produção.

**Não divulgue o serviço como plataforma de streaming em produção.** Use o ambiente staging com acesso restrito aos testes, até concluir as pendências.
