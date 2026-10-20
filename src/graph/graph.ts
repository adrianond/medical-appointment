import {
  StateGraph,
  START,
  END,
  MessagesZodMeta,
} from "@langchain/langgraph";
import { withLangGraph } from "@langchain/langgraph/zod";
import type { BaseMessage } from '@langchain/core/messages';

import { createSchedulerNode } from './nodes/schedulerNode.ts';
import { createCancellerNode } from './nodes/cancellerNode.ts';
import { createIdentifyIntentNode} from "./nodes/identifyIntentNode.ts";
import { createMessageGeneratorNode } from "./nodes/messageGeneratorNode.ts";

import { z } from "zod/v3";
import { AnthropicService } from "../services/anthropicService.ts";
import { AppointmentService } from "../services/appointmentService.ts";

/**
 * Schema Zod do state compartilhado entre todos os nós do grafo — carrega o
 * histórico de mensagens, os campos extraídos da consulta (patientName,
 * intent, professionalId, professionalName, datetime, reason) e os
 * resultados da ação (actionSuccess, actionError, appointmentData, error).
 * Cada nó recebe esse state completo e retorna um Partial<GraphState> com
 * os campos que deseja atualizar.
 */
const AppointmentStateAnnotation = z.object({
  messages: withLangGraph(
    z.custom<BaseMessage[]>(),
    MessagesZodMeta),

  patientName: z.string().optional(),

  intent: z.enum(['schedule', 'cancel', 'unknown']).optional(),
  professionalId: z.number().optional(),
  professionalName: z.string().optional(),
  datetime: z.string().optional(),
  reason: z.string().optional(),

  actionSuccess: z.boolean().optional(),
  actionError: z.string().optional(),
  appointmentData: z.any().optional(),

  error: z.string().optional(),
});

/**
 * Deriva o tipo TypeScript estático a partir do schema Zod acima, em vez de
 * declará-lo manualmente — mantém validação em runtime (Zod) e checagem em
 * tempo de compilação (TypeScript) sincronizadas a partir de uma única fonte
 * de verdade. Usado por todos os nós como tipo do parâmetro `state` e do
 * retorno `Partial<GraphState>`.
 */
export type GraphState = z.infer<typeof AppointmentStateAnnotation>;

/**
 * Monta e compila o StateGraph do LangGraph. 
 * factory que recebe os serviços já instanciados (injeção de dependência,
 * usada por buildGraph em factory.ts) e retorna o grafo compilado, pronto
 * para ser invocado pelo servidor Fastify (rota POST /chat).
 *
 * Fluxo: START → identifyIntent → (condicional: schedule | cancel | message) → message → END
 * - Se identifyIntent produzir erro, nenhuma intenção, ou intent === 'unknown',
 *   o roteamento vai direto para 'message'.
 * - schedule e cancel sempre fluem para 'message' em seguida, independente de
 *   sucesso ou falha — message é sempre o nó final, responsável por transformar
 *   actionSuccess/actionError/error em uma resposta ao usuário.
 */
export function buildAppointmentGraph(llmClient: AnthropicService, appoinmentService: AppointmentService) {


  // Build workflow graph
  const workflow = new StateGraph({
    stateSchema: AppointmentStateAnnotation,
  })
    .addNode('identifyIntent', createIdentifyIntentNode(llmClient))
    .addNode('schedule', createSchedulerNode(appoinmentService))
    .addNode('cancel', createCancellerNode(appoinmentService))
    .addNode('message', createMessageGeneratorNode(llmClient))

    // Flow
    .addEdge(START, 'identifyIntent')

    // Route based on intent
    // addConditionalEdges recebe: (1) nó de origem, (2) função de roteamento
    // que recebe o state e retorna uma string indicando o caminho, e (3) um
    // mapa traduzindo cada valor de retorno possível para o nome real do nó
    // de destino. Aqui o mapa é identidade, mas é exigido mesmo assim porque
    // o LangGraph não consegue inferir estaticamente os destinos possíveis
    // apenas olhando a função (ela é JS arbitrário) — esse mapa é o que
    // permite ao grafo montar as arestas internamente e ao LangGraph Studio
    // desenhar o diagrama, sem precisar executar a função.
    .addConditionalEdges(
      'identifyIntent',
      (state: GraphState): string => {
        if (state.error || !state.intent || state.intent === 'unknown') {
          return 'message';
        }

        console.log(`➡️  Routing based on intent: ${state.intent}`);
        return state.intent
      },
      // Este é o mapa (3º argumento) citado no comentário acima.
      {
        schedule: 'schedule',
        cancel: 'cancel',
        message: 'message',
      }
    )

    .addEdge('schedule', 'message')
    .addEdge('cancel', 'message')
    .addEdge('message', END);

  // compile() valida a estrutura do grafo (nós/arestas declarados) e retorna
  // um objeto executável (Runnable) com métodos como .invoke()/.stream(),
  // que é o que o servidor Fastify chama passando a HumanMessage do usuário.
  // Antes do compile(), workflow é só a definição do grafo — não é executável.
  return workflow.compile();
}
