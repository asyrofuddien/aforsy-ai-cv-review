declare module 'bull' {
  export interface Job<T = any> {
    id: string;
    data: T;
    attemptsMade: number;
  }

  export default class Queue<T = any> {
    constructor(_name: string, _url?: string);
    add(_name: string, _data: T, _opts?: any): Promise<Job<T>>;
    process(_name: string, _callback: (_job: Job<T>) => Promise<any>): void;
    on(_event: string, _callback: (..._args: any[]) => void): void;
  }
}
