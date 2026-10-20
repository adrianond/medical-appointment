import { getSystemPrompt, getUserPromptTemplate, IntentSchema } from '../../prompts/v1/identifyIntent.ts';
import { professionals } from '../../services/appointmentService.ts';
import { AnthropicService } from '../../services/anthropicService.ts';
import type { GraphState } from '../graph.ts';

// Nó do grafo responsável por classificar a intenção do usuário (schedule/cancel/unknown)
// e extrair os dados da consulta (profissional, data/hora, paciente, motivo) a partir da
// última mensagem, usando o prompt/schema de src/prompts/v1/identifyIntent.ts.
// É o primeiro nó do fluxo (START -> identifyIntent) e o resultado dele decide o roteamento
// condicional para schedule/cancel/message em graph.ts.
// Nunca lança exceção: qualquer falha (do LLM ou inesperada) cai em intent: 'unknown',
// garantindo que o grafo sempre chegue ao node 'message' com um estado consistente.
export function createIdentifyIntentNode(llmClient: AnthropicService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`🔍 Identifying intent...`);
   // state.messages é populado por quem invoca graph.invoke() antes do START:
   // - em produção, pela rota POST /chat (src/server.ts), que envia [new HumanMessage(question)];
   // - em dev, pelo LangGraph Studio (npm run langgraph:serve / langgraph.json), que monta a
   //   mensagem a partir do que for digitado na UI.
   // Este node é agnóstico a essa origem: só lê a última mensagem do state.
   const input = state.messages.at(-1)!.text;

    try {
      const systemPrompt = getSystemPrompt(professionals)
      const userPrompt = getUserPromptTemplate(input)
      const result = await llmClient.generateStructured(
        systemPrompt,
        userPrompt,
        IntentSchema,
      )
      if(!result.success){
        console.log(`⚠️  Intent identification failed: ${result.error}`);
        return {
          intent: 'unknown',
          error: result.error
        }
      }

      const intentData = result.data!
      console.log(`✅ Intent identified: ${intentData.intent}`);

      return {
        ...intentData,
      };

    } catch (error) {
      console.error('❌ Error in identifyIntent node:', error);
      return {
        ...state,
        intent: 'unknown',
        error: error instanceof Error ? error.message : 'Intent identification failed',
      };
    }
  };
}
