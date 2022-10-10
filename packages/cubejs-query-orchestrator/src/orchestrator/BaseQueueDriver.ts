import crypto from 'crypto';
import { LocalQueueDriverConnectionInterface, QueueDriverInterface } from '@cubejs-backend/base-driver';

export abstract class BaseQueueDriver implements QueueDriverInterface {
  public redisHash(queryKey) {
    return typeof queryKey === 'string' && queryKey.length < 256 ?
      queryKey :
      crypto.createHash('md5').update(JSON.stringify(queryKey)).digest('hex');
  }

  abstract createConnection(): Promise<LocalQueueDriverConnectionInterface>;

  abstract release(connection: LocalQueueDriverConnectionInterface): Promise<void>;
}
