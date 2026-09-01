import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { RequirePerm } from '../auth/require-perm.decorator';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  PaginatedPaymentsDto,
  PaymentDto,
  PaymentQueryDto,
} from './dto/payment.dto';

@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.PAYMENTS.TAG)
@Controller(API.PAYMENTS)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePerm('payments:read')
  @ApiOperation({ summary: 'List payments' })
  @ApiOkResponse({ type: PaginatedPaymentsDto })
  list(@Query() query: PaymentQueryDto) {
    return this.payments.list(query);
  }

  @Post()
  @HttpCode(201)
  @RequirePerm('payments:edit')
  @ApiOperation({ summary: 'Create a payment' })
  @ApiCreatedResponse({ type: PaymentDto })
  create(@Body() dto: CreatePaymentDto) {
    return this.payments.create(dto);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @RequirePerm('payments:edit')
  @ApiOperation({ summary: 'Delete a payment' })
  @ApiNoContentResponse()
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.payments.remove(uuid);
  }
}
