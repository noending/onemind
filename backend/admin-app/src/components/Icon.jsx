import { Archive } from '@phosphor-icons/react/Archive';
import { Bell } from '@phosphor-icons/react/Bell';
import { BookBookmark } from '@phosphor-icons/react/BookBookmark';
import { BookOpenText } from '@phosphor-icons/react/BookOpenText';
import { Brain } from '@phosphor-icons/react/Brain';
import { Buildings } from '@phosphor-icons/react/Buildings';
import { CalendarDots } from '@phosphor-icons/react/CalendarDots';
import { CaretDown } from '@phosphor-icons/react/CaretDown';
import { CaretLeft } from '@phosphor-icons/react/CaretLeft';
import { CaretRight } from '@phosphor-icons/react/CaretRight';
import { Check } from '@phosphor-icons/react/Check';
import { CirclesFour } from '@phosphor-icons/react/CirclesFour';
import { ClockCounterClockwise } from '@phosphor-icons/react/ClockCounterClockwise';
import { GearSix } from '@phosphor-icons/react/GearSix';
import { Handbag } from '@phosphor-icons/react/Handbag';
import { House } from '@phosphor-icons/react/House';
import { ListChecks } from '@phosphor-icons/react/ListChecks';
import { MagnifyingGlass } from '@phosphor-icons/react/MagnifyingGlass';
import { PaperPlaneTilt } from '@phosphor-icons/react/PaperPlaneTilt';
import { Plus } from '@phosphor-icons/react/Plus';
import { Receipt } from '@phosphor-icons/react/Receipt';
import { Scroll } from '@phosphor-icons/react/Scroll';
import { SignOut } from '@phosphor-icons/react/SignOut';
import { SpinnerGap } from '@phosphor-icons/react/SpinnerGap';
import { TrendUp } from '@phosphor-icons/react/TrendUp';
import { UserCircle } from '@phosphor-icons/react/UserCircle';
import { UsersThree } from '@phosphor-icons/react/UsersThree';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import { X } from '@phosphor-icons/react/X';

const ICONS = {
  ArchiveBox: Archive,
  Bell,
  BookBookmark,
  BookOpenText,
  Brain,
  Buildings,
  CalendarDots,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CirclesFour,
  ClockCounterClockwise,
  GearSix,
  Handbag,
  House,
  ListChecks,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  Receipt,
  Scroll,
  SignOut,
  SpinnerGap,
  TrendUp,
  UserCircle,
  UsersThree,
  WarningCircle,
  X
};

export default function Icon({ name, size = 20, weight = 'regular', ...props }) {
  const Component = ICONS[name] || CirclesFour;
  return <Component size={size} weight={weight} aria-hidden="true" {...props} />;
}
