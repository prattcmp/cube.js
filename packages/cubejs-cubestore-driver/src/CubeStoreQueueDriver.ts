import {
  QueueDriverInterface,
  LocalQueueDriverConnectionInterface,
  QueryStageStateResponse,
  QueryDef,
  RetrieveForProcessingResponse,
  QueueDriverOptions,
  AddToQueueQuery,
  AddToQueueOptions, QueryId,
} from '@cubejs-backend/base-driver';

import crypto from 'crypto';
import { CubeStoreDriver } from './CubeStoreDriver';

function hashQueryKey(queryKey: QueryId) {
  return crypto.createHash('md5').update(JSON.stringify(queryKey)).digest('hex');
}

class CubestoreQueueDriverConnection implements LocalQueueDriverConnectionInterface {
  public constructor(
    protected readonly driver: CubeStoreDriver,
    protected readonly options: QueueDriverOptions,
  ) {
    console.log(options);
  }

  protected getQueryKey(queryKey: QueryId): string {
    return `${this.options.redisQueuePrefix}:${hashQueryKey(queryKey)}`;
  }

  public async addToQueue(keyScore: number, queryKey: string | [string, any[]], orphanedTime: any, queryHandler: string, query: AddToQueueQuery, priority: number, options: AddToQueueOptions): Promise<unknown> {
    // TODO: Fix sqlparser, support negative number
    priority = priority < 0 ? 0 : priority;

    const data = {
      queryHandler,
      query,
      queryKey,
      stageQueryKey: options.stageQueryKey,
      priority,
      requestId: options.requestId,
      addedToQueueTime: new Date().getTime()
    };

    console.log('addToQueue ..', {
      keyScore, queryKey, orphanedTime, queryHandler, query, priority, options, data
    });

    const _rows = await this.driver.query(`QUEUE ADD PRIORITY ? ? ?`, [
      priority,
      this.getQueryKey(queryKey),
      JSON.stringify(data)
    ]);

    return [
      1,
      null,
      null,
      1,
      data.addedToQueueTime
    ];
  }

  // TODO: Looks useless, because we can do it in one step - getQueriesToCancel
  public async getQueryAndRemove(queryKey: string): Promise<[QueryDef]> {
    return this.cancelQuery(queryKey);
  }

  public async cancelQuery(queryKey: string): Promise<[QueryDef]> {
    const rows = await this.driver.query('QUEUE CANCEL ?', [
      this.getQueryKey(queryKey)
    ]);
    if (rows && rows.length) {
      return [JSON.parse(rows[0].value)];
    }

    throw new Error(`Unable to cancel query with id: "${queryKey}"`);
  }

  public async freeProcessingLock(queryKey: string, processingId: string, activated: unknown): Promise<void> {
    // nothing to do
  }

  public async getActiveQueries(): Promise<unknown> {
    const rows = await this.driver.query('select id from system.queue where status = ?', ['Active']);
    return rows.map((row) => row.id);
  }

  public async getNextProcessingId(): Promise<number | string> {
    const rows = await this.driver.query('CACHE INCR ?', [
      `${this.options.redisQueuePrefix}:PROCESSING_COUNTER`
    ]);
    if (rows && rows.length) {
      return rows[0].value;
    }

    throw new Error('Unable to get next processing id');
  }

  public async getQueryStageState(onlyKeys: boolean): Promise<QueryStageStateResponse> {
    console.log(onlyKeys);
    // throw new Error(`Unimplemented getQueryStageState, onlyKeys: ${onlyKeys}`);

    return <any>[[], [], []];
  }

  public async getResult(queryKey: string): Promise<unknown> {
    // throw new Error(`Unimplemented getResult, queryKey: ${queryKey}`);

    return null;
  }

  public async getStalledQueries(): Promise<string[]> {
    const rows = await this.driver.query('select id from from system.queue WHERE created <= DATE_SUB(NOW(), interval \'1 minute\') AND status = ?', ['Pending']);
    return rows.map((row) => row.id);
  }

