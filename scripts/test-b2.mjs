
import {
  S3Client,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';

const required = [
  'B2_BUCKET',
  'B2_REGION',
  'B2_ENDPOINT',
  'B2_KEY_ID',
  'B2_APPLICATION_KEY'
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Variável ausente: ${name}`);
  }
}

const client = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY
  }
});

try {
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.B2_BUCKET,
      Prefix: 'filmes/',
      MaxKeys: 1
    })
  );

  console.log('Conexão Backblaze B2 funcionando!');
  console.log('Bucket:', process.env.B2_BUCKET);
  console.log('Consulta realizada com sucesso.');
} catch (error) {
  console.error('Falha ao acessar Backblaze B2:');
  console.error(error.name, error.message);
  process.exitCode = 1;
} finally {
  client.destroy();
}
