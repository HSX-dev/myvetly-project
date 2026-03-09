import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import cleanValue from './recursively-clean-values';

@Injectable()
export class ExcludeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((value) => {
        // Explicitly handle null and undefined to ensure proper JSON serialization
        // Use strict equality checks and explicit null return
        if (value === null || value === undefined) {
          // Return null explicitly - do not pass through cleanValue
          return null;
        }
        const cleaned = cleanValue(value);
        return cleaned;
      })
    );
  }
}

