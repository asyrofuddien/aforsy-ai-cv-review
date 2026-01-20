import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Code from '../src/models/code.model';
import Document from '../src/models/document.model';
import JobDescription from '../src/models/jobDescription.model';
import Evaluation from '../src/models/evaluation.model';
import CvMatcher from '../src/models/cvMatcher.model';
import AtsPDF from '../src/models/atsPDF.model';
import Template from '../src/models/Template.model';

dotenv.config();

const candidateNames = [
  'John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'David Wilson',
  'Jessica Miller', 'Christopher Moore', 'Ashley Taylor', 'Matthew Anderson', 'Amanda Thomas',
  'Daniel Jackson', 'Jennifer White', 'James Harris', 'Lisa Martin', 'Robert Thompson',
  'Mary Garcia', 'William Martinez', 'Elizabeth Robinson', 'Joseph Clark', 'Susan Rodriguez',
  'Thomas Lewis', 'Karen Lee', 'Charles Walker', 'Nancy Hall', 'Steven Allen',
  'Betty Young', 'Kenneth Hernandez', 'Helen King', 'Paul Wright', 'Sandra Lopez',
];

const seedFinal = async () => {
  try {
    console.log('🚀 Starting final comprehensive seed...');
    
    await mongoose.connect(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');

    // Clear all existing data
    console.log('🧹 Clearing existing data...');
    await Promise.all([
      Code.deleteMany({}),
      Document.deleteMany({}),
      JobDescription.deleteMany({}),
      Evaluation.deleteMany({}),
      CvMatcher.deleteMany({}),
      AtsPDF.deleteMany({}),
      Template.deleteMany({}),
    ]);
    console.log('✅ Cleared all existing data');

    // 1. Generate 1223 codes
    console.log('\n📝 Step 1: Generating 1223 codes...');
    const codes = [];
    for (let i = 1; i <= 1223; i++) {
      codes.push({
        code: `AFORSY-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      });
    }
    const insertedCodes = await Code.insertMany(codes);
    console.log(`✅ Inserted ${insertedCodes.length} codes`);

    // 2. Insert job descriptions
    console.log('\n💼 Step 2: Inserting job descriptions...');
    const jobDescriptions = [
      {
        slug: 'default',
        title: 'Senior Backend Engineer',
        company: 'Tech Company',
        description: 'We are looking for a Senior Backend Engineer with strong experience in Node.js and cloud technologies.',
        requirements: {
          technical: ['5+ years backend development', 'Node.js', 'TypeScript', 'MongoDB', 'AWS'],
          soft_skills: ['Communication', 'Leadership', 'Problem-solving', 'Team collaboration'],
        },
        scoringWeights: {
          technicalSkillsMatch: 0.3,
          experienceLevel: 0.25,
          relevantAchievements: 0.2,
          culturalFit: 0.15,
          aiExperience: 0.1,
        },
        isDefault: true,
      },
      {
        slug: 'fullstack-engineer',
        title: 'Full Stack Engineer',
        company: 'Tech Startup',
        description: 'Looking for a Full Stack Engineer with experience in modern web technologies.',
        requirements: {
          technical: ['3+ years full stack', 'React', 'Node.js', 'MongoDB', 'REST APIs'],
          soft_skills: ['Self-motivated', 'Team player', 'Fast learner', 'Adaptable'],
        },
        scoringWeights: {
          technicalSkillsMatch: 0.3,
          experienceLevel: 0.25,
          relevantAchievements: 0.2,
          culturalFit: 0.15,
          aiExperience: 0.1,
        },
        isDefault: false,
      },
      {
        slug: 'frontend-developer',
        title: 'Frontend Developer',
        company: 'Digital Agency',
        description: 'Seeking a creative Frontend Developer with expertise in modern JavaScript frameworks.',
        requirements: {
          technical: ['2+ years frontend', 'React/Vue.js', 'HTML5/CSS3', 'JavaScript ES6+', 'Git'],
          soft_skills: ['Creative thinking', 'Attention to detail', 'User-focused', 'Collaborative'],
        },
        scoringWeights: {
          technicalSkillsMatch: 0.35,
          experienceLevel: 0.25,
          relevantAchievements: 0.2,
          culturalFit: 0.2,
          aiExperience: 0.0,
        },
        isDefault: false,
      }
    ];
    const insertedJobs = await JobDescription.insertMany(jobDescriptions);
    console.log(`✅ Inserted ${insertedJobs.length} job descriptions`);

    // 3. Insert templates
    console.log('\n📄 Step 3: Inserting templates...');
    const templates = [
      {
        name: 'default_cv_template',
        content: `<!DOCTYPE html>
<html>
<head>
    <title>CV Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; }
        .score { font-weight: bold; color: #2c3e50; }
    </style>
</head>
<body>
    <div class="header">
        <h1>CV Analysis Report</h1>
        <p>Candidate: {{candidateName}}</p>
        <p>Date: {{date}}</p>
    </div>
    <div class="section">
        <h2>Overall Score: <span class="score">{{overallScore}}</span></h2>
        <p>{{summary}}</p>
    </div>
</body>
</html>`,
      },
      {
        name: 'job_match_template',
        content: `<!DOCTYPE html>
<html>
<head>
    <title>Job Match Analysis</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
        .match-score { font-size: 24px; font-weight: bold; color: #27ae60; }
        .recommendations { background: #ecf0f1; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>Job Match Analysis</h1>
    <div class="match-score">Match Score: {{matchScore}}%</div>
    <div class="recommendations">
        <h3>Recommendations:</h3>
        <ul>
            {{#each recommendations}}
            <li>{{this}}</li>
            {{/each}}
        </ul>
    </div>
</body>
</html>`,
      }
    ];
    const insertedTemplates = await Template.insertMany(templates);
    console.log(`✅ Inserted ${insertedTemplates.length} templates`);

    // 4. Generate 800 documents in batches
    console.log('\n📁 Step 4: Generating 800 documents in batches...');
    let totalDocuments = 0;
    const batchSize = 50; // Smaller batches to avoid timeouts
    
    for (let batch = 0; batch < 23; batch++) { // 16 batches of 50 = 800
      const documents = [];
      const startIndex = batch * batchSize;
      
      for (let i = 0; i < batchSize; i++) {
        const docIndex = startIndex + i;
        const candidateName = candidateNames[docIndex % candidateNames.length];
        
        documents.push({
          filename: `document_${docIndex + 1}.pdf`,
          originalName: `${candidateName.replace(' ', '_')}_cv.pdf`,
          mimeType: 'application/pdf',
          path: `/uploads/document_${docIndex + 1}.pdf`,
          size: Math.floor(Math.random() * 1000000) + 50000,
          content: `Sample CV content for ${candidateName}. Skills: JavaScript, React, Node.js, MongoDB.`,
          code_id: insertedCodes[docIndex]._id,
          type: docIndex % 2 === 0 ? 'cv' : 'project',
          uploadedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        });
      }
      
      const inserted = await Document.insertMany(documents);
      totalDocuments += inserted.length;
      console.log(`   Batch ${batch + 1}/16: Inserted ${inserted.length} documents (Total: ${totalDocuments})`);
    }

    // Get all documents for referencing
    const allDocuments = await Document.find({}).sort({ _id: 1 });
    console.log(`✅ Total documents: ${allDocuments.length}`);

    // 5. Generate 300 evaluations
    console.log('\n📊 Step 5: Generating 300 evaluations...');
    const evaluations = [];
    for (let i = 0; i < 300; i++) {
      const candidateName = candidateNames[i % candidateNames.length];
      const status = ['queued', 'processing', 'completed', 'failed'][Math.floor(Math.random() * 4)];
      
      evaluations.push({
        candidateName,
        cvDocumentId: allDocuments[i]._id,
        code_id: insertedCodes[i + 800]._id,
        jobDescriptionId: insertedJobs[i % insertedJobs.length]._id,
        status,
        result: status === 'completed' ? {
          cvMatchRate: Math.floor(Math.random() * 40) + 60,
          cvFeedback: `Strong candidate with relevant experience.`,
          projectScore: Math.floor(Math.random() * 30) + 70,
          projectFeedback: 'Well-structured projects.',
          overallSummary: `${candidateName} is a recommended candidate.`,
          recommendation: 'Proceed to technical interview',
          detailedScores: {
            technicalSkillsMatch: Math.floor(Math.random() * 30) + 70,
            experienceLevel: Math.floor(Math.random() * 25) + 75,
            relevantAchievements: Math.floor(Math.random() * 35) + 65,
            culturalFit: Math.floor(Math.random() * 20) + 80,
            correctness: Math.floor(Math.random() * 25) + 75,
            codeQuality: Math.floor(Math.random() * 30) + 70,
            resilience: Math.floor(Math.random() * 20) + 80,
            documentation: Math.floor(Math.random() * 40) + 60,
            creativity: Math.floor(Math.random() * 35) + 65,
          },
        } : undefined,
        error: status === 'failed' ? 'Processing error' : undefined,
      });
    }
    const insertedEvaluations = await Evaluation.insertMany(evaluations);
    console.log(`✅ Inserted ${insertedEvaluations.length} evaluations`);

    // 6. Generate 100 CV matcher records
    console.log('\n🤖 Step 6: Generating 100 CV matcher records...');
    const cvMatchers = [];
    const skills = ['JavaScript', 'Python', 'React', 'Node.js', 'MongoDB', 'AWS'];
    const companies = ['Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'Netflix'];
    
    for (let i = 0; i < 100; i++) {
      const candidateName = candidateNames[i % candidateNames.length];
      const status = ['queued', 'processing', 'completed', 'failed'][Math.floor(Math.random() * 4)];
      const primarySkills = skills.slice(0, Math.floor(Math.random() * 3) + 2);
      
      cvMatchers.push({
        cvDocumentId: allDocuments[i + 300]._id,
        code_id: insertedCodes[i + 1100]._id,
        status,
        result: status === 'completed' ? {
          user_profile: {
            name: candidateName,
            seniority: ['Junior', 'Mid-level', 'Senior'][Math.floor(Math.random() * 3)],
            primary_skills: primarySkills,
          },
          suggested_roles: ['Software Engineer', 'Full Stack Developer'],
          jobs: [{
            title: 'Senior Developer',
            company: companies[i % companies.length],
            link: `https://jobs.${companies[i % companies.length].toLowerCase()}.com/job-1`,
            skill_match: Math.floor(Math.random() * 30) + 70,
            experience_match: Math.floor(Math.random() * 25) + 75,
            responsibility_match: Math.floor(Math.random() * 35) + 65,
            job_description: `Great opportunity for ${primarySkills.join(', ')} developer.`,
            score: Math.floor(Math.random() * 30) + 70,
            grade: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
            explanation: `Strong match based on ${primarySkills[0]} skills.`,
          }],
          summary: {
            strengths: [`Strong ${primarySkills[0]} skills`, 'Good experience'],
            improvements: ['Learn more frameworks', 'Improve documentation'],
            next_steps: ['Apply to positions', 'Prepare for interviews'],
          },
        } : undefined,
        error: status === 'failed' ? 'AI processing error' : undefined,
      });
    }
    const insertedCvMatchers = await CvMatcher.insertMany(cvMatchers);
    console.log(`✅ Inserted ${insertedCvMatchers.length} CV matcher records`);

    // 7. Generate 23 ATS PDF records
    console.log('\n📄 Step 7: Generating 23 ATS PDF records...');
    const atsPDFs = [];
    for (let i = 0; i < 23; i++) {
      const candidateName = candidateNames[i % candidateNames.length];
      
      atsPDFs.push({
        code_id: insertedCodes[i + 1200]._id,
        html_file: `ATS_${candidateName.replace(' ', '_')}_report.html`,
        pdf_file: `ATS_${candidateName.replace(' ', '_')}_report.pdf`,
        html_text: `<html><body><h1>ATS Report - ${candidateName}</h1><p>Overall Score: ${Math.floor(Math.random() * 30) + 70}/100</p></body></html>`,
        file_name: `${candidateName.replace(' ', '_')}_ATS_Report`,
      });
    }
    const insertedAtsPDFs = await AtsPDF.insertMany(atsPDFs);
    console.log(`✅ Inserted ${insertedAtsPDFs.length} ATS PDF records`);

    // Final Summary
    const totalRecords = insertedCodes.length + insertedJobs.length + insertedTemplates.length + 
                        totalDocuments + insertedEvaluations.length + 
                        insertedCvMatchers.length + insertedAtsPDFs.length;
    
    console.log('\n🎉 === SEEDING COMPLETED SUCCESSFULLY ===');
    console.log(`📊 Total records created: ${totalRecords}`);
    console.log('\n📋 Final Breakdown:');
    console.log(`   ✅ Codes: ${insertedCodes.length}`);
    console.log(`   ✅ Job Descriptions: ${insertedJobs.length}`);
    console.log(`   ✅ Templates: ${insertedTemplates.length}`);
    console.log(`   ✅ Documents: ${totalDocuments}`);
    console.log(`   ✅ Evaluations: ${insertedEvaluations.length}`);
    console.log(`   ✅ CV Matchers: ${insertedCvMatchers.length}`);
    console.log(`   ✅ ATS PDFs: ${insertedAtsPDFs.length}`);

    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    console.log('🚀 All models seeded successfully with 1223 unique codes distributed across all models!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedFinal();