import { Module } from '@nestjs/common';
import { McpCatalog } from './mcp.catalog';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  controllers: [McpController],
  providers: [McpCatalog, McpService],
})
export class McpModule {}
