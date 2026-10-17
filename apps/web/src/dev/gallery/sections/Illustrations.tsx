import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
  WelcomeIllustration,
} from '@/components/illustrations';
import { Meta } from '@/features/connect/ui';

const ITEMS = [
  { name: 'Welcome', Art: WelcomeIllustration },
  { name: 'No chats', Art: NoChatsIllustration },
  { name: 'No friends', Art: NoFriendsIllustration },
  { name: 'Nothing found', Art: NothingFoundIllustration },
];

export function IllustrationsSection() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ITEMS.map(({ name, Art }) => (
        <li
          key={name}
          className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface p-5"
        >
          <Art />
          <Meta>{name}</Meta>
        </li>
      ))}
    </ul>
  );
}
