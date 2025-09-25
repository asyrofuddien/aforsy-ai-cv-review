// services/scoring/scoring.service.ts
import { DetailedScores } from '../../types/evaluation.types';
import { IJobDescription } from '../../models/jobDescription.model';
import logger from '../../utils/logger';

export class ScoringService {
  calculateOverallCVScore(
    scores: Partial<DetailedScores>,
    scoringWeights: IJobDescription['scoringWeights']
  ): number {
    // Gunakan weights dari JobDescription
    const weights = {
      technicalSkillsMatch: scoringWeights.technicalSkillsMatch,
      experienceLevel: scoringWeights.experienceLevel,
      relevantAchievements: scoringWeights.relevantAchievements,
      culturalFit: scoringWeights.culturalFit,
      aiExperience: scoringWeights.aiExperience,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (scores[key as keyof typeof scores]) {
        totalScore += (scores[key as keyof typeof scores] as number) * weight;
        totalWeight += weight;
      }
    }

    // Normalize to 0-1 range
    return totalWeight > 0 ? totalScore / (totalWeight * 5) : 0.5;
  }

  calculateOverallProjectScore(scores: Partial<DetailedScores>): number {
    const weights = {
      correctness: 0.3,
      codeQuality: 0.25,
      resilience: 0.2,
      documentation: 0.15,
      creativity: 0.1,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (scores[key as keyof typeof scores]) {
        totalScore += (scores[key as keyof typeof scores] as number) * weight;
        totalWeight += weight;
      }
    }

    // Convert to 0-10 range
    return totalWeight > 0 ? (totalScore / totalWeight) * 2 : 5.0;
  }

  generateDetailedFeedback(scores: DetailedScores): {
    strengths: string[];
    improvements: string[];
  } {
    const strengths: string[] = [];
    const improvements: string[] = [];

    // CV-related feedback
    if (scores.technicalSkillsMatch && scores.technicalSkillsMatch >= 4) {
      strengths.push('Strong technical skills alignment with job requirements');
    } else if (scores.technicalSkillsMatch && scores.technicalSkillsMatch <= 2) {
      improvements.push(
        'Technical skills need strengthening in required areas'
      );
    }

    if (scores.experienceLevel && scores.experienceLevel >= 4) {
      strengths.push('Excellent experience level for the position');
    } else if (scores.experienceLevel && scores.experienceLevel <= 2) {
      improvements.push('Would benefit from more relevant experience');
    }

    // Project-related feedback
    if (scores.codeQuality && scores.codeQuality >= 4) {
      strengths.push('High code quality and good architectural decisions');
    } else if (scores.codeQuality && scores.codeQuality <= 2) {
      improvements.push('Code quality needs improvement');
    }

    if (scores.resilience && scores.resilience >= 4) {
      strengths.push('Excellent error handling and system resilience');
    } else if (scores.resilience && scores.resilience <= 2) {
      improvements.push('Error handling and retry mechanisms need work');
    }

    return { strengths, improvements };
  }
}

export default new ScoringService();