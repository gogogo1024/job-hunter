import { db, jobs } from '@job-hunter/db';
import { extractFeaturesWithAI, useAIFeaturesForFiltering } from '@job-hunter/domain';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    console.log('🤖 AI Feature Extraction Batch Job\n');
    console.log('Checking for ANTHROPIC_API_KEY...');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('❌ ANTHROPIC_API_KEY not set.');
      console.log('   Set it with: export ANTHROPIC_API_KEY=sk-ant-xxx');
      process.exit(1);
    }
    
    console.log('✅ API key found\n');
    
    // Get all jobs that need AI analysis
    console.log('📋 Fetching jobs pending AI analysis...');
    const pendingJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.aiAnalysisStatus, 'pending'))
      .limit(5); // Process 5 jobs per run to avoid rate limits
    
    console.log(`Found ${pendingJobs.length} jobs pending analysis\n`);
    
    if (pendingJobs.length === 0) {
      console.log('✅ No jobs pending analysis');
      process.exit(0);
    }
    
    let success = 0;
    let failed = 0;
    
    for (const job of pendingJobs) {
      try {
        console.log(`🔄 Analyzing: ${job.title} @ ${job.company}...`);
        
        // Update status to processing
        await db.update(jobs)
          .set({ aiAnalysisStatus: 'processing' })
          .where(eq(jobs.id, job.id));
        
        // Extract features using AI
        const features = await extractFeaturesWithAI(job);
        
        console.log(`   → Level: ${features.inferredLevel}`);
        console.log(`   → Tech: ${features.requiredTechnologies.join(', ') || 'N/A'}`);
        console.log(`   → Company: ${features.companyType}`);
        
        // Update job with extracted features
        await db.update(jobs)
          .set({
            aiInferredLevel: features.inferredLevel,
            aiRequiredTechnologies: features.requiredTechnologies,
            aiCompanyType: features.companyType,
            aiAnalysisStatus: 'completed',
            aiAnalysisAt: new Date(),
          })
          .where(eq(jobs.id, job.id));
        
        success++;
        console.log(`✅ Complete\n`);
        
        // Rate limiting: wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        failed++;
        console.log(`❌ Error: ${error.message}\n`);
        
        // Update status to failed
        await db.update(jobs)
          .set({
            aiAnalysisStatus: 'failed',
            aiAnalysisError: error.message,
            aiAnalysisAt: new Date(),
          })
          .where(eq(jobs.id, job.id));
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Batch Job Results:');
    console.log(`  ✅ Successful: ${success}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  Total: ${success + failed}`);
    console.log('='.repeat(60));
    
    // Count remaining jobs
    const totalPending = await db
      .select()
      .from(jobs)
      .where(eq(jobs.aiAnalysisStatus, 'pending'));
    
    console.log(`\n📝 Remaining pending jobs: ${totalPending.length - success}`);
    console.log('💡 Run again to process more jobs\n');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