  public async getOrphanedQueries(): Promise<string[]> {
    const rows = await this.driver.query('select id from from system.queue WHERE created <= DATE_SUB(NOW(), interval \'1 minute\') AND status = ?', ['Active']);
    return rows.map((row) => row.id);
  }

  public async getQueriesToCancel(): Promise<string[]> {
    // TODO: It's better to introduce single command which cancel all orhaped & stalled queries and return it back
    const rows = await this.driver.query('select id from system.queue WHERE (created <= DATE_SUB(NOW(), interval \'1 minute\') AND status = ?) OR (created <= DATE_SUB(NOW(), interval \'1 minute\') AND status = ?)', ['Pending', 'Active']);
    return rows.map((row) => row.id);
  }

  public async getQueryDef(queryKey: string): Promise<QueryDef> {
    const rows = await this.driver.query('select value from system.queue where id = ?', [this.getQueryKey(queryKey)]);
    if (rows && rows.length) {
      return JSON.parse(rows[0].value);
    }

    throw new Error(`Unable to find query def for id: "${this.getQueryKey(queryKey)}"`);
  }

  public async getToProcessQueries(): Promise<string[]> {
    const rows = await this.driver.query('select id from system.queue where status = ?', ['Pending']);
    return rows.map((row) => row.id);
  }

  public async optimisticQueryUpdate(queryKey: any, toUpdate: any, processingId: any): Promise<boolean> {
    console.log('optimisticQueryUpdate', {
      queryKey,
      toUpdate,
      processingId
    });

    //
    return true;
  }

  public async release(): Promise<void> {
    // throw new Error('Unimplemented release');
  }

  public async retrieveForProcessing(queryKey: string, _processingId: string): Promise<RetrieveForProcessingResponse> {
    const rows = await this.driver.query('QUEUE RETRIEVE CONCURRENCY ? ?', [
      this.options.concurrency,
      this.getQueryKey(queryKey),
    ]);
    if (rows && rows.length) {
      const addedCount = 1;
      const active = [this.getQueryKey(queryKey)];
      const toProcess = 0;
      const lockAcquired = true;
      const def = JSON.parse(rows[0].value);

      return [
        addedCount, null, active, toProcess, def, lockAcquired
      ];
    }

    return null;
  }

  public async getResultBlocking(queryKey: string): Promise<QueryDef | null> {
    const rows = await this.driver.query('QUEUE RESULT_BLOCKING ? ?', [
      this.options.continueWaitTimeout * 1000,
      this.getQueryKey(queryKey),
    ]);
    console.log('getResultBlocking', {
      queryKey: this.getQueryKey(queryKey),
      rows
    });

    if (rows && rows.length) {
      return JSON.parse(rows[0].value);
    }

    return null;
  }

  public async setResultAndRemoveQuery(queryKey: string, executionResult: any, processingId: any): Promise<boolean> {
    console.log('setResultAndRemoveQuery', {
      queryKey,
      executionResult
    });

    await this.driver.query('QUEUE ACK ? ? ', [
      this.getQueryKey(queryKey),
      JSON.stringify(executionResult)
    ]);

    return true;
  }

  public async updateHeartBeat(queryKey: string): Promise<void> {
    console.log('updateHeartBeat', this.getQueryKey(queryKey));

    await this.driver.query('QUEUE HEARTBEAT ?', [
      this.getQueryKey(queryKey)
    ]);
  }
}

export class CubeStoreQueueDriver implements QueueDriverInterface {
  public constructor(
    protected readonly driver: CubeStoreDriver,
    protected readonly options: QueueDriverOptions
  ) {}

  public redisHash(queryKey: QueryId) {
    return `${this.options.redisQueuePrefix}:${hashQueryKey(queryKey)}`;
  }

  public async createConnection(): Promise<CubestoreQueueDriverConnection> {
    return new CubestoreQueueDriverConnection(this.driver, this.options);
  }

  public async release(): Promise<void> {
    // nothing to release
  }
}
