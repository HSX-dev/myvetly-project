import { PipeTransform, Injectable } from '@nestjs/common';
import { cleanObject } from '../func.ref';

@Injectable()
export class CleanDtoPipe implements PipeTransform {
  transform(value: any): any {
    return cleanObject(value);
  }
}

