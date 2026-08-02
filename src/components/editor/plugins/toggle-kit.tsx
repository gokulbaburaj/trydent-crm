'use client';

import { TogglePlugin } from '@platejs/toggle/react';

import { IndentKit } from '@/components/editor/plugins/indent-kit';
import { ToggleElement } from '@/components/shadcn/toggle-node';

export const ToggleKit = [
  ...IndentKit,
  TogglePlugin.withComponent(ToggleElement),
];
