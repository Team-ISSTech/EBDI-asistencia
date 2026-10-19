import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  type OpenSchoolYearRequest,
  openSchoolYearRequestSchema,
  type PurgeSchoolYearRequest,
  purgeSchoolYearRequestSchema,
  type PurgeSchoolYearResponse,
  type SchoolYearListResponse,
  type SchoolYearView,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { SchoolYearsService } from '../services/school-years.service';

/** Ciclos escolares y retención (RNF-05), a cargo del administrador central. */
@Controller('administracion/ciclos')
@RequirePermission('CICLO_ADMINISTRAR')
export class SchoolYearsController {
  constructor(private readonly years: SchoolYearsService) {}

  @Get()
  async list(): Promise<SchoolYearListResponse> {
    return { schoolYears: await this.years.list() };
  }

  /** Abre el ciclo nuevo y archiva el actual, que queda de solo lectura. */
  @Post()
  open(@CurrentAuth() auth: AuthContext, @ZodBody(openSchoolYearRequestSchema) body: OpenSchoolYearRequest, @Req() request: RequestWithId): Promise<SchoolYearView> {
    return this.years.open(auth, body, extractRequestContext(request));
  }

  /** Irreversible: vacía los datos sensibles cifrados de un ciclo archivado hace 5 años o más. */
  @Post(':id/depurar')
  @HttpCode(HttpStatus.OK)
  purge(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @ZodBody(purgeSchoolYearRequestSchema) body: PurgeSchoolYearRequest,
    @Req() request: RequestWithId,
  ): Promise<PurgeSchoolYearResponse> {
    return this.years.purge(auth, id, body, extractRequestContext(request));
  }
}
