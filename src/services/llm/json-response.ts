import appLogger from '../../utils/logger';

const logger = appLogger.child({ scope: 'ai-json' });

export class AIJsonService {
protected parseJSON(text: string, defaultValue: any, strict = false): any {
    try {
      // Clean the response - remove markdown code blocks if present
      let cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Try to fix common JSON issues
      // 1. Remove trailing commas
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
      
      // 2. Try to find and extract valid JSON if embedded in text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      // 3. Attempt to parse
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch (error) {
      logger.warn('AI response could not be parsed', { strict });
      if (strict) throw new Error('AI returned malformed or truncated JSON. Please retry the review.');

      return defaultValue;
    }
  }
}
