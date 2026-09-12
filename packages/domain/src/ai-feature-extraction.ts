import type { Job } from "@job-hunter/shared";
import { Anthropic } from "@anthropic-ai/sdk";

export interface AIExtractedFeatures {
  inferredLevel: "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "unknown";
  requiredTechnologies: string[];
  companyType: string;
}

// Use a flexible type to accept both shared Job type and database rows
type JobLike = Job | any;

// Initialize Claude client (uses ANTHROPIC_API_KEY environment variable)
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Use Claude to extract accurate features from job description
 * Returns: inferred level, required technologies, company type
 */
export async function extractFeaturesWithAI(job: JobLike): Promise<AIExtractedFeatures> {
  const client = getClient();

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
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as any).text)
      .join("");

    // Parse JSON response
    const parsed = JSON.parse(responseText);

    return {
      inferredLevel: parsed.inferredLevel || "unknown",
      requiredTechnologies: Array.isArray(parsed.requiredTechnologies) ? parsed.requiredTechnologies : [],
      companyType: parsed.companyType || "Other",
    };
  } catch (error) {
    console.error("AI extraction error:", error);
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
