import { Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ApiEnv } from '@sirai/config';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type SessionResponse,
  type SwitchEstanciaRequest,
  switchEstanciaRequestSchema,
} from '@sirai/contracts';
import type { Response } from 'express';
import type { AuthContext } from '../../../common/auth/auth-context';
import { AllowWhilePasswordPending, Authenticated, CurrentAuth, Public } from '../../../common/auth/decorators';
import { clearSessionCookie, setSessionCookie } from '../../../common/auth/session-cookie';
import { API_ENV } from '../../../common/config/config.module';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { AuthService } from '../services/auth.service';

/** Solo traduce HTTP ↔ servicio. Sin lógica de negocio. */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @ZodBody(loginRequestSchema) body: LoginRequest,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const { token, session } = await this.auth.login(body, extractRequestContext(request));
    setSessionCookie(response, this.env, token);
    return session;
  }

  @Authenticated()
  @AllowWhilePasswordPending()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(auth, extractRequestContext(request));
    clearSessionCookie(response, this.env);
  }

  @Authenticated()
  @AllowWhilePasswordPending()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext): Promise<SessionResponse> {
    return this.auth.me(auth);
  }

  /** Cambiar la contraseña es lo único que una contraseña temporal puede hacer además de ver su sesión y salir. */
  @Authenticated()
  @AllowWhilePasswordPending()
  @Post('contrasena')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(changePasswordRequestSchema) body: ChangePasswordRequest,
    @Req() request: RequestWithId,
  ): Promise<SessionResponse> {
    return this.auth.changePassword(auth, body, extractRequestContext(request));
  }

  @Authenticated()
  @Post('estancia')
  @HttpCode(HttpStatus.OK)
  switchEstancia(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(switchEstanciaRequestSchema) body: SwitchEstanciaRequest,
    @Req() request: RequestWithId,
  ): Promise<SessionResponse> {
    return this.auth.switchEstancia(auth, body.estanciaId, extractRequestContext(request));
  }
}
