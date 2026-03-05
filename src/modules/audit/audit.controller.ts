import { Controller, Get, Post, Query, Param, Body, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';
import { LogAuthEventDto } from './dto/log-auth-event.dto';
import { GetUser } from '../../utils/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { UserContext } from '../auth/auth.guard';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/audit/logs
   * Get audit logs with filtering and pagination
   */
  @Get('logs')
  getAuditLogs(
    @Query() filters: AuditLogFiltersDto,
    @GetUser() user: UserContext,
  ) {
    return this.auditService.getAuditLogs(filters, user);
  }

  /**
   * GET /api/audit/tables
   * Get distinct table names that have audit entries
   */
  @Get('tables')
  getAuditedTables(@GetUser() user: UserContext) {
    return this.auditService.getAuditedTables(user);
  }

  /**
   * GET /api/audit/users
   * Get distinct users who have performed audited actions (for filter dropdown)
   */
  @Get('users')
  getAuditUsers(@GetUser() user: UserContext) {
    return this.auditService.getAuditUsers(user);
  }

  /**
   * GET /api/audit/record/:tableName/:recordId
   * Get audit history for a specific record
   */
  @Get('record/:tableName/:recordId')
  getRecordAuditHistory(
    @Param('tableName') tableName: string,
    @Param('recordId') recordId: string,
    @GetUser() user: UserContext,
  ) {
    return this.auditService.getRecordAuditHistory(tableName, recordId, user);
  }

  /**
   * POST /api/audit/auth-event
   * Log an authentication event (login, logout, failed login)
   * Public because failed login attempts won't have a valid token
   */
  @Public()
  @Post('auth-event')
  logAuthEvent(
    @Body() dto: LogAuthEventDto,
    @Req() request: any,
  ) {
    return this.auditService.logAuthEvent(dto, request);
  }
}
