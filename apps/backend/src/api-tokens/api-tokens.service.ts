import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiToken as ApiTokenDto, CreatedApiToken as CreatedApiTokenDto } from '@infra/shared';
import { mapApiToken } from '@common/mappers';
import { ApiTokensRepository } from '@repositories/api-tokens/api-tokens.repository';
import { CreateApiTokenDto } from './dto/api-token.dto';
import { generateToken, hashToken, tokenPrefix } from './token.util';

@Injectable()
export class ApiTokensService {
  constructor(private readonly tokens: ApiTokensRepository) {}

  async list(): Promise<ApiTokenDto[]> {
    const rows = await this.tokens.list();
    return rows.map(mapApiToken);
  }

  /** Create a token; the raw value is returned ONCE here and only its hash is stored. */
  async create(dto: CreateApiTokenDto): Promise<CreatedApiTokenDto> {
    const token = generateToken();
    const row = await this.tokens.create({
      tokenName: dto.tokenName,
      tokenHash: hashToken(token),
      tokenPrefix: tokenPrefix(token),
      scope: dto.scope,
    });
    return { ...mapApiToken(row), token };
  }

  async remove(uuid: string): Promise<void> {
    if (!(await this.tokens.exists(uuid))) throw new NotFoundException('API token not found');
    await this.tokens.delete(uuid);
  }
}
