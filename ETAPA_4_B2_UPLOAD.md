# Retro Play — Upload direto Backblaze B2 (integração experimental)

## Instalação

**Não sobrescreva sua versão ativa.** Extraia este ZIP em uma pasta nova, copie apenas seu `.env` privado (não envie o arquivo ao GitHub), e rode:

```cmd
npm install
node --check server/app-pg.mjs
node --test tests/b2-media.test.mjs
```

No Render, `Build Command: npm install`, `Start Command: npm run start`. Faça commit de `package.json`, `server/b2-media.mjs`, `server/app-pg.mjs`, `server/server.mjs`, `public/app.js`, `scripts/configure-b2-cors.mjs`, `tests/b2-media.test.mjs` e este documento. O arquivo `package-lock.json` deve ser regenerado **no seu computador** com `npm install` e incluído no commit, para que possa voltar a usar `npm ci` posteriormente. Não suba `.env`, bancos ou node_modules.

## Environment (local e Render)

As variáveis `DATABASE_URL`, `RETRO_SECRET`, `RETRO_DB_ENGINE=postgres`, `COOKIE_SECURE=true`, `RETRO_PUBLIC_STAGING=YES`, `NODE_ENV=production` continuam necessárias no Render.

Configurar também no **Render → Environment** (valores reais somente no painel):

```dotenv
B2_BUCKET=SEU_BUCKET_PRIVADO
B2_REGION=REGIAO_EXATA
B2_ENDPOINT=https://s3.REGIAO_EXATA.backblazeb2.com
B2_KEY_ID=KEY_ID
B2_APPLICATION_KEY=APPLICATION_KEY
```

Para desenvolvimento local, mantenha `COOKIE_SECURE=false` e `HOST=127.0.0.1` em seu `.env` local; no Render, `HOST=0.0.0.0` ou sem HOST.

Se credenciais de banco ou B2 apareceram em capturas anteriores, **revogue/gire essas credenciais primeiro** e atualize os valores no Render e no arquivo `.env` local.

## CORS obrigatório para upload via navegador

B2 requer CORS, pois a página em `https://seu-site.onrender.com` envia o MP4 diretamente ao endereço S3 do bucket. Configure as origens permitidas para **seu domínio real** (sem `/` final). Execute na sua máquina:

```cmd
set "RETRO_PUBLIC_ORIGIN=https://SEU-SITE.onrender.com"
node --env-file=.env scripts/configure-b2-cors.mjs
set "CONFIRM_B2_CORS=YES"
node --env-file=.env scripts/configure-b2-cors.mjs
```

O primeiro comando mostra a prévia; o segundo aplica. **Atenção:** a chamada `PutBucketCors` substitui regras CORS anteriores. Se o bucket for compartilhado por outros projetos, adapte o script para preservar as regras antigas. Para testar localmente, configure também `http://127.0.0.1:4173` em AllowedOrigins separadamente (se for necessário), sem liberar `*` em um serviço privado.

Referência oficial: https://www.backblaze.com/docs/cloud-storage-enable-cors-with-the-s3-compatible-api

## Fluxo implementado

1. Admin autenticado preenche **Cadastrar filme** e seleciona capa opcional + MP4 autorizado.
2. Frontend requisita `POST /api/admin/upload/prepare`; backend verifica sessão, CSRF e função admin e devolve URL de `PUT` com duração de 20 minutos, caminho aleatório e comprovante HMAC.
3. Browser envia bytes direto ao bucket B2 privado por `PUT`.
4. Frontend envia `poster`, `posterUploadToken`, `videoFile`, `videoUploadToken` à rota `POST /api/admin/movies`.
5. Backend faz `HeadObject`, valida tamanho/tipo e verifica bytes iniciais do arquivo antes de inserir metadados no PostgreSQL.
6. Capa publicada: `/api/media/poster/<uuid>.<ext>` faz redirecionamento para GET B2 assinado.
7. O player mantém `/api/movies/:id/play` e `/api/stream/:id`; o backend checa sessão, token e acesso por assinatura/aluguel, depois redireciona para GET B2 assinado por 5 minutos.

**Importante:** a URL GET temporária pode ser copiada e usada até expirar; não é DRM. O projeto não implementa HLS transcodificado para os novos arquivos, renovação automática do link em vídeos longos, multipart uploads/retries, cobrança real ou limpeza automática de uploads órfãos. Não exponha conteúdo comercial licenciado sem revisar os direitos, segurança e arquitetura. Para upload simples de 1 GB ou menos, o tempo de 20 minutos pode ser insuficiente em conexões lentas. Comece com MP4 autorizado de poucos MB.

## Teste manual de ponta a ponta (obrigatório)

- Confirme `/api/health` no Render e entre com usuário admin legítimo.
- Acesse Admin, escolha uma capa PNG/JPG e um MP4 autorizado de teste; publique **Gratuito** para testar.
- Veja no Backblaze se aparecem chaves `posters/` e `videos/` e no Supabase se o filme foi criado na tabela `movies`.
- Abra o catálogo em outro navegador, sem login, e verifique a reprodução do filme gratuito.
- Teste um filme de assinatura com um usuário sem assinatura: a API deve negar reprodução.
- Se der `Failed to fetch` no PUT, revise CORS do bucket. `403 SignatureDoesNotMatch`: revise endpoint, chave e cabeçalhos enviados; `503`: B2_* ausentes no Render.
- Valide no DevTools a resposta de `POST /api/admin/upload/prepare` **sem compartilhá-la** (inclui URL temporária).

**Status:** módulo criado e teste local de validações executado. Não foi testado contra suas credenciais reais, nem validado end-to-end em Render + Supabase + B2. É uma atualização de desenvolvimento, não uma liberação comercial.
