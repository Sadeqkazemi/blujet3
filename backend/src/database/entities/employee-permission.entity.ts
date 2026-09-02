import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Permission } from './permission.entity';
import { User } from './user.entity';

@Index(
  'employee_permissions_employeeId_permissionId_key',
  ['employeeId', 'permissionId'],
  { unique: true },
)
@Entity('employee_permissions')
export class EmployeePermission {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'employee_permissions_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  employeeId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'employeeId',
    foreignKeyConstraintName: 'employee_permissions_employeeId_fkey',
  })
  employee!: User;

  @Column({ type: 'text' })
  permissionId!: string;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'permissionId',
    foreignKeyConstraintName: 'employee_permissions_permissionId_fkey',
  })
  permission!: Permission;

  @Column({ type: 'text', nullable: true })
  grantedById!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
