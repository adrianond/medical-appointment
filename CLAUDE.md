# CLAUDE.md

Este arquivo fornece orientações para o Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## O que é isto

Um agente conversacional baseado em LangGraph para uma clínica médica, que agenda e cancela consultas através de um único endpoint `/chat`. Uma mensagem do usuário entra, um grafo orientado por LLM classifica a intenção, executa a ação correspondente em um armazenamento de consultas em memória e gera uma resposta em linguagem natural (português).

> Observação: o `README.md` na raiz do repositório descreve um projeto não relacionado, "Prompt Chaining Article Generator" (pipeline outline → draft → review). Esse conteúdo está desatualizado/é resquício de um template e não reflete o código real em `src/` — não confie nele. Confie no código-fonte e neste arquivo.

## Comandos

Sem etapa de build: os arquivos TypeScript rodam diretamente via type-stripping nativo do Node (`node --env-file .env src/index.ts`), então não há `dist/` nem comando de compilação. O `tsconfig.json` tem `noEmit: true` e é usado apenas para checagem de tipos (ainda não existe um script dedicado de typecheck).

```bash
npm start                  # roda o servidor Fastify (src/index.ts) na porta 3000
npm run dev                 # o mesmo, com --watch --inspect para desenvolvimento local

npm test                    # roda TODOS os testes (tests/**/*.test.ts) com chamadas reais de API (carrega .env)
npm run test:unit           # roda apenas arquivos *unit.test.ts, sem .env / sem chamadas reais de API
npm run test:unit:dev       # testes unitários em modo --watch --inspect
npm run test:e2e            # roda apenas arquivos *e2e.test.ts (carrega .env, chama a API real da Anthropic)
npm run test:e2e:dev        # testes e2e em modo --watch --inspect

npm run langgraph:serve     # inicia o servidor de dev do LangGraph Studio (npx @langchain/langgraph-cli@1.1.17 dev)
```

> A versão do `@langchain/langgraph-cli` está fixada em `1.1.17` (em vez de usar `npx @langchain/langgraph-cli dev`, que sempre puxaria a última versão). Versões mais recentes do CLI empacotam um `@langchain/langgraph-api` que exige `@langchain/langgraph@^1.4.18-rc.0`, mas o projeto tem `@langchain/langgraph@1.1.3` (trazido transitivamente por `langchain@^1.2.17`), o que causa `ERR_PACKAGE_PATH_NOT_EXPORTED` (subpath `./stream` não existe na versão instalada). Não remova esse pin sem antes atualizar `@langchain/langgraph`/`langchain` de forma compatível.

Os testes usam o test runner nativo do Node (`node --test`), não Jest/Vitest. Para rodar um único arquivo de teste diretamente:

```bash
node --env-file .env --test tests/router.e2e.test.ts
```

Atualmente existe apenas um arquivo de teste, `tests/router.e2e.test.ts`, e ele faz chamadas **reais** através do grafo/servidor compilado (sem mock de LLM) — precisa de um `ANTHROPIC_API_KEY` válido em `.env` para passar. Siga a convenção de nomenclatura existente `*.unit.test.ts` / `*.e2e.test.ts` para novos testes, para que sejam capturados pelo script npm correto.

Não há ferramentas de lint ou formatação (ESLint/Prettier) configuradas neste repositório.

`npm install` pode falhar com `ERESOLVE` (conflito de peer dependency entre `@langchain/anthropic@1.2.0`, que exige `@langchain/core@1.1.1`, e o `@langchain/core@^1.1.19` já resolvido pelo `langchain`). Use `npm install --legacy-peer-deps` ao adicionar novas dependências.

## Ambiente

Copie `.env.example` para `.env` antes de rodar qualquer coisa. Variáveis obrigatórias/relevantes:
- `ANTHROPIC_API_KEY` — obrigatória; a aplicação faz um assert na inicialização caso esteja ausente.
- `LANGSMITH_API_KEY`, `LANGCHAIN_TRACING_V2`, `LANGCHAIN_PROJECT` — tracing opcional via LangSmith.

> `.env.example` ainda lista `OPENROUTER_API_KEY` (resquício do provider anterior) — atualize-o para `ANTHROPIC_API_KEY` ao mexer nesse arquivo.

## Arquitetura

### Fluxo do grafo (`src/graph/graph.ts`)

Um `StateGraph` do LangGraph com um estado definido em Zod (`AppointmentStateAnnotation` / `GraphState`) que carrega a lista de mensagens além dos campos extraídos da consulta (`patientName`, `intent`, `professionalId`, `professionalName`, `datetime`, `reason`) e dos resultados da ação (`actionSuccess`, `actionError`, `appointmentData`, `error`).

Fluxo: `START → identifyIntent → (condicional: schedule | cancel | message) → schedule|cancel → message → END`

- Se `identifyIntent` produzir um erro, nenhuma intenção, ou `intent === 'unknown'`, o roteamento vai direto para `message`.
- `schedule` e `cancel` sempre fluem para `message` em seguida, independentemente de sucesso ou falha — `message` é sempre o nó final e é responsável por transformar `actionSuccess`/`actionError`/`error` em uma resposta voltada ao usuário.

