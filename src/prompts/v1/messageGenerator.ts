// Prompt (v1) usado por messageGeneratorNode.ts — o último nó do grafo,
// responsável por transformar o resultado da ação (schedule/cancel,
// sucesso/erro) numa mensagem final em linguagem natural para o usuário.
//
// Segue a convenção do projeto: em vez de um template de texto corrido, o
// prompt é montado como um objeto estruturado (role, guidelines, scenarios,
// instructions, examples) e enviado ao LLM via JSON.stringify — ver
// getSystemPrompt/getUserPromptTemplate abaixo. Isso é intencional (CLAUDE.md).
import { z } from 'zod';

/** Schema da saída estruturada esperada do LLM: só a mensagem final ao usuário. */
export const MessageSchema = z.object({
  message: z.string().min(10).describe('Clear, friendly message for the user')
});

export type MessageResponse = z.infer<typeof MessageSchema>;

/**
 * Prompt de sistema (fixo, sem dados da requisição): define o papel do LLM
 * (recepcionista) e lista os cenários possíveis (scenario key montada em
 * messageGeneratorNode como `${intent}_${success ? 'success' : 'error'}`,
 * ou 'unknown').
 */
export const getSystemPrompt = () => {
  return JSON.stringify({
    role: 'Friendly Medical Receptionist',
    task: 'Generate clear, professional, and empathetic messages for patients',
    tone: 'Professional yet warm, clear and concise, empathetic',
    guidelines: {
      language: 'Use simple, non-technical language',
      format: 'Clear and concise, avoid jargon',
      personalization: 'Include relevant details (names, dates, times)',
      empathy: 'Acknowledge patient emotions, especially for errors'
    },
    scenarios: {
      schedule_success: 'Confirm the appointment with all details',
      schedule_error: 'Apologize and explain why scheduling failed',
      cancel_success: 'Confirm the cancellation',
      cancel_error: 'Apologize and explain why cancellation failed',
      unknown: 'Politely explain you can only help with appointments'
    }
  });
};

/**
 * Prompt de usuário (variável por requisição): recebe `scenario` (a chave
 * montada em messageGeneratorNode) e `details` (professionalName, datetime,
 * patientName, error — os campos relevantes extraídos do state), além de
 * exemplos few-shot em português por cenário, para guiar o tom/formato da
 * resposta gerada.
 */
export const getUserPromptTemplate = (data: any) => {
  return JSON.stringify({
    scenario: data.scenario,
    details: data.details,
    instructions: [
      'Generate an appropriate message for the given scenario',
      'Include all relevant details from the details object',
      'Be clear and direct',
      'Show empathy, especially for errors',
      'For unknown intents, guide users back to scheduling/cancelling',
      'Answer in the same language as the question (preferably Portuguese)'
    ],
    examples: {
      schedule_success: 'Sua consulta com o Dr. Alicio da Silva em 12 de fevereiro de 2026 às 16h foi confirmada para Maria Santos. Aguardamos sua visita!',
      schedule_error: 'Peço desculpas, mas esse horário já está reservado. Por favor, tente outro horário ou entre em contato conosco para verificar a disponibilidade.',
      cancel_success: 'Sua consulta com o Dr. Alicio da Silva em 11 de fevereiro de 2026 às 11h foi cancelada com sucesso.',
      cancel_error: 'Não encontrei nenhuma consulta com essas informações. Por favor, verifique a data, o horário e o nome do médico.',
      unknown: 'Posso ajudá-lo(a) a agendar ou cancelar consultas médicas. Como posso ajudá-lo(a) com sua consulta hoje?'
    }
  });
};
