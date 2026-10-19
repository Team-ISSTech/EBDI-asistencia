import { Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import {
  type CreateUserRequest,
  createUserRequestSchema,
  type ReplaceRolesRequest,
  replaceRolesRequestSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  type User,
  type UserListResponse,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { UsersService } from '../services/users.service';

@Controller('usuarios')
@RequirePermission('USUARIO_ADMINISTRAR')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext, @Req() request: RequestWithId): Promise<UserListResponse> {
    return { users: await this.users.list(auth, extractRequestContext(request)) };
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(createUserRequestSchema) body: CreateUserRequest,
    @Req() request: RequestWithId,
  ): Promise<User> {
    return this.users.create(auth, body, extractRequestContext(request));
  }

  @Post(':id/contrasena-temporal')
  resetPassword(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @ZodBody(resetPasswordRequestSchema) body: ResetPasswordRequest,
    @Req() request: RequestWithId,
  ): Promise<User> {
    return this.users.resetPassword(auth, id, body, extractRequestContext(request));
  }

  @Post(':id/baja')
  @HttpCode(204)
  retire(@CurrentAuth() auth: AuthContext, @Param('id', ParseIntPipe) id: number, @Req() request: RequestWithId): Promise<void> {
    return this.users.retire(auth, id, extractRequestContext(request));
  }

  @Patch(':id/roles')
  replaceRoles(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @ZodBody(replaceRolesRequestSchema) body: ReplaceRolesRequest,
    @Req() request: RequestWithId,
  ): Promise<User> {
    return this.users.replaceRoles(auth, id, body, extractRequestContext(request));
  }
}
