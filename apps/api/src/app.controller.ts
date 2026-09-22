import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getFoundationStatus(): { name: string; status: string } {
    return {
      name: 'SIRAI API',
      status: 'foundation-ready',
    };
  }
}
