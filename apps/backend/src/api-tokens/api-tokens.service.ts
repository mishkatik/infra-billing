import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiToken as ApiTokenDto, CreatedApiToken as CreatedApiTokenDto } from '@infra/shared';
import { mapApiToken } from '@common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiTokenDto } from './dto/api-token.dto';
import { generateToken, hashToken, tokenPrefix } from './token.util';

@Injectable()
export class ApiTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ApiTokenDto[]> {
    const rows = await this.prisma.apiToken.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(mapApiToken);
  }

  /** Create a token; the raw value is returned ONCE here and only its hash is stored. */
  async create(dto: CreateApiTokenDto): Promise<CreatedApiTokenDto> {
    const token = generateToken();
    const row = await this.prisma.apiToken.create({
      data: {
        tokenName: dto.tokenName,
        tokenHash: hashToken(token),
        tokenPrefix: tokenPrefix(token),
      },
    });
    return { ...mapApiToken(row), token };
  }

  async remove(uuid: string): Promise<void> {
    const found = await this.prisma.apiToken.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    if (!found) throw new NotFoundException('API token not found');
    await this.prisma.apiToken.delete({ where: { uuid } });
  }
}
