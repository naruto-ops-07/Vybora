/**
 * One icon family for the whole app: Phosphor, "regular" weight (≈1.5px
 * stroke at 24). Icons are imported one by one because Metro does not
 * tree-shake, so the package index would bundle every icon.
 * Names are semantic (kebab-case) so screens don't depend on the icon set.
 */
import { ArchiveIcon } from 'phosphor-react-native/src/icons/Archive';
import { ArrowBendUpLeftIcon } from 'phosphor-react-native/src/icons/ArrowBendUpLeft';
import { ArrowClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowClockwise';
import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { BellSlashIcon } from 'phosphor-react-native/src/icons/BellSlash';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { ChatCircleIcon } from 'phosphor-react-native/src/icons/ChatCircle';
import { ChatsCircleIcon } from 'phosphor-react-native/src/icons/ChatsCircle';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { ChecksIcon } from 'phosphor-react-native/src/icons/Checks';
import { CircleIcon } from 'phosphor-react-native/src/icons/Circle';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { CpuIcon } from 'phosphor-react-native/src/icons/Cpu';
import { DesktopIcon } from 'phosphor-react-native/src/icons/Desktop';
import { DeviceMobileIcon } from 'phosphor-react-native/src/icons/DeviceMobile';
import { DotsThreeIcon } from 'phosphor-react-native/src/icons/DotsThree';
import { DownloadSimpleIcon } from 'phosphor-react-native/src/icons/DownloadSimple';
import { EnvelopeSimpleIcon } from 'phosphor-react-native/src/icons/EnvelopeSimple';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { FingerprintIcon } from 'phosphor-react-native/src/icons/Fingerprint';
import { FlagIcon } from 'phosphor-react-native/src/icons/Flag';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
import { HardDrivesIcon } from 'phosphor-react-native/src/icons/HardDrives';
import { ImageIcon } from 'phosphor-react-native/src/icons/Image';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { KeyIcon } from 'phosphor-react-native/src/icons/Key';
import { LinkSimpleIcon } from 'phosphor-react-native/src/icons/LinkSimple';
import { LockSimpleIcon } from 'phosphor-react-native/src/icons/LockSimple';
import { LockSimpleOpenIcon } from 'phosphor-react-native/src/icons/LockSimpleOpen';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { MusicNoteIcon } from 'phosphor-react-native/src/icons/MusicNote';
import { NotePencilIcon } from 'phosphor-react-native/src/icons/NotePencil';
import { PaperclipIcon } from 'phosphor-react-native/src/icons/Paperclip';
import { PaperPlaneRightIcon } from 'phosphor-react-native/src/icons/PaperPlaneRight';
import { PauseIcon } from 'phosphor-react-native/src/icons/Pause';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { PhoneIcon } from 'phosphor-react-native/src/icons/Phone';
import { PhoneSlashIcon } from 'phosphor-react-native/src/icons/PhoneSlash';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { ProhibitIcon } from 'phosphor-react-native/src/icons/Prohibit';
import { PushPinIcon } from 'phosphor-react-native/src/icons/PushPin';
import { ShieldCheckIcon } from 'phosphor-react-native/src/icons/ShieldCheck';
import { ShieldSlashIcon } from 'phosphor-react-native/src/icons/ShieldSlash';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { ShareNetworkIcon } from 'phosphor-react-native/src/icons/ShareNetwork';
import { SlidersHorizontalIcon } from 'phosphor-react-native/src/icons/SlidersHorizontal';
import { SmileyIcon } from 'phosphor-react-native/src/icons/Smiley';
import { StopIcon } from 'phosphor-react-native/src/icons/Stop';
import { TimerIcon } from 'phosphor-react-native/src/icons/Timer';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { UserIcon } from 'phosphor-react-native/src/icons/User';
import { UserMinusIcon } from 'phosphor-react-native/src/icons/UserMinus';
import { UserPlusIcon } from 'phosphor-react-native/src/icons/UserPlus';
import { UsersThreeIcon } from 'phosphor-react-native/src/icons/UsersThree';
import { VideoCameraIcon } from 'phosphor-react-native/src/icons/VideoCamera';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { WifiSlashIcon } from 'phosphor-react-native/src/icons/WifiSlash';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { XCircleIcon } from 'phosphor-react-native/src/icons/XCircle';
import type { IconWeight } from 'phosphor-react-native';
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';

const ICONS = {
  archive: ArchiveIcon,
  'alert-circle': WarningCircleIcon,
  'alert-triangle': WarningIcon,
  'arrow-down': ArrowDownIcon,
  'arrow-left': ArrowLeftIcon,
  bell: BellIcon,
  'bell-off': BellSlashIcon,
  check: CheckIcon,
  'check-circle': CheckCircleIcon,
  checks: ChecksIcon,
  'chevron-left': CaretLeftIcon,
  'chevron-right': CaretRightIcon,
  chats: ChatsCircleIcon,
  circle: CircleIcon,
  clock: ClockIcon,
  copy: CopyIcon,
  'corner-up-left': ArrowBendUpLeftIcon,
  cpu: CpuIcon,
  download: DownloadSimpleIcon,
  edit: NotePencilIcon,
  'edit-3': PencilSimpleIcon,
  eye: EyeIcon,
  'eye-off': EyeSlashIcon,
  'file-text': FileTextIcon,
  fingerprint: FingerprintIcon,
  flag: FlagIcon,
  'hard-drive': HardDrivesIcon,
  image: ImageIcon,
  info: InfoIcon,
  key: KeyIcon,
  link: LinkSimpleIcon,
  lock: LockSimpleIcon,
  'log-out': SignOutIcon,
  mail: EnvelopeSimpleIcon,
  'message-circle': ChatCircleIcon,
  mic: MicrophoneIcon,
  monitor: DesktopIcon,
  'more-horizontal': DotsThreeIcon,
  music: MusicNoteIcon,
  paperclip: PaperclipIcon,
  pause: PauseIcon,
  phone: PhoneIcon,
  'phone-off': PhoneSlashIcon,
  pin: PushPinIcon,
  play: PlayIcon,
  plus: PlusIcon,
  'rotate-cw': ArrowClockwiseIcon,
  search: MagnifyingGlassIcon,
  send: PaperPlaneRightIcon,
  settings: GearSixIcon,
  share: ShareNetworkIcon,
  shield: ShieldCheckIcon,
  'shield-off': ShieldSlashIcon,
  slash: ProhibitIcon,
  sliders: SlidersHorizontalIcon,
  smartphone: DeviceMobileIcon,
  smile: SmileyIcon,
  square: StopIcon,
  timer: TimerIcon,
  trash: TrashIcon,
  unlock: LockSimpleOpenIcon,
  user: UserIcon,
  'user-plus': UserPlusIcon,
  'user-x': UserMinusIcon,
  users: UsersThreeIcon,
  video: VideoCameraIcon,
  'wifi-off': WifiSlashIcon,
  x: XIcon,
  'x-circle': XCircleIcon,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color,
  weight = 'regular',
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  color?: string;
  weight?: IconWeight;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const Glyph = ICONS[name];
  const glyph = <Glyph size={size} color={color ?? t.text} weight={weight} />;
  // Decorative unless labelled. Don't use Phosphor's `title` prop: it renders an
  // SVG <title> text node, which React Native rejects outside <Text>.
  if (!accessibilityLabel) return glyph;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {glyph}
    </View>
  );
}
