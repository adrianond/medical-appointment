import { AppointmentService } from '../../services/appointmentService.ts';
import type { GraphState } from '../graph.ts';
import { z } from 'zod/v3';

const ScheduleRequiredFieldsSchema = z.object({
  professionalId: z.number({ required_error: 'Professional ID is required' }),
  datetime: z.string({ required_error: 'Appointment datetime is required' }),
  patientName: z.string({ required_error: 'Patient name is required' }),
});

/**
 * Nó do grafo responsável por agendar uma consulta.
 * Valida os campos obrigatórios do state e chama AppointmentService.bookAppointment.
 *
 * Nunca lança exceção para fora do nó: os dois tipos de erro possíveis são
 * tratados e convertidos no mesmo formato de saída (actionSuccess: false +
 * actionError), para que o grafo sempre siga em frente até o nó `message`
 * (que decide como comunicar o erro ao usuário), independente de sucesso ou falha:
 *  1. Erro de validação (campo obrigatório ausente no state) — tratado "no
 *     caminho feliz" via safeParse, que retorna { success: false, error }
 *     em vez de lançar.
 *  2. Erro de negócio (ex.: bookAppointment lança Error por conflito de
 *     horário) — é uma exceção de verdade, por isso todo o corpo do nó fica
 *     dentro do try/catch abaixo.
 */
export function createSchedulerNode(appointmentService: AppointmentService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`📅 Scheduling appointment...`);

    try {
      // safeParse (em vez de parse) não lança exceção: sempre retorna um
      // objeto { success, data } ou { success: false, error }.
      const validation = ScheduleRequiredFieldsSchema.safeParse(state)

      if(!validation.success){
        const errorMessages = validation.error.errors.map(e => e.message).join(', ')
        console.log(`⚠️  Validation failed: ${errorMessages}`);
        return {
          actionSuccess: false,
          actionError: errorMessages,
        }
      }

      const appointment = appointmentService.bookAppointment(
        validation.data.professionalId,
        new Date(validation.data.datetime),
        validation.data.patientName,
        state.reason ?? 'general consultation'
      )

      // se quiser simular o erro de duas consultas 
      // const appointment2 = appointmentService.bookAppointment(
      //   validation.data.professionalId,
      //   new Date(validation.data.datetime),
      //   validation.data.patientName,
      //   state.reason ?? 'general consultation'
      // )

      console.log(`✅ Appointment scheduled successfully`);

      return {
        ...state,
        actionSuccess: true,
        appointmentData: appointment,
      };
    } catch (error) {
      console.log(`❌ Scheduling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        ...state,
        actionSuccess: false,
        actionError: error instanceof Error ? error.message : 'Scheduling failed',
      };
    }
  };
}
