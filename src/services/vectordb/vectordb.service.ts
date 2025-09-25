import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';
import openaiService from '../llm/openai.service';
import { getPineconeClient } from '../../config/vectordb';
import config from '../../config/config';
import logger from '../../utils/logger';

interface VectorDocument {
  id: string;
  text: string;
  metadata: {
    type: 'job_description' | 'scoring_rubric';
    section?: string;
    [key: string]: any;
  };
}

class VectorDBService {
  private inMemoryStore: Map<
    string,
    {
      embedding: number[];
      metadata: RecordMetadata;
      text: string;
    }
  > = new Map();

  async upsertDocuments(documents: VectorDocument[]): Promise<void> {
    try {
      logger.info(`📊 VectorDB: Upserting ${documents.length} documents`);

      const vectors = await Promise.all(
        documents.map(async (doc) => {
          const embedding = await openaiService.generateEmbedding(doc.text);
          return {
            id: doc.id,
            values: embedding,
            metadata: {
              ...doc.metadata,
              text: doc.text,
            },
          };
        })
      );

      const pinecone = getPineconeClient();

      if (pinecone) {
        const index = pinecone.index(config.pinecone.indexName);
        await index.upsert(vectors);
        logger.info('✅ VectorDB: Documents upserted to Pinecone');
      } else {
        // Use in-memory store
        vectors.forEach((vector) => {
          this.inMemoryStore.set(vector.id, {
            embedding: vector.values,
            metadata: vector.metadata,
            text: vector.metadata.text as string,
          });
        });
        logger.info('✅ VectorDB: Documents stored in memory');
      }
    } catch (error) {
      logger.error('VectorDB upsert error:', error);
      throw error;
    }
  }

  async search(query: string, topK: number = 3, filter?: any): Promise<any[]> {
    try {
      logger.info(
        '🔍 VectorDB: Searching for:',
        query.substring(0, 50) + '...'
      );

      const queryEmbedding = await openaiService.generateEmbedding(query);
      const pinecone = getPineconeClient();

      if (pinecone) {
        const index = pinecone.index(config.pinecone.indexName);
        const results = await index.query({
          vector: queryEmbedding,
          topK,
          filter,
          includeMetadata: true,
        });

        return results.matches || [];
      } else {
        // In-memory search using cosine similarity
        const results = Array.from(this.inMemoryStore.entries())
          .map(([id, data]) => ({
            id,
            score: this.cosineSimilarity(queryEmbedding, data.embedding),
            metadata: data.metadata,
            text: data.text,
          }))
          .filter(
            (result) => !filter || this.matchesFilter(result.metadata, filter)
          )
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        logger.info(`✅ VectorDB: Found ${results.length} results`);
        return results;
      }
    } catch (error) {
      logger.error('VectorDB search error:', error);
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private matchesFilter(metadata: any, filter: any): boolean {
    for (const key in filter) {
      if (metadata[key] !== filter[key]) {
        return false;
      }
    }
    return true;
  }
}

export default new VectorDBService();
