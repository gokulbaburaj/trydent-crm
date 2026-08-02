import { BaseMentionPlugin } from '@platejs/mention';

import { MentionElementStatic } from '@/components/shadcn/mention-node-static';

export const BaseMentionKit = [
  BaseMentionPlugin.withComponent(MentionElementStatic),
];
