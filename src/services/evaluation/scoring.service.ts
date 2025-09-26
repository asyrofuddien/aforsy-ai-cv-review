// services/scoring/scoring.service.ts
import { DetailedScores } from '../../types/evaluation.types';
import { IJobDescription } from '../../models/jobDescription.model';
import logger from '../../utils/logger';

export class ScoringService {
  calculateOverallCVScore(rawMatchRate?: number): number {
    rawMatchRate = rawMatchRate ? rawMatchRate : 0;

    const percentage = rawMatchRate * 20;
    logger.info(
      `CV Score: Using LLM match rate = ${rawMatchRate}, Percentage = ${percentage.toFixed(
        1
      )}%`
    );
    return percentage;
  }

  calculateOverallProjectScore(scores: Partial<DetailedScores>): number {
    const weights = {
      correctness: 0.3,
      codeQuality: 0.25,
      resilience: 0.2,
      documentation: 0.15,
      creativity: 0.1,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (scores[key as keyof typeof scores] !== undefined) {
        const score = scores[key as keyof typeof scores] as number;
        weightedSum += score * weight;
        totalWeight += weight;
      }
    }

    // Return weighted average (1-5 scale)
    const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 3;

    logger.info(
      `Project Score: Weighted Average = ${weightedAverage.toFixed(2)}`
    );

    return weightedAverage;
  }

  generateDetailedFeedback(scores: DetailedScores): {
    strengths: string[];
    improvements: string[];
    recommendations: string[];
  } {
    const strengths: string[] = [];
    const improvements: string[] = [];
    const recommendations: string[] = [];

    // CV-related feedback
    if (scores.technicalSkillsMatch !== undefined) {
      if (scores.technicalSkillsMatch >= 4) {
        strengths.push(
          'Strong technical skills alignment with job requirements'
        );
      } else if (scores.technicalSkillsMatch === 3) {
        improvements.push('Technical skills partially match requirements');
        recommendations.push(
          'Consider gaining experience in missing technical areas'
        );
      } else if (scores.technicalSkillsMatch <= 2) {
        improvements.push(
          'Technical skills need strengthening in required areas'
        );
        recommendations.push(
          'Focus on learning core technologies mentioned in job requirements'
        );
      }
    }

    if (scores.experienceLevel !== undefined) {
      if (scores.experienceLevel >= 4) {
        strengths.push('Excellent experience level for the position');
      } else if (scores.experienceLevel === 3) {
        improvements.push('Experience level is adequate but could be stronger');
        recommendations.push(
          'Highlight more complex projects to demonstrate depth of experience'
        );
      } else if (scores.experienceLevel <= 2) {
        improvements.push('Limited relevant experience for senior position');
        recommendations.push(
          'Gain more hands-on experience with enterprise-level projects'
        );
      }
    }

    if (scores.relevantAchievements !== undefined) {
      if (scores.relevantAchievements >= 4) {
        strengths.push('Impressive track record with measurable impact');
      } else if (scores.relevantAchievements === 3) {
        improvements.push('Some achievements shown but impact unclear');
        recommendations.push(
          'Quantify achievements with specific metrics and outcomes'
        );
      } else if (scores.relevantAchievements <= 2) {
        improvements.push('Lack of clear, measurable achievements');
        recommendations.push(
          'Focus on highlighting quantifiable impact from past work'
        );
      }
    }

    if (scores.culturalFit !== undefined) {
      if (scores.culturalFit >= 4) {
        strengths.push('Excellent cultural fit with strong soft skills');
      } else if (scores.culturalFit === 3) {
        improvements.push('Soft skills adequately demonstrated');
        recommendations.push(
          'Provide more examples of leadership and collaboration'
        );
      } else if (scores.culturalFit <= 2) {
        improvements.push('Soft skills and cultural fit unclear');
        recommendations.push(
          'Emphasize teamwork, communication, and learning experiences'
        );
      }
    }

    // Project-related feedback
    if (scores.correctness !== undefined) {
      if (scores.correctness >= 4) {
        strengths.push('Project meets all functional requirements excellently');
      } else if (scores.correctness === 3) {
        improvements.push('Project partially meets requirements');
        recommendations.push(
          'Review and implement all required features completely'
        );
      } else if (scores.correctness <= 2) {
        improvements.push('Several functional requirements not met');
        recommendations.push(
          'Focus on implementing core requirements before additional features'
        );
      }
    }

    if (scores.codeQuality !== undefined) {
      if (scores.codeQuality >= 4) {
        strengths.push('High code quality with clean architecture');
      } else if (scores.codeQuality === 3) {
        improvements.push(
          'Code quality is acceptable but has room for improvement'
        );
        recommendations.push(
          'Apply design patterns and follow best practices more consistently'
        );
      } else if (scores.codeQuality <= 2) {
        improvements.push('Code quality needs significant improvement');
        recommendations.push(
          'Refactor code for better modularity and maintainability'
        );
      }
    }

    if (scores.resilience !== undefined) {
      if (scores.resilience >= 4) {
        strengths.push('Robust error handling and system resilience');
      } else if (scores.resilience === 3) {
        improvements.push('Basic error handling present');
        recommendations.push(
          'Implement comprehensive error handling and retry mechanisms'
        );
      } else if (scores.resilience <= 2) {
        improvements.push('Insufficient error handling');
        recommendations.push(
          'Add proper error handling, logging, and recovery strategies'
        );
      }
    }

    if (scores.documentation !== undefined) {
      if (scores.documentation >= 4) {
        strengths.push('Comprehensive documentation and clear instructions');
      } else if (scores.documentation === 3) {
        improvements.push('Documentation is basic');
        recommendations.push(
          'Add more detailed setup instructions and code comments'
        );
      } else if (scores.documentation <= 2) {
        improvements.push('Documentation is insufficient');
        recommendations.push(
          'Create comprehensive README with setup, usage, and architecture details'
        );
      }
    }

    if (scores.creativity !== undefined) {
      if (scores.creativity >= 4) {
        strengths.push('Demonstrates innovation beyond requirements');
      } else if (scores.creativity === 3) {
        improvements.push('Standard implementation with limited innovation');
        recommendations.push(
          'Consider adding unique features or creative solutions'
        );
      }
    }

    return { strengths, improvements, recommendations };
  }

