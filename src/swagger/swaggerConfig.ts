import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import type { FastifySwaggerUiOptions } from '@fastify/swagger-ui';

/**
 * Configuração do @fastify/swagger: gera o documento OpenAPI a partir dos
 * `schema` já declarados nas rotas (ex.: o body de POST /chat em server.ts).
 */
export const swaggerOptions: FastifyDynamicSwaggerOptions = {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Medical Appointment Agent API',
      description: 'Agente conversacional para agendamento e cancelamento de consultas médicas.',
      version: '1.0.0',
    },
  },
};

/**
 * Configuração do @fastify/swagger-ui: serve a UI interativa (Swagger UI)
 * a partir do documento OpenAPI gerado acima.
 */
export const swaggerUiOptions: FastifySwaggerUiOptions = {
  routePrefix: '/docs',
};
