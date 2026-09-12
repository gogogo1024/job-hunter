import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

export type AIProviderType = "anthropic" | "google" | "openai";

/**
 * Factory for creating LangChain chat models
 * Supports: Claude (Anthropic), Gemini (Google), GPT (OpenAI)
 *
 * Usage:
 *   const model = createAIProvider("google");
 *   const response = await model.invoke([{ role: "user", content: "..." }]);
 */
export function createAIProvider(provider?: AIProviderType): BaseLanguageModel {
  const selectedProvider = (provider || process.env.AI_PROVIDER || "anthropic").toLowerCase() as AIProviderType;

  switch (selectedProvider) {
    case "google": {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("GOOGLE_API_KEY environment variable is not set");
      }
      return new ChatGoogleGenerativeAI({
        apiKey,
        model: process.env.GOOGLE_MODEL || "gemini-1.5-flash",
        temperature: 0,
        maxOutputTokens: 200,
      });
    }

    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY environment variable is not set");
      }
      return new ChatOpenAI({
        apiKey,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        maxTokens: 200,
      });
    }

    case "anthropic":
    default: {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is not set");
      }
      return new ChatAnthropic({
        apiKey,
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        temperature: 0,
        maxTokens: 200,
      });
    }
  }
}

/**
 * Get the currently configured AI provider
 */
export function getCurrentProvider(): string {
  return (process.env.AI_PROVIDER || "anthropic").toLowerCase();
}

/**
 * Validate that API key is set for the selected provider
 */
export function validateAIProviderConfig(): void {
  const provider = getCurrentProvider();

  const apiKeyMap: Record<AIProviderType, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };

  const apiKey = apiKeyMap[provider as AIProviderType];
  if (!apiKey) {
    throw new Error(
      `API key not found for provider '${provider}'. ` +
        `Set ${provider.toUpperCase()}_API_KEY environment variable`
    );
  }
}
