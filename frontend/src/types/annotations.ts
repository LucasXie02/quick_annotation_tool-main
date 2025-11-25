export type Point = [number, number];

export type ShapeType = 'rectangle' | 'polygon';

export interface RotatedBoxMeta {
  center: Point;
  width: number;
  height: number;
  angle: number; // degrees clockwise
}

export interface AnnotationShape {
  id: string;
  label: string;
  groupId: number;
  shapeType: ShapeType;
  points: Point[];
  flags: Record<string, unknown>;
  metadata?: {
    rotatedBox?: RotatedBoxMeta | null;
  };
}

export interface AnnotationGroup {
  id: number;
  label: string;
}

export type ToolType = 'select' | 'bbox' | 'polygon' | 'rotated' | 'area';

export interface ImageMeta {
  name: string;
  width: number;
  height: number;
  src: string;
}

export interface LabelmeShape {
  label: string;
  group_id: number | null;
  points: Point[];
  shape_type: string;
  flags: Record<string, unknown>;
  angle?: number;
  description?: string;
}

export interface LabelmeAnnotation {
  version: string;
  flags: Record<string, unknown>;
  shapes: LabelmeShape[];
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  imageData?: string | null;
}

export interface DatasetItem {
  id: string;
  name: string;
  imageFile: File;
  annotationFile?: File;
  relativePath?: string;
}
