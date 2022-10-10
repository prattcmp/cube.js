import { createQueryTestCase, CubeStoreDBRunner, QueryTestAbstract } from '@cubejs-backend/testing-shared';
import { CubeStoreDriver } from '@cubejs-backend/cubestore-driver';
import { CubeStoreQuery } from '@cubejs-backend/schema-compiler';

class DriverCubestoreTest extends QueryTestAbstract<CubeStoreDriver> {
  public getQueryClass() {
    return CubeStoreQuery;
  }
}

createQueryTestCase(new DriverCubestoreTest(), {
  name: 'CubeStore',
  connectionFactory: (container: any) => new CubeStoreDriver({
    host: container.getHost(),
    port: container.getMappedPort(3030)
  }),
  DbRunnerClass: CubeStoreDBRunner,
});
