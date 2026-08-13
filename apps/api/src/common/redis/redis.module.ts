import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    RedisService,
    { provide: REDIS_CLIENT, useFactory: (r: RedisService) => r.client, inject: [RedisService] },
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
