'use client';
// The only module that imports the icon library, so a family swap is a one-file change.
// Implements: T-UI-01, ADR-022 section 10, ADR-022 section 9 (rule 6).
// Icons are decorative: the word beside an icon carries the meaning (NFR-ACC-001).
// Per-icon subpaths: the package root's type declarations do not resolve under NodeNext, and
// these imports also keep the bundle to the glyphs we use.
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretLeft } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight';
import { Buildings } from '@phosphor-icons/react/dist/csr/Buildings';
import { DotsThree } from '@phosphor-icons/react/dist/csr/DotsThree';
import { House } from '@phosphor-icons/react/dist/csr/House';
import { SignOut } from '@phosphor-icons/react/dist/csr/SignOut';
import { User } from '@phosphor-icons/react/dist/csr/User';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { Circle } from '@phosphor-icons/react/dist/csr/Circle';
import { Eye } from '@phosphor-icons/react/dist/csr/Eye';
import { Hourglass } from '@phosphor-icons/react/dist/csr/Hourglass';
import { Info } from '@phosphor-icons/react/dist/csr/Info';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { SpinnerGap } from '@phosphor-icons/react/dist/csr/SpinnerGap';
import { Warning } from '@phosphor-icons/react/dist/csr/Warning';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { XCircle } from '@phosphor-icons/react/dist/csr/XCircle';
// Public site glyphs (EP-31, T-WEB-02): departments, contact, booking and footer links.
import { Ambulance } from '@phosphor-icons/react/dist/csr/Ambulance';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { Baby } from '@phosphor-icons/react/dist/csr/Baby';
import { Bed } from '@phosphor-icons/react/dist/csr/Bed';
import { Bone } from '@phosphor-icons/react/dist/csr/Bone';
import { Brain } from '@phosphor-icons/react/dist/csr/Brain';
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { Certificate } from '@phosphor-icons/react/dist/csr/Certificate';
import { Clock } from '@phosphor-icons/react/dist/csr/Clock';
import { Drop } from '@phosphor-icons/react/dist/csr/Drop';
import { Ear } from '@phosphor-icons/react/dist/csr/Ear';
import { Envelope } from '@phosphor-icons/react/dist/csr/Envelope';
import { FileText } from '@phosphor-icons/react/dist/csr/FileText';
import { FirstAid } from '@phosphor-icons/react/dist/csr/FirstAid';
import { Flask } from '@phosphor-icons/react/dist/csr/Flask';
import { HandHeart } from '@phosphor-icons/react/dist/csr/HandHeart';
import { Heartbeat } from '@phosphor-icons/react/dist/csr/Heartbeat';
import { Hospital } from '@phosphor-icons/react/dist/csr/Hospital';
import { List } from '@phosphor-icons/react/dist/csr/List';
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin';
import { Microscope } from '@phosphor-icons/react/dist/csr/Microscope';
import { Newspaper } from '@phosphor-icons/react/dist/csr/Newspaper';
import { Package } from '@phosphor-icons/react/dist/csr/Package';
import { Phone } from '@phosphor-icons/react/dist/csr/Phone';
import { Pill } from '@phosphor-icons/react/dist/csr/Pill';
import { Question } from '@phosphor-icons/react/dist/csr/Question';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { Siren } from '@phosphor-icons/react/dist/csr/Siren';
import { Stethoscope } from '@phosphor-icons/react/dist/csr/Stethoscope';
import { Syringe } from '@phosphor-icons/react/dist/csr/Syringe';
import { TestTube } from '@phosphor-icons/react/dist/csr/TestTube';
import { Tooth } from '@phosphor-icons/react/dist/csr/Tooth';
import { Users } from '@phosphor-icons/react/dist/csr/Users';
import { VideoCamera } from '@phosphor-icons/react/dist/csr/VideoCamera';
import { Wheelchair } from '@phosphor-icons/react/dist/csr/Wheelchair';
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { Briefcase } from '@phosphor-icons/react/dist/csr/Briefcase';
import { CaretUp } from '@phosphor-icons/react/dist/csr/CaretUp';
import { FacebookLogo } from '@phosphor-icons/react/dist/csr/FacebookLogo';
import { Funnel } from '@phosphor-icons/react/dist/csr/Funnel';
import { GenderFemale } from '@phosphor-icons/react/dist/csr/GenderFemale';
import { Globe } from '@phosphor-icons/react/dist/csr/Globe';
import { Heart } from '@phosphor-icons/react/dist/csr/Heart';
import { InstagramLogo } from '@phosphor-icons/react/dist/csr/InstagramLogo';
import { LinkedinLogo } from '@phosphor-icons/react/dist/csr/LinkedinLogo';
import { Minus } from '@phosphor-icons/react/dist/csr/Minus';
import { Person } from '@phosphor-icons/react/dist/csr/Person';
import { Plus } from '@phosphor-icons/react/dist/csr/Plus';
import { Translate } from '@phosphor-icons/react/dist/csr/Translate';
import { WhatsappLogo } from '@phosphor-icons/react/dist/csr/WhatsappLogo';
import { YoutubeLogo } from '@phosphor-icons/react/dist/csr/YoutubeLogo';
// Share button (T-WEB-15, C-085).
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork';
import { Trash } from '@phosphor-icons/react/dist/csr/Trash';
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple';

