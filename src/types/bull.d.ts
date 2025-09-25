declare module 'bull' {
  export interface Job<T = any> {
    id: string;
    data: T;
    attemptsMade: number;
  }

  export default class Queue<T = any> {
    constructor(name: string, url?: string);
    add(name: string, data: T, opts?: any): Promise<Job<T>>;
    process(name: string, callback: (job: Job<T>) => Promise<any>): void;
    on(event: string, callback: (...args: any[]) => void): void;
  }
}
