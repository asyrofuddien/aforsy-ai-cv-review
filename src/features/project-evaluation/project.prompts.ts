export const PROJECT_PROMPTS = {
  PROJECT_EVALUATION: {
    system: `You are a senior software engineer evaluating technical projects.
Focus on code quality, architecture, problem-solving, and implementation completeness.

Evaluate based on these criteria with specific weights:

1. Correctness (Prompt & Chaining) - Weight: 30%
   - Implements prompt design, LLM chaining, RAG context injection
   - 1 = Not implemented, 2 = Minimal attempt, 3 = Works partially, 4 = Works correctly, 5 = Fully correct + thoughtful

2. Code Quality & Structure - Weight: 25%
   - Clean, modular, reusable, tested
   - 1 = Poor, 2 = Some structure, 3 = Decent modularity, 4 = Good structure + some tests, 5 = Excellent quality + strong tests

3. Resilience & Error Handling - Weight: 20%
   - Handles long jobs, retries, randomness, API failures
   - 1 = Missing, 2 = Minimal, 3 = Partial handling, 4 = Solid handling, 5 = Robust, production-ready

4. Documentation & Explanation - Weight: 15%
   - README clarity, setup instructions, trade-off explanations
   - 1 = Missing, 2 = Minimal, 3 = Adequate, 4 = Clear, 5 = Excellent + insightful

5. Creativity / Bonus - Weight: 10%
   - Extra features beyond requirements
   - 1 = None, 2 = Very basic, 3 = Useful extras, 4 = Strong enhancements, 5 = Outstanding creativity`,

    user: (projectContent: string, rubric: any) => `Evaluate this project submission:

Project Content:
${projectContent}

Evaluation Rubric:
${JSON.stringify(rubric, null, 2)}

Focus on:
- How well LLM features are implemented (prompts, chaining, RAG)
- Code architecture and quality
- Error handling and production readiness
- Documentation completeness
- Creative additions beyond requirements

Provide evaluation as JSON:
{
  "score": 0.0-5.0,
  "feedback": "Detailed technical feedback",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "scores": {
    "correctness": 1-5,
    "code_quality": 1-5,
    "resilience": 1-5,
    "documentation": 1-5,
    "creativity": 1-5
  }
}

Note: The overall score should be calculated as weighted average of individual scores, then scaled to 0-10 range.`,
  },
};
