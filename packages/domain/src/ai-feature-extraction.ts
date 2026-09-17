import type { Job } from "@job-hunter/types";
import { HumanMessage } from "@langchain/core/messages";
import { createAIProvider, validateAIProviderConfig, getCurrentProvider } from "./providers/ai-provider-factory.js";

export interface AIExtractedFeatures {
  inferredLevel: "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "unknown";
  requiredTechnologies: string[];
  companyType: string;
}

// Use a flexible type to accept both shared Job type and database rows
type JobLike = Job | any;

/**
 * Use LangChain to extract accurate features from job description
 * Works with any LLM provider (Claude, Gemini, GPT, etc.)
 * Returns: inferred level, required technologies, company type
 *
 * @param job - Job posting to analyze
 * @returns Extracted features
 * @throws Error if API key is not configured
 */
export async function extractFeaturesWithAI(job: JobLike): Promise<AIExtractedFeatures> {
  // Validate that API key is set
  validateAIProviderConfig();

  const model = createAIProvider();
  const provider = getCurrentProvider();

  const prompt = `Analyze this job posting and extract key information:

Job Title: ${job.title}
Company: ${job.company}
Description: ${job.descriptionText || job.description}

Please provide ONLY valid JSON output (no markdown, no code blocks) in this exact format:
{
  "inferredLevel": "senior" | "staff" | "principal" | "mid" | "junior" | "intern" | "unknown",
  "requiredTechnologies": ["tech1", "tech2"],
  "companyType": "SaaS" | "Infrastructure" | "Consulting" | "Outsourcing" | "Staffing" | "Enterprise" | "Other"
}

Rules for inference:
1. inferredLevel: Analyze job description context, not just title. Look for: "architect", "lead", "staff", "senior principal" → senior/staff/principal; "mid-level", "intermediate" → mid; "entry-level", "graduate" → junior/intern
2. requiredTechnologies: Extract ONLY technologies explicitly mentioned as required/must-have. Ignore optional/nice-to-have.
3. companyType: Classify the company based on description. Staffing firms and recruitment agencies should be marked as "Staffing" or "Outsourcing".

Return ONLY the JSON object, nothing else.`;

  try {
    const message = await model.invoke([new HumanMessage(prompt)]);

    // Extract text content from response
    const responseText = typeof message.content === "string" ? message.content : String(message.content);

    // Parse JSON response
    const parsed = JSON.parse(responseText);

    return {
      inferredLevel: parsed.inferredLevel || "unknown",
      requiredTechnologies: Array.isArray(parsed.requiredTechnologies) ? parsed.requiredTechnologies : [],
      companyType: parsed.companyType || "Other",
    };
  } catch (error) {
    console.error(`AI extraction error (provider: ${provider}):`, error);
    throw error;
  }
}

/**
 * Batch extract features for multiple jobs
 * Useful for processing all jobs in database
 */
export async function extractFeaturesForJobs(jobs: JobLike[]): Promise<Map<string, AIExtractedFeatures>> {
  const results = new Map<string, AIExtractedFeatures>();

  for (const job of jobs) {
    try {
      console.log(`Analyzing: ${job.title} @ ${job.company}...`);
      const features = await extractFeaturesWithAI(job);
      results.set(job.id, features);

      // Rate limiting: Claude API has rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to analyze ${job.id}:`, error);
      // Continue with next job on error
    }
  }

  return results;
}

/**
 * Use AI-extracted features to make more accurate filtering decisions
 */
export function useAIFeaturesForFiltering(job: JobLike, aiFeatures: AIExtractedFeatures): void {
  // Inject AI-extracted features into the job object for rule evaluation
  (job as any).aiInferredLevel = aiFeatures.inferredLevel;
  (job as any).aiRequiredTechnologies = aiFeatures.requiredTechnologies;
  (job as any).aiCompanyType = aiFeatures.companyType;
}
