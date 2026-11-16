import { BriefcaseIcon, Building2Icon, CalendarIcon, DoorOpenIcon, GraduationCapIcon, HandshakeIcon, HeadsetIcon, KeyRoundIcon, LockIcon, MegaphoneIcon, MessageCircleIcon, PresentationIcon, ShieldCheckIcon, StarIcon, UsersIcon, VideoIcon, type LucideIcon } from "lucide-react";
import type { RoomIconKey } from "@/lib/hall";

const ICONS: Record<RoomIconKey, LucideIcon> = {
  "door-open": DoorOpenIcon,
  lock: LockIcon,
  users: UsersIcon,
  "key-round": KeyRoundIcon,
  video: VideoIcon,
  briefcase: BriefcaseIcon,
  building: Building2Icon,
  handshake: HandshakeIcon,
  presentation: PresentationIcon,
  headset: HeadsetIcon,
  "graduation-cap": GraduationCapIcon,
  "message-circle": MessageCircleIcon,
  megaphone: MegaphoneIcon,
  calendar: CalendarIcon,
  "shield-check": ShieldCheckIcon,
  star: StarIcon,
};

/** Ícone do cartão de uma sala, pela chave gravada. */
export default function RoomIcon({ icon, className }: { icon: RoomIconKey; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} aria-hidden="true" />;
}
