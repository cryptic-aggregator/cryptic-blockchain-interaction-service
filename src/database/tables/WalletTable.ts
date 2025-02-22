// src/models/NotificationContentTable.ts
import { IDatabaseTable } from '../../interfaces/database/DatabaseTable';
import { Column } from '../decorators/Column';
import { Table } from '../decorators/Table';

@Table({ tableName: 'notification_content' })
export class NotificationContentTable implements IDatabaseTable {
  @Column({ name: 'id', dataType: 'integer' })
  id!: number;

  @Column({ name: 'address', dataType: 'text' })
  address!: string;
}
