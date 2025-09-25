declare module '@pinecone-database/pinecone' {
  export class Pinecone {
    describeIndex(indexName: string) {
      throw new Error('Method not implemented.');
    }
    listIndexes() {
      throw new Error('Method not implemented.');
    }
    createIndex(arg0: {
      name: string;
      dimension: number;
      metric: string;
      spec: { serverless: { cloud: string; region: string } };
    }) {
      throw new Error('Method not implemented.');
    }
    constructor(config: { apiKey: string });
    index(name: string): any;
  }

  export type RecordMetadata = Record<string, any>;
}
