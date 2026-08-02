import { BaseColumnItemPlugin, BaseColumnPlugin } from '@platejs/layout';

import {
  ColumnElementStatic,
  ColumnGroupElementStatic,
} from '@/components/shadcn/column-node-static';

export const BaseColumnKit = [
  BaseColumnPlugin.withComponent(ColumnGroupElementStatic),
  BaseColumnItemPlugin.withComponent(ColumnElementStatic),
];
