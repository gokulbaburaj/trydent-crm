import { BaseTocPlugin } from '@platejs/toc';

import { TocElementStatic } from '@/components/shadcn/toc-node-static';

export const BaseTocKit = [BaseTocPlugin.withComponent(TocElementStatic)];