Construído via `src/graph/factory.ts` (`buildGraph()` conecta `AnthropicService` + `AppointmentService` em `buildAppointmentGraph`). O `langgraph.json` aponta o LangGraph Studio (`langgraph:serve`) para `src/graph/factory.ts:graph`, uma factory assíncrona exportada separadamente de `buildGraph` para atender às expectativas dessa CLI.

### Nós (`src/graph/nodes/`)

- **identifyIntentNode** — envia a última mensagem do usuário + a lista estática `professionals` para o LLM via `AnthropicService.generateStructured`, validado contra `IntentSchema` (`src/prompts/v1/identifyIntent.ts`). Recai para `intent: 'unknown'` em qualquer falha, em vez de lançar exceção.
- **schedulerNode** / **cancellerNode** — validam os campos obrigatórios (`professionalId`, `datetime`, `patientName`) com um schema Zod local, então chamam `AppointmentService.bookAppointment` / `cancelAppointment`. Capturam erros do serviço (ex.: conflito de horário) transformando-os em `actionSuccess: false` / `actionError`, em vez de lançar exceção, para que o grafo sempre chegue a `message`.
- **messageGeneratorNode** — monta uma chave `scenario` como `schedule_success` / `cancel_error` / `unknown_error` a partir do estado, e então pede ao LLM (`src/prompts/v1/messageGenerator.ts`, `MessageSchema`) uma resposta calorosa, preferencialmente em português, anexada como `AIMessage`.

### Prompts (`src/prompts/v1/`)

Os prompts não são arquivos/strings de template, mas módulos TypeScript que exportam funções `getSystemPrompt` / `getUserPromptTemplate` retornando objetos estruturados via `JSON.stringify` (role, rules, examples, instructions) em vez de texto corrido — isso é intencional; trate como a convenção estabelecida para novos prompts dentro de uma pasta versionada (`v1/`), caso seja incrementada no futuro.

### Serviços

- **`AnthropicService`** (`src/services/anthropicService.ts`) encapsula o `ChatAnthropic` (`@langchain/anthropic`), usando `createAgent` + `providerStrategy(schema)` do `langchain` para saída estruturada validada por schema. Configurado via `src/config.ts` (`model`, `temperature`, `disableStreaming`, `maxTokens` — ver JSDoc no próprio arquivo para o porquê de cada valor). `generateStructured` nunca lança exceção — sempre retorna `{ success, data?, error? }` (`success: false` no caminho de catch). `identifyIntentNode.ts` checa `!result.success`, enquanto `messageGeneratorNode.ts` checa `result.error || !result.data` truthiness — mantenha a checagem existente ao mexer em cada node em vez de unificar sem necessidade.
  > ⚠️ Histórico: `maxTokens` já esteve setado como `10`, baixo demais para respostas estruturadas (JSON via tool-calling) — truncava a saída do modelo antes do schema fechar, fazendo `generateStructured` retornar `success: true` com `data: undefined` (o node de mensagem chegou a quebrar com `TypeError` por causa disso). Hoje está em `1024`; não abaixe esse valor sem entender essa causa raiz.
- **`AppointmentService`** (`src/services/appointmentService.ts`) é um armazenamento simples em memória (arrays de `professionals` e `appointments`, sem banco de dados) — o estado é reiniciado a cada reinício do processo. `professionals` também é importado diretamente por `identifyIntentNode` para embasar o fuzzy-matching de nomes para IDs feito pelo LLM.

### Servidor (`src/server.ts`, `src/index.ts`)

Uma única rota Fastify `POST /chat` (body: `{ question: string }`, tamanho mínimo 10) invoca o grafo compilado com uma `HumanMessage` e retorna o estado resultante completo como JSON (incluindo `messages`, `intent`, `actionSuccess`, etc. — não há formatação/filtragem da resposta).

`createServer()` monta o grafo (`buildGraph()`, de `factory.ts`) uma única vez no carregamento do módulo, reutilizado por todas as requisições — não é remontado por request. `index.ts` é o ponto de entrada: chama `createServer()` e depois `app.listen(...)`, que é o que efetivamente começa a aceitar conexões HTTP.

`@fastify/swagger` + `@fastify/swagger-ui` estão registrados em `server.ts`, servindo a documentação OpenAPI interativa em `GET /docs` (config em `src/swagger/swaggerConfig.ts`) — útil para testar `/chat` manualmente sem precisar de curl/Postman.

### Observação sobre versão do Zod

Os arquivos misturam `import { z } from 'zod'` (schemas de estado, schemas de prompt) e `import { z } from 'zod/v3'` (schemas de validação locais aos nós em `schedulerNode.ts`/`cancellerNode.ts`, e dentro de `anthropicService.ts`). Siga o que o arquivo em questão já usa — não "corrija" essa inconsistência como parte de uma mudança não relacionada.