import type { IconName } from './icon-names.js';

export type { IconName } from './icon-names.js';

const ICONS = {
  check: Check,
  'caret-down': CaretDown,
  'caret-left': CaretLeft,
  'caret-right': CaretRight,
  hospital: Buildings,
  home: House,
  more: DotsThree,
  'sign-out': SignOut,
  user: User,
  close: X,
  search: MagnifyingGlass,
  info: Info,
  warning: Warning,
  spinner: SpinnerGap,
  'status-idle': Circle,
  'status-active': Hourglass,
  'status-review': Eye,
  'status-attention': Warning,
  'status-done': CheckCircle,
  'status-problem': XCircle,
  ambulance: Ambulance,
  'arrow-right': ArrowRight,
  baby: Baby,
  bed: Bed,
  bone: Bone,
  brain: Brain,
  calendar: CalendarBlank,
  certificate: Certificate,
  clock: Clock,
  drop: Drop,
  ear: Ear,
  envelope: Envelope,
  eye: Eye,
  'file-text': FileText,
  'first-aid': FirstAid,
  flask: Flask,
  'hand-heart': HandHeart,
  heartbeat: Heartbeat,
  'hospital-building': Hospital,
  menu: List,
  'map-pin': MapPin,
  microscope: Microscope,
  newspaper: Newspaper,
  package: Package,
  phone: Phone,
  pill: Pill,
  question: Question,
  'shield-check': ShieldCheck,
  siren: Siren,
  stethoscope: Stethoscope,
  syringe: Syringe,
  'test-tube': TestTube,
  tooth: Tooth,
  users: Users,
  video: VideoCamera,
  wheelchair: Wheelchair,
  'arrow-left': ArrowLeft,
  'arrow-up-right': ArrowUpRight,
  briefcase: Briefcase,
  'caret-up': CaretUp,
  facebook: FacebookLogo,
  filter: Funnel,
  'gender-female': GenderFemale,
  globe: Globe,
  heart: Heart,
  instagram: InstagramLogo,
  linkedin: LinkedinLogo,
  minus: Minus,
  person: Person,
  plus: Plus,
  translate: Translate,
  whatsapp: WhatsappLogo,
  youtube: YoutubeLogo,
  share: ShareNetwork,
  trash: Trash,
  pencil: PencilSimple,
} satisfies Record<IconName, unknown>;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph size={size} weight="regular" aria-hidden="true" className={className} />;
}
