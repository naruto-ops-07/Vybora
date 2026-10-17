import { PERSON_TONES } from '@vybora/core';
import { Avatar } from '@/components/ui/Avatar';
import { useA11y } from '@/features/a11y/A11yProvider';
import { Meta } from '@/features/connect/ui';
import { cn } from '@/lib/cn';
import { toneVars } from '@/lib/tones';
import { nameOf, PEOPLE, type SamplePerson } from '../sample';

/** A person's name in their tone; high contrast uses the text colour, bold (as in bubbles). */
function ToneText({ person, className }: { person: SamplePerson; className?: string }) {
  const { highContrast } = useA11y().prefs;
  return (
    <span
      className={cn(highContrast ? 'font-bold text-ink' : 'font-semibold', className)}
      style={highContrast ? undefined : { color: toneVars(person.id).text }}
    >
      {nameOf(person)}
    </span>
  );
}

export function TonesSection() {
  const maya = PEOPLE.turquoise;
  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PERSON_TONES.map((tone) => {
          const p = PEOPLE[tone];
          return (
            <li key={tone} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <Avatar
                  path={null}
                  name={p.username}
                  userId={p.id}
                  displayName={p.display_name}
                  username={p.username}
                  size={48}
                />
                <span className="min-w-0">
                  <ToneText person={p} className="block truncate text-msg" />
                  <Meta className="block truncate">@{p.username}</Meta>
                </span>
              </div>
              <div className="mt-3 rounded-md border border-line bg-bubble-in px-3 py-2">
                <ToneText person={p} className="block text-xs" />
                <span className="text-msg-sm block text-muted">Name on bubble-in</span>
              </div>
              <Meta className="mt-3 block">{tone}</Meta>
            </li>
          );
        })}
      </ul>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="text-[13px] font-semibold text-muted">Sizes</h3>
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-4">
          {[20, 28, 34, 40, 48, 72].map((size) => (
            <figure key={size} className="flex flex-col items-center gap-2">
              <Avatar
                path={null}
                name={maya.username}
                userId={maya.id}
                displayName={maya.display_name}
                size={size}
              />
              <Meta>{size}</Meta>
            </figure>
          ))}
          <figure className="flex flex-col items-center gap-2">
            <Avatar
              path={null}
              name={PEOPLE.mint.username}
              userId={PEOPLE.mint.id}
              displayName={PEOPLE.mint.display_name}
              size={48}
            />
            <Meta>username only</Meta>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <Avatar
              path={null}
              name={PEOPLE.glacier.username}
              userId={PEOPLE.glacier.id}
              displayName={PEOPLE.glacier.display_name}
              size={48}
            />
            <Meta>one name</Meta>
          </figure>
        </div>
      </div>
    </div>
  );
}
