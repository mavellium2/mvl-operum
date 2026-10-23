import { Module } from '@nestjs/common'
import { AuthModule } from './auth/auth.module'
import { TenantModule } from './tenant/tenant.module'
import { RedisModule } from './redis/redis.module'
import { MailerModule } from './mailer/mailer.module'
import { AdminModule } from './admin/admin.module'
import { ApiTokensModule } from './api-tokens/api-tokens.module'
import { OAuthModule } from './oauth/oauth.module'
import { HealthController } from './health/health.controller'

@Module({
  imports: [RedisModule, MailerModule, AuthModule, TenantModule, AdminModule, ApiTokensModule, OAuthModule],
  controllers: [HealthController],
})
export class AppModule {}
