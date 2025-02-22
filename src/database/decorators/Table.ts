// src/decorators/Table.ts
import 'reflect-metadata';

export interface TableOptions {
  tableName: string;
}

export function Table(options: TableOptions) {
  return function (constructor: Function) {
    Reflect.defineMetadata('table', options, constructor);
  };
}
