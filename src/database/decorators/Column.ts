// src/decorators/Column.ts
import 'reflect-metadata';

export interface ColumnOptions {
  name: string;
  dataType: string;
}

export function Column(options: ColumnOptions) {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata('column', options, target, propertyKey);
  };
}
