import type { RowPreview } from '@vybora/core';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { Ticks } from './Bubble';
import { useCc } from './primitives';

/** Chat-list preview: "typing…" in the accent colour, or `You: text` with delivery ticks. */
export function RowPreviewLine({ preview, unread }: { preview: RowPreview; unread: boolean }) {
  const cc = useCc();
  if (preview.typing)
    return (
      <Text scale style={{ color: cc.accent, fontSize: 14, flex: 1 }} numberOfLines={1}>
        {preview.text}
      </Text>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
      {preview.receipt && <Ticks receipt={preview.receipt} color={cc.textSubtle} />}
      <Text
        scale
        style={{ color: unread ? cc.text : cc.textMuted, fontSize: 14, flex: 1 }}
        numberOfLines={1}
      >
        {preview.prefix ? `${preview.prefix}: ${preview.text}` : preview.text}
      </Text>
    </View>
  );
}
