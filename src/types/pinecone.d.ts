declare module '@pinecone-database/pinecone' {
  export class Pinecone {
    describeIndex(_indexName: string) {
      throw new Error('Method not implemented.');
    }
    listIndexes() {
      throw new Error('Method not implemented.');
    }
    createIndex(_arg0: {
      name: string;
      dimension: number;
      metric: string;
      spec: { serverless: { cloud: string; region: string } };
    }) {
      throw new Error('Method not implemented.');
    }
    constructor(_config: { apiKey: string });
    index(_name: string): any;
  }

  export type RecordMetadata = Record<string, any>;
}
