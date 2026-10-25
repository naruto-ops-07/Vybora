import { PlusIcon, XIcon } from '@phosphor-icons/react';
import { POLL_MAX_OPTIONS, validatePollDraft } from '@vybora/core';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input, Switch } from '@/components/ui/Field';

export interface PollDraft {
  question: string;
  options: string[];
  multi: boolean;
}

/** Plain words for each thing `validatePollDraft` can object to. */
const PROBLEM: Record<string, string> = {
  question_required: 'Add a question.',
  question_too_long: 'The question can be up to 300 characters.',
  too_few_options: 'Add at least two options.',
  too_many_options: `A poll can have up to ${POLL_MAX_OPTIONS} options.`,
  option_too_long: 'An option can be up to 100 characters.',
  duplicate_options: 'Two options are the same.',
};

/** Write a poll: a question, 2–12 options, and whether people may pick more than one. */
export function PollDialog({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (poll: PollDraft) => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const addedAt = useRef<number | null>(null);
  const baseId = useId();

  useEffect(() => {
    if (open) return;
    setQuestion('');
    setOptions(['', '']);
    setMulti(false);
    setProblem(null);
  }, [open]);

  // Focus follows an option just added, so a keyboard user types straight into it.
  useEffect(() => {
    if (addedAt.current === null) return;
    document.getElementById(`${baseId}-${addedAt.current}`)?.focus();
    addedAt.current = null;
  });

  const setOption = (i: number, value: string) =>
    setOptions((o) => o.map((x, n) => (n === i ? value : x)));
  const removeOption = (i: number) => setOptions((o) => o.filter((_, n) => n !== i));

  const send = () => {
    const code = validatePollDraft(question, options);
    if (code) {
      setProblem(PROBLEM[code] ?? 'Check the question and options.');
      return;
    }
    onSend({
      question: question.trim(),
      options: options.map((o) => o.trim()).filter(Boolean),
      multi,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New poll"
      description="Everyone in this chat can vote. Votes stay encrypted."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send}>Send poll</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Question"
          value={question}
          maxLength={300}
          data-autofocus
          onChange={(e) => {
            setQuestion(e.target.value);
            setProblem(null);
          }}
        />
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  id={`${baseId}-${i}`}
                  label={`Option ${i + 1}`}
                  value={o}
                  maxLength={100}
                  onChange={(e) => {
                    setOption(i, e.target.value);
                    setProblem(null);
                  }}
                />
              </div>
              {options.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-target mb-0.5 text-muted"
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() => removeOption(i)}
                >
                  <XIcon size={16} />
                </Button>
              )}
            </div>
          ))}
          {options.length < POLL_MAX_OPTIONS && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<PlusIcon size={14} />}
              onClick={() => {
                addedAt.current = options.length;
                setOptions((o) => [...o, '']);
              }}
            >
              Add option
            </Button>
          )}
        </div>
        {problem && (
          <p role="alert" className="text-[13px] text-danger">
            {problem}
          </p>
        )}
        <div className="border-t border-line">
          <Switch
            checked={multi}
            onChange={setMulti}
            label="Let people pick more than one"
            description="Off: one choice each, changeable."
          />
        </div>
      </div>
    </Dialog>
  );
}
