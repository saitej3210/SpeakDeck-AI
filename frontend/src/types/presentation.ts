export type ObjectType =
  | 'title' | 'subtitle' | 'text' | 'bullet_list' | 'image' | 'chart'
  | 'diagram' | 'shape' | 'video' | 'audio' | 'table';

export interface ObjectStyle {
  x: number; y: number; w: number; h: number;
  rotation: number;
  fontSize: number;
  bold: boolean; italic: boolean; underline: boolean;
  color: string; align: string;
  zIndex: number;
  hidden: boolean;
  highlighted: boolean;
  deleted?: boolean;
  zoom?: number;
}

export interface SlideObject {
  id: string;
  type: ObjectType;
  content: string;
  data: Record<string, any>;
  style: ObjectStyle;
}

export interface Slide {
  id: string;
  index: number;
  layout: string;
  background: string;
  speakerNotes: string;
  transition: string;
  objects: SlideObject[];
  suggestedVisual?: string;
  qa?: string[];
}

export interface Presentation {
  id: string;
  title: string;
  theme: string;
  meta: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  slides: Slide[];
}

export interface CommandLog {
  intent: string;
  targetHint?: string;
  objectId?: string;
  message: string;
}
