import {
  Code2,
  Columns2,
  Heading,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  MoveVertical,
  Share2,
  Sparkles,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { BlockType } from "@/lib/email/render-campaign";

export const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
  logo: Sparkles,
  heading: Heading,
  text: Type,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
  columns: Columns2,
  social: Share2,
  html: Code2,
};

export const PALETTE_ORDER: BlockType[] = ["logo", "heading", "text", "image", "button", "columns", "divider", "spacer", "social", "html"];
