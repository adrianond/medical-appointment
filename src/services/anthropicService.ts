import { ChatAnthropic } from "@langchain/anthropic";
import { config, type ModelConfig } from "../config.ts";
import { z } from 'zod/v3'
import { createAgent, HumanMessage, providerStrategy, SystemMessage } from "langchain";

export class AnthropicService {
    private config: ModelConfig
    private llmClient: ChatAnthropic

    constructor(configOverride?: ModelConfig) {
        this.config = configOverride ?? config

        this.llmClient = new ChatAnthropic({
            apiKey: this.config.apiKey,
            model: this.config.model,
            temperature: this.config.temperature,
            disableStreaming: this.config.disableStreaming,
            maxTokens: this.config.maxTokens,
        })
    }

    async generateStructured<T>(
        systemPrompt: string,
        userPrompt: string,
        schema: z.ZodSchema<T>
    ) {
        try {
            const agent = createAgent({
                model: this.llmClient,
                tools: [],
                responseFormat: providerStrategy(schema)
            })
            const messages = [
                new SystemMessage(systemPrompt),
                new HumanMessage(userPrompt)
            ]
            const data = await agent.invoke({ messages })
            return {
                success: true,
                data: data.structuredResponse,
            }
        } catch (error) {
            console.error('Error AnthropicService', error)

            return {
                success: false,
                error: error instanceof Error ?
                    error.message :
                    String(error),
            }
        }
    }
}
