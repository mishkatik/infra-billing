import { Global, Module } from '@nestjs/common';
import { FaviconsService } from './favicons.service';

@Global()
@Module({
  providers: [FaviconsService],
  exports: [FaviconsService],
})
export class FaviconsModule {}
