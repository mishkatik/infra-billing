import { Module } from '@nestjs/common';
import { NetcupDeviceFlowService } from '../connectors/netcup/netcup.device-flow';
import { ProviderAccountsController } from './provider-accounts.controller';
import { ProviderAccountsService } from './provider-accounts.service';
import { ProviderCredentialsService } from './provider-credentials.service';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [ProvidersController, ProviderAccountsController],
  providers: [
    ProvidersService,
    ProviderAccountsService,
    ProviderCredentialsService,
    NetcupDeviceFlowService,
  ],
  exports: [ProvidersService, ProviderAccountsService, ProviderCredentialsService],
})
export class ProvidersModule {}
