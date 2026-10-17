import type { ReactNode } from 'react';
import { GroupAvatar } from '@/components/ui/Avatar';
import { Meta } from '@/features/connect/ui';
import { cn } from '@/lib/cn';
import { CREW, PEOPLE } from '../sample';

function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      {children}
      <Meta>{label}</Meta>
    </figure>
  );
}

export function GroupAvatarsSection() {
  const surfaces = [
    { label: 'On surface', className: 'bg-surface' },
    {
      label: 'On a selected row',
      className: 'bg-surface-strong [--avatar-ring:var(--vy-surface-strong)]',
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {surfaces.map((s) => (
        <div key={s.label} className={cn('rounded-lg border border-line p-4', s.className)}>
          <h3 className="text-[13px] font-semibold text-muted">{s.label}</h3>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-4">
            <Example label="34">
              <GroupAvatar members={CREW} size={34} />
            </Example>
            <Example label="48">
              <GroupAvatar members={CREW} size={48} />
            </Example>
            <Example label="72">
              <GroupAvatar members={CREW} size={72} />
            </Example>
            <Example label="one other">
              <GroupAvatar members={[PEOPLE.ocean]} size={48} />
            </Example>
            <Example label="nobody else">
              <GroupAvatar members={[]} size={48} />
            </Example>
          </div>
        </div>
      ))}
    </div>
  );
}
