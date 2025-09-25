declare module 'bull' {
  export default class Bull<T = any> {
    constructor(queueName: string, redisUrl: string);

    add(
      name: string,
      data: T,
      opts?: {
        attempts?: number;
        backoff?: { type: string; delay: number };
      }
    ): Promise<any>;

    on(event: string, callback: (...args: any[]) => void): void;
  }

  export interface Queue<T = any> extends Bull<T> {}
}
