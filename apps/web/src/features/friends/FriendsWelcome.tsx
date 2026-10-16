import { AtIcon, ChatCircleIcon, ShieldCheckIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

const FACTS = [
  {
    icon: <AtIcon size={18} />,
    title: 'Exact usernames',
    body: 'Type a friend’s username to send a request. There are no suggestions or contact uploads.',
  },
  {
    icon: <ChatCircleIcon size={18} />,
    title: 'One tap to chat',
    body: 'Message any friend straight from your list. Chats stay end-to-end encrypted.',
  },
  {
    icon: <ShieldCheckIcon size={18} />,
    title: 'Friends only, if you like',
    body: (
      <>
        Limit who can start chats with you in{' '}
        <Link
          to="/settings/privacy"
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Privacy &amp; security
        </Link>
        .
      </>
    ),
  },
];

/** Content pane beside the Friends list (desktop and tablet). */
export default function FriendsWelcome() {
  return (
    <div className="hidden h-full flex-1 items-center justify-center p-10 md:flex">
      <div className="w-full max-w-md">
        <UsersThreeIcon size={28} className="text-accent" aria-hidden="true" />
        <h2 className="type-display mt-4 text-4xl">Your people</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Add people by their username. They’ll see your request next time they open VYBORA.
        </p>
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {FACTS.map((f) => (
            <li key={f.title} className="flex gap-3 py-3">
              <span className="mt-0.5 text-accent" aria-hidden="true">
                {f.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{f.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted">{f.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
