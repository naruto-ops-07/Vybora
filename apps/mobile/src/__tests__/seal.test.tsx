import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SEAL_MS } from '@vybora/core';
import * as Haptics from 'expo-haptics';
import { Composer } from '@/features/connect/ui/Composer';
import { A11yProvider } from '@/lib/a11y';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: () => ({ prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
let mockStored: string | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: () => Promise.resolve(mockStored),
  setItemAsync: () => Promise.resolve(),
}));

const base = {
  accent: '#2DD4BF',
  replyTo: null,
  onCancelReply: jest.fn(),
  onAttach: jest.fn(),
  onVoice: jest.fn(),
  onTyping: jest.fn(),
};

async function setup(onSend: (t: string) => void | Promise<boolean | void>) {
  await render(
    <A11yProvider>
      <Composer {...base} onSend={onSend} />
    </A11yProvider>,
  );
  await act(async () => undefined); // prefs load
}
const type = (text: string) => fireEvent.changeText(screen.getByLabelText('Message'), text);
const playing = () => screen.queryByTestId('seal-playing', { includeHiddenElements: true });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockStored = null;
});
afterEach(() => jest.useRealTimers());

describe('sealed send (mobile)', () => {
  it('plays once the send goes out, with a light tap, then returns to the plane', async () => {
    let resolve!: (ok: boolean) => void;
    await setup(() => new Promise<boolean>((r) => (resolve = r)));
    await type('hi');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(playing()).toBeNull();
    await act(async () => resolve(true));
    expect(playing()).toBeTruthy();
    // The button stays, with its name, on the now-empty field while it plays.
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    await act(async () => jest.advanceTimersByTime(SEAL_MS.total));
    expect(playing()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('does not play when the send fails', async () => {
    await setup(() => Promise.resolve(false));
    await type('hi');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await act(async () => undefined);
    expect(playing()).toBeNull();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('is off under reduced motion (the tap still respects Haptics)', async () => {
    mockStored = JSON.stringify({ reduceMotion: 'on' });
    await setup(() => undefined);
    await type('hi');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(playing()).toBeNull();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('honours Haptics off', async () => {
    mockStored = JSON.stringify({ haptics: false });
    await setup(() => undefined);
    await type('hi');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(playing()).toBeTruthy();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});

describe('send button (mobile)', () => {
  it('is the look’s 44 px gradient circle at full strength; empty keeps the mic', async () => {
    await setup(jest.fn());
    expect(screen.getByRole('button', { name: 'Record a voice message' })).toBeTruthy();
    await type('hi');
    const send = screen.getByRole('button', { name: 'Send' });
    const style = [send.props.style].flat(3).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style).toMatchObject({ width: 44, height: 44, borderRadius: 22, opacity: 1 });
  });
});