  generateOverallSummary(
    cvMatchRate: number,
    projectScore: number,
    strengths: string[],
    improvements: string[],
    recommendations: string[]
  ): string {
    // Categorize candidate
    let category = '';
    const avgScore = (cvMatchRate / 20 + projectScore) / 2; // Convert CV% back to 1-5 scale for average

    if (avgScore >= 4.5) {
      category = 'exceptional';
    } else if (avgScore >= 3.5) {
      category = 'strong';
    } else if (avgScore >= 2.5) {
      category = 'adequate';
    } else {
      category = 'developing';
    }

    // Build summary (3-5 sentences)
    const sentences = [];

    // Opening assessment
    sentences.push(
      `The candidate shows ${category} alignment with the position requirements, ` +
        `with a CV match rate of ${cvMatchRate.toFixed(
          0
        )}% and project score of ${projectScore.toFixed(1)}/5.`
    );

    // Key strengths
    if (strengths.length > 0) {
      const topStrengths = strengths.slice(0, 2).join(' and ');
      sentences.push(`Key strengths include ${topStrengths.toLowerCase()}.`);
    }

    // Main gaps/improvements
    if (improvements.length > 0) {
      const mainGap = improvements[0];
      sentences.push(
        `The main area for improvement is that ${mainGap.toLowerCase()}.`
      );
    }

    // Top recommendation
    if (recommendations.length > 0) {
      sentences.push(`Recommendation: ${recommendations[0]}.`);
    }

    // Hiring recommendation based on scores
    if (avgScore >= 3.5) {
      sentences.push(
        `Overall, this candidate is recommended for further consideration.`
      );
    } else if (avgScore >= 2.5) {
      sentences.push(
        `This candidate may be suitable with additional development in key areas.`
      );
    } else {
      sentences.push(
        `This candidate would benefit from gaining more experience before reapplying.`
      );
    }

    return sentences.join(' ');
  }
}

export default new ScoringService();
