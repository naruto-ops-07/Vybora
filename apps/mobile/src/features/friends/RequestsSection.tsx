import type { FriendRequest } from '@vybora/api';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { useCc } from '@/features/connect/ui/primitives';
import { Segmented } from '@/features/connect/ui/Segmented';
import { RequestRow } from './RequestRow';

type Tab = 'received' | 'sent';

/**
 * Pending requests in two tabs (web `RequestsSection`): Received, with Accept and
 * Decline, and Sent, with Cancel. Opens on Received unless that is empty, and moves to
 * the other tab when the one in view empties (the last request answered or cancelled).
 */
export function RequestsSection({
  incoming,
  outgoing,
  when,
  onAccept,
  onDecline,
  onCancel,
}: {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  when: (r: FriendRequest) => string | undefined;
  onAccept: (r: FriendRequest) => void;
  onDecline: (r: FriendRequest) => void;
  onCancel: (r: FriendRequest) => void;
}) {
  const cc = useCc();
  const [tab, setTab] = useState<Tab>(() =>
    incoming.length || !outgoing.length ? 'received' : 'sent',
  );
  const received = incoming.length;
  const sent = outgoing.length;
  const prev = useRef({ received, sent });
  useEffect(() => {
    const counts = { received, sent };
    const other: Tab = tab === 'received' ? 'sent' : 'received';
    if (prev.current[tab] > 0 && counts[tab] === 0 && counts[other] > 0) setTab(other);
    prev.current = counts;
  }, [received, sent, tab]);

  const list = tab === 'received' ? incoming : outgoing;
  return (
    <View>
      <Segmented
        label="Requests"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'received', label: `Received (${incoming.length})` },
          { value: 'sent', label: `Sent (${outgoing.length})` },
        ]}
      />
      <View accessibilityLabel={tab === 'received' ? 'Received requests' : 'Sent requests'}>
        {list.length === 0 && (
          <Text
            style={{
              color: cc.textMuted,
              fontSize: 14,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            {tab === 'received' ? 'No requests waiting for you.' : 'No requests sent.'}
          </Text>
        )}
        {list.map((r) =>
          tab === 'received' ? (
            <RequestRow
              key={`in-${r.userId}`}
              direction="incoming"
              request={r}
              when={when(r)}
              onAccept={onAccept}
              onDecline={onDecline}
            />
          ) : (
            <RequestRow
              key={`out-${r.userId}`}
              direction="outgoing"
              request={r}
              onCancel={onCancel}
            />
          ),
        )}
      </View>
    </View>
  );
}
