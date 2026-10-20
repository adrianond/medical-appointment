import { config } from '../config.ts';
import { AppointmentService } from '../services/appointmentService.ts';
import { AnthropicService } from '../services/anthropicService.ts';
import { buildAppointmentGraph } from './graph.ts';

/**
 * Composição das dependências concretas do grafo: instancia AnthropicService
 * (LLM) e AppointmentService (armazenamento em memória) e monta o grafo via
 * buildAppointmentGraph. É a função usada pelo servidor Fastify real
 * (index.ts/server.ts) para atender a rota POST /chat.
 */
export function buildGraph() {
  const llmClient = new AnthropicService(config)
  const appointmentService = new AppointmentService()
  return buildAppointmentGraph(
    llmClient,
    appointmentService,
  );
}

/**
 * Reexporta buildGraph como factory assíncrona apenas porque o LangGraph
 * Studio (langgraph:serve) exige esse formato de export — langgraph.json
 * aponta para "src/graph/factory.ts:graph". Não usada pelo servidor real.
 *
 * Fluxo: `npm run langgraph:serve` roda `npx @langchain/langgraph-cli dev`,
 * que lê langgraph.json na raiz do projeto; graphs.medical_appointments
 * aponta para este export ("./src/graph/factory.ts:graph"), que a CLI
 * chama para obter o grafo servido na UI do LangGraph Studio.
 */
export const graph = async () => {
  return buildGraph();
};
