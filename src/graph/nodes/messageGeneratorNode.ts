import { getSystemPrompt, getUserPromptTemplate, MessageSchema } from '../../prompts/v1/messageGenerator.ts';
import { AnthropicService } from '../../services/anthropicService.ts';
import type { GraphState } from '../graph.ts';
import { AIMessage } from 'langchain';

// Último nó do grafo (schedule|cancel -> message -> END). Responsável por transformar o
// resultado da operação (intent + actionSuccess/actionError/error acumulados no state) numa
// mensagem final em linguagem natural para o usuário.
// Monta um "cenário" (ex.: schedule_success, cancel_error, unknown_error) e chama o LLM via
// AnthropicService.generateStructured com o schema MessageSchema (só o campo `message: string`),
// usando o mesmo prompt/schema de src/prompts/v1/messageGenerator.ts.
// Sempre anexa uma AIMessage em state.messages (nunca sobrescreve o histórico), com fallback
// hardcoded quando o LLM falha (result.error) ou quando algo inesperado lança exceção.
// Nota: diferente de identifyIntentNode (que checa `!result.success`), aqui a checagem de falha
// é via `result.error` truthiness — inconsistência conhecida, não unificar sem necessidade.
export function createMessageGeneratorNode(llmClient: AnthropicService) {
    return async (state: GraphState): Promise<Partial<GraphState>> => {
        console.log(`💬 Generating response message...`);

        try {
            const hasSucceeded = state.actionSuccess ? 'success' : 'error'
            const scenario = `${state.intent ?? 'unknown'}_${hasSucceeded}`
            const details = {
                professionalName: state.professionalName,
                datetime: state.datetime,
                patientName: state.patientName,
                error: state.error,
            }

            const systemPrompt = getSystemPrompt()
            const userPrompt = getUserPromptTemplate({ scenario, details })

            const result = await llmClient.generateStructured(
                systemPrompt,
                userPrompt,
                MessageSchema,
            )
            console.log(`✅ Message generated:`, result.data?.message ?? result.data ?? result);

            // result.error cobre o caso success: false; !result.data cobre o caso
            // (raro, mas observado) de success: true com structuredResponse
            // undefined — ex.: saída truncada por maxTokens insuficiente.
            if (result.error || !result.data) {
                console.log(`⚠️  Message generation failed: ${result.error ?? 'empty structured response'}`);
                return {

                    messages: [
                        ...state.messages,
                        new AIMessage("Desculpe, errei!")
                    ],
                };
            }


            return {

                messages: [
                    ...state.messages,
                    new AIMessage(result.data!.message)
                ],
            };
        } catch (error) {
            console.error('❌ Error in messageGenerator node:', error);
            return {

                messages: [
                    ...state.messages,
                    new AIMessage('An error occurred while processing your request.')
                ],
            };
        }
    };
}
