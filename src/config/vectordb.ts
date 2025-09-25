import { Pinecone } from '@pinecone-database/pinecone';
import config from './config';
import logger from '../utils/logger';

let pineconeClient: Pinecone | null = null;

export const initializeVectorDB = async (): Promise<void> => {
  try {
    if (!config.pinecone.apiKey) {
      logger.warn(
        '⚠️ Pinecone API key not found - using in-memory vector store'
      );
      return;
    }

    pineconeClient = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });

    // Cek index pakai describeIndex atau try-catch di index call
    try {
      await pineconeClient.describeIndex(config.pinecone.indexName);
      logger.info('✅ Pinecone index already exists');
    } catch (e) {
      logger.info('Creating Pinecone index...');
      await pineconeClient.createIndex({
        name: config.pinecone.indexName,
        dimension: 384, // text-embedding-3-small
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });
      logger.info('✅ Pinecone index created');
    }
  } catch (error) {
    logger.error('Pinecone initialization error:', error);
    logger.warn('Continuing with in-memory vector store');
  }
};

export const getPineconeClient = (): Pinecone | null => pineconeClient;
