import { BaseCalloutPlugin } from '@platejs/callout';

import { CalloutElementStatic } from '@/components/shadcn/callout-node-static';

export const BaseCalloutKit = [
  BaseCalloutPlugin.withComponent(CalloutElementStatic),
];
