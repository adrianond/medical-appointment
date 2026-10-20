/**
 * Configuração do ChatAnthropic (AnthropicService), com campos universais de
 * BaseChatModelParams/AnthropicInput (nada específico de provider).
 *
 * - temperature: 0 = determinístico (sempre a resposta de maior probabilidade),
 *   em vez de variado/criativo. Faz sentido aqui porque o LLM é usado só para
 *   saída estruturada: identifyIntentNode (classificar intent + extrair campos)
 *   e messageGeneratorNode (gerar a mensagem final) — ambos querem consistência
 *   entre chamadas, não variação criativa.
 *
 * - disableStreaming: true — desliga o streaming token-a-token, forçando o
 *   LLM a retornar a resposta completa de uma vez (invoke). Faz sentido
 *   porque o agente nunca usa a resposta do LLM como texto solto: sempre via
 *   generateStructured (createAgent + providerStrategy(schema)), que precisa
 *   do JSON completo para validar contra o schema Zod — não dá para
 *   validar/parsear um schema estruturado com chunks parciais chegando aos
 *   poucos, então streaming só adicionaria complexidade sem benefício.
 *
 * - maxTokens: precisa ser alto o suficiente para respostas estruturadas
 *   (JSON com vários campos via tool-calling) completarem antes de serem
 *   truncadas — um valor baixo demais (ex.: 10) faz generateStructured
 *   retornar success: true com data: undefined (saída truncada antes do
 *   schema fechar), quebrando os nodes que dependem de result.data.
 */
export type ModelConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  disableStreaming: boolean;
};

console.assert(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY is not set in environment variables');

export const config: ModelConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-haiku-4-5',
  temperature: 0,
  disableStreaming: true,
  maxTokens: 1024,
};
