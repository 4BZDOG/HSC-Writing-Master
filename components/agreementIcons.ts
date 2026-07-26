import {
  Brain,
  ShieldCheck,
  PenTool,
  Eye,
  Lock,
  Scale,
  Users,
  Flag,
  Sparkles,
  Compass,
  Gauge,
  Target,
  Timer,
  Library,
  Share2,
  BarChart3,
  Wand2,
  Download,
  type LucideIcon,
} from 'lucide-react';
import type { CharterIcon } from '../data/legalContent';
import type { QuickStartIcon } from '../data/quickStartContent';

/**
 * Icon keys → lucide components.
 *
 * The content files (data/legalContent.ts, data/quickStartContent.ts) name
 * icons as strings so they stay pure data — no React imports, editable by
 * anyone, and safe to load in a plain test environment. This is the one place
 * that resolves those names.
 *
 * Adding a step with a new icon? Add the key to the union in the content file
 * and the mapping here; TypeScript will point at anything you missed.
 */
export const CHARTER_ICONS: Record<CharterIcon, LucideIcon> = {
  brain: Brain,
  shield: ShieldCheck,
  pencil: PenTool,
  eye: Eye,
  lock: Lock,
  scale: Scale,
  users: Users,
  flag: Flag,
  sparkles: Sparkles,
};

export const QUICK_START_ICONS: Record<QuickStartIcon, LucideIcon> = {
  compass: Compass,
  pen: PenTool,
  sparkles: Sparkles,
  gauge: Gauge,
  target: Target,
  timer: Timer,
  library: Library,
  share: Share2,
  chart: BarChart3,
  shield: ShieldCheck,
  wand: Wand2,
  flag: Flag,
  download: Download,
  eye: Eye,
};
