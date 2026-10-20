import { HumanMessage } from 'langchain';
import { buildGraph } from './graph/factory.ts';

import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { swaggerOptions, swaggerUiOptions } from './swagger/swaggerConfig.ts';

// Grafo compilado (workflow.compile(), via buildGraph) — montado uma única
// vez no carregamento do módulo e reutilizado por todas as requisições.
// AppointmentService por trás dele é o armazenamento em memória, então o
// estado das consultas persiste entre requisições, mas reseta a cada
// restart do processo.
const graph = buildGraph();

/**
 * Cria a aplicação Fastify com a única rota da API: POST /chat.
 * Body esperado: { question: string } (mínimo 10 caracteres).
 *
 * O handler invoca o grafo compilado (graph.invoke) com a pergunta do
 * usuário embrulhada em uma HumanMessage, e retorna o GraphState resultante
 * completo como JSON — incluindo messages, intent, actionSuccess,
 * actionError, appointmentData, etc. Não há formatação/filtragem da
 * resposta: é o state bruto do grafo.
 *
 * Erros inesperados (fora do fluxo normal de actionSuccess/actionError já
 * tratado dentro do grafo) caem no catch e retornam HTTP 500 genérico.
 */
export const createServer = () => {
    const app = Fastify();

    // Gera o documento OpenAPI a partir dos `schema` das rotas e serve a
    // Swagger UI em /docs, para facilitar testes manuais de requisições HTTP.
    app.register(swagger, swaggerOptions);
    app.register(swaggerUi, swaggerUiOptions);

    app.post('/chat', {
        schema: {
            summary: 'Envia uma mensagem ao agente de agendamento',
            description: 'Classifica a intenção (agendar/cancelar consulta), executa a ação correspondente e retorna o state completo do grafo, incluindo a resposta em linguagem natural.',
            tags: ['chat'],
            body: {
                type: 'object',
                required: ['question'],
                properties: {
                    question: { type: 'string', minLength: 10 },
                },
            }
        }
    }, async function (request, reply) {
        try {
            const { question } = request.body as {
                question: string;
            };

            const response = await graph.invoke({
                messages: [new HumanMessage(question)],
            });

            return response

        } catch (error) {
            console.error('❌ Error processing request:', error);
            return reply.status(500).send({
                error: 'An error occurred while processing your request.',
            });
        }
    });

    return app;
};
