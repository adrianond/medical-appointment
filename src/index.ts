// Ponto de entrada da aplicação (rodado via `node --env-file .env src/index.ts`,
// npm start/dev). createServer() monta o Fastify e registra a rota POST /chat
// (server.ts), mas ainda não escuta nada nesse ponto — o grafo LangGraph
// (buildGraph, dentro de server.ts) já foi montado uma única vez ao importar
// o módulo. listen() é o que efetivamente começa a aceitar requisições HTTP
// na porta 3000; a partir daí, cada requisição em /chat reutiliza o mesmo
// grafo já compilado.
import { createServer } from './server.ts';

const app = createServer();

await app.listen({ port: 3000, host: '0.0.0.0' });
console.log(`Server is running on http://0.0.0.0:3000`);

//  curl \
//  -X POST \
//  -H 'Content-type: application/json' \
//  --data '{"question": "upper"}' \
//  localhost:3000/chat
