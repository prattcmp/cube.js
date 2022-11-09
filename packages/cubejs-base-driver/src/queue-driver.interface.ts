export type QueryDef = unknown;
export type QueryId = string | [string, any[]];

export type QueryStageStateResponse = [active: string[], toProcess: string[]] | [active: string[], toProcess: string[], defs: QueryDef];
export type RetrieveForProcessingResponse = [added: any, removed: any, active: string[], toProcess: any, def: QueryDef, lockAquired: boolean] | null;
export interface AddToQueueQuery {
  isJob: boolean,
  orphanedTimeout: unknown
}

export interface AddToQueueOptions {
  stageQueryKey: string,
  requestId: string
}

export interface QueueDriverOptions {
  redisQueuePrefix: string,
  concurrency: number,
  continueWaitTimeout: number,
}

export interface LocalQueueDriverConnectionInterface {
  redisHash(queryKey: QueryId): string;
  getResultBlocking(queryKey: string): Promise<unknown>;
  getResult(queryKey: string): Promise<any>;
  addToQueue(keyScore: number, queryKey: QueryId, orphanedTime: any, queryHandler: any, query: any, priority: any, options: any): Promise<unknown>;
  // Return query keys which was sorted by priority and time
  getToProcessQueries(): Promise<string[]>;
  getActiveQueries(): Promise<string[]>;
  getQueryDef(queryKey: string): Promise<QueryDef>;
  // Queries which was added to queue, but was not processed and not needed
  getOrphanedQueries(): Promise<string[]>;
  // Queries which was not completed with old heartbeat
  getStalledQueries(): Promise<string[]>;
  getQueryStageState(onlyKeys: boolean): Promise<QueryStageStateResponse>;
  updateHeartBeat(queryKey: string): Promise<void>;
  getNextProcessingId(): Promise<string | number>;
  // Trying to acquire a lock for processing a queue item, this method can return null when
  // multiple nodes tries to process the same query
  retrieveForProcessing(queryKey: string, processingId: number | string): Promise<RetrieveForProcessingResponse>;
  freeProcessingLock(queryKe: string, processingId: string | number, activated: unknown): Promise<void>;
  optimisticQueryUpdate(queryKey, toUpdate, processingId): Promise<boolean>;
  cancelQuery(queryKey: string): Promise<[QueryDef]>;
  getQueryAndRemove(queryKey: string): Promise<[QueryDef]>;
  setResultAndRemoveQuery(queryKey: string, executionResult: any, processingId: any): Promise<unknown>;
  release(): void;
  //
  getQueriesToCancel(): Promise<string[]>
}

export interface QueueDriverInterface {
  redisHash(queryKey: QueryId): string;
  createConnection(): Promise<LocalQueueDriverConnectionInterface>;
  release(connection: LocalQueueDriverConnectionInterface): void;
}
