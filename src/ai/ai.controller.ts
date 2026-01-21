import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat.dto';
import { HealthhubRequestDto } from './dto/healthhub.dto';
import { SoapExpandRequestDto, SoapUndoRequestDto } from './dto/soap.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatRequestDto, @Request() req: any) {
    return this.aiService.chat(dto, req.user.sub);
  }

  @Post('healthhub')
  @HttpCode(HttpStatus.OK)
  async analyzeHealth(@Body() dto: HealthhubRequestDto, @Request() req: any) {
    return this.aiService.analyzeHealth(dto, req.user.sub);
  }

  @Post('soap-expand')
  @HttpCode(HttpStatus.OK)
  async expandSoap(@Body() dto: SoapExpandRequestDto, @Request() req: any) {
    return this.aiService.expandSoap(dto, req.user.sub);
  }

  @Post('soap-undo')
  @HttpCode(HttpStatus.OK)
  async undoSoap(@Body() dto: SoapUndoRequestDto, @Request() req: any) {
    // TODO: Implement undo functionality
    return { success: true, message: 'Undo applied' };
  }
}
