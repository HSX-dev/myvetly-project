import { PipeTransform, Injectable, ArgumentMetadata, ExecutionContext, mixin } from '@nestjs/common';

/**
 * Custom pipe to set session_id from URL parameter before validation
 * This runs BEFORE ValidationPipe, so the DTO validation will pass
 */
export function SetSessionIdFromParamPipe(paramName: string = 'id') {
  @Injectable()
  class SetSessionIdPipeMixin implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata) {
      // This pipe will be used with @Body() decorator
      // We need to access the route parameter, but pipes don't have direct access to ExecutionContext
      // So we'll set it in the controller instead using a simpler approach
      return value;
    }
  }
  return SetSessionIdPipeMixin;
}

