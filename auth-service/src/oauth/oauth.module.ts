import { Module } from '@nestjs/common'
import { OAuthPublicController, OAuthSessionController } from './oauth.controller'
import { OAuthService } from './oauth.service'

@Module({
  controllers: [OAuthPublicController, OAuthSessionController],
  providers: [OAuthService],
})
export class OAuthModule {}
