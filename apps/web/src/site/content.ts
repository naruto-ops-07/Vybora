/**
 * The public site's factual copy, kept apart from layout so the tests can pin it.
 * Every line is true to apps/web/PRODUCT.md and docs/FEATURE_STATUS.md: no counts,
 * quotes, ratings, press or audit claims.
 */

export interface Qa {
  q: string;
  a: string;
}

/** The five homepage questions (kept from the earlier landing page). */
export const HOME_FAQ: Qa[] = [
  {
    q: 'Can VYBORA read my messages?',
    a: 'No. Messages and attachments are encrypted on your device with keys that only the people in the chat hold. Our servers store and relay ciphertext. They can see who is in a conversation and when messages are sent, but not what they say.',
  },
  {
    q: 'Has the encryption been audited?',
    a: 'Not yet. VYBORA uses MLS (RFC 9420), an open IETF standard, through an open-source library. Neither VYBORA nor that library has had an independent security audit, and we won’t claim otherwise until one is published.',
  },
  {
    q: 'What happens if I lose my phone?',
    a: 'Sign in on another device and remove the lost one under Privacy & security → Linked devices. It’s cut off from new messages immediately and erases its keys the next time it opens.',
  },
  {
    q: 'Do I need a phone number?',
    a: 'No. You sign up with an email address. Adding a phone number is optional, it’s hidden by default, and VYBORA never uploads your address book.',
  },
  {
    q: 'Can I use it on a computer?',
    a: 'Yes. VYBORA works in your browser, and there is an app for iPhone and Android that isn’t in the App Store or Google Play yet. Each browser or phone is its own device with its own keys.',
  },
];

/** The full list on /faq: the five above, then more. */
export const ALL_FAQ: Qa[] = [
  ...HOME_FAQ,
  {
    q: 'How do I add a friend?',
    a: 'Type their exact username and send a request, or share your link: it opens VYBORA with your username already filled in. No phone number or contact list is involved.',
  },
  {
    q: 'Who can start a chat with me?',
    a: 'You choose in Privacy & security: everyone, or friends only. You can block someone at any time.',
  },
  {
    q: 'What do disappearing messages do?',
    a: 'Set a timer for a chat, from five minutes to a week. When it runs out, messages are removed from the devices in the chat and from the server.',
  },
  {
    q: 'What can I send?',
    a: 'Text, photos, videos, files and voice notes, up to 25 MB each, all encrypted. You can reply to a message, react to it or delete it for everyone. Voice notes play on the web and are recorded on the phone app.',
  },
  {
    q: 'Can I make voice or video calls?',
    a: 'Not yet. Calls need a media server and their own key exchange, and we haven’t built them. Message editing and group photos aren’t available yet either.',
  },
  {
    q: 'Can I change how VYBORA looks?',
    a: 'Yes. Pick Velvet, Aurora or Bloom in Settings → Appearance, each in light and dark. Every chat can also have its own theme and wallpaper, shared with the people in it.',
  },
  {
    q: 'What does each friend’s colour mean?',
    a: 'Everyone you talk to gets one of eight colours, worked out from their account so it’s the same on every device. It shows on their avatar and their name in groups, so you can tell who’s talking at a glance.',
  },
  {
    q: 'What happens when someone joins a group?',
    a: 'New members only see messages sent after they join. Admins manage members, roles and settings, and can make some settings admins-only.',
  },
  {
    q: 'Can someone tell if they’re talking to the real me?',
    a: 'Yes. Open the chat details and compare your safety number with your friend, in person or on a call elsewhere. If either of you gets new keys, VYBORA flags the change.',
  },
  {
    q: 'Is VYBORA accessible?',
    a: 'Settings → Accessibility has reduce motion, four text sizes, high contrast, always-visible message actions and switches for swipe to reply and haptics. They’re saved per device.',
  },
];

/** What the server can and can't see (kept from the earlier landing page). */
export const SERVER = {
  cannot: [
    'Message text, replies and reactions',
    'Photos, videos, files and voice notes',
    'Your private keys',
    'Notification content',
  ],
  can: [
    'Who is in a conversation',
    'When encrypted messages are sent, and their size',
    'Group names and shared chat themes',
    'Your account details and profile',
  ],
};

/** Honest limits, from docs/FEATURE_STATUS.md → Known limitations. */
export const LIMITS = [
  'The encryption hasn’t been independently audited, and neither has the open-source MLS library it uses.',
  'A new device only sees messages sent after it was added.',
  'Keys stored in a web browser are less protected than keys in a phone’s keychain.',
  'Any signed-in person can search usernames, so they can start a chat with you unless you choose friends only.',
  'Our servers see who talks to whom and when, as described above.',
];
