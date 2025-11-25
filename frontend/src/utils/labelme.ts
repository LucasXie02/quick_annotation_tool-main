import { nanoid } from 'nanoid';

import type {
  AnnotationGroup,
  AnnotationShape,
  LabelmeAnnotation,
  LabelmeShape,
  Point
} from '../types/annotations';
import {
  normalizeRectPoints,
  rectToPolygon,
  rotatedBoxFromAxisPoints,
  rotatedBoxToAxisPoints,
  rotatedBoxToPolygon
} from './geometry';

export const LABELME_VERSION = '5.3.1';

export function shapeToLabelme(shape: AnnotationShape): LabelmeShape {
  if (shape.metadata?.rotatedBox) {
    const bbox = rotatedBoxToAxisPoints(shape.metadata.rotatedBox);
    return {
      label: shape.label,
      group_id: shape.groupId,
      points: bbox,
      shape_type: 'rotated_box',
      flags: shape.flags ?? {},
      angle: shape.metadata.rotatedBox.angle
    };
  }
  const points: Point[] =
    shape.shapeType === 'rectangle'
      ? rectToPolygon(...normalizeRectPoints(shape.points[0], shape.points[1]))
      : shape.points;
  return {
    label: shape.label,
    group_id: shape.groupId,
    points,
    shape_type: shape.shapeType === 'rectangle' ? 'rectangle' : 'polygon',
    flags: shape.flags ?? {}
  };
}

export function labelmeToShape(shape: LabelmeShape, groupId: number): AnnotationShape {
  if (shape.shape_type === 'rotated_box' && typeof shape.angle === 'number') {
    const meta = rotatedBoxFromAxisPoints(shape.points, shape.angle);
    const polygon = rotatedBoxToPolygon(meta);
    return {
      id: nanoid(),
      label: shape.label,
      groupId,
      shapeType: 'polygon',
      points: polygon,
      flags: shape.flags ?? {},
      metadata: { rotatedBox: meta }
    };
  }
  return {
    id: nanoid(),
    label: shape.label,
    groupId,
    shapeType: shape.shape_type === 'rectangle' ? 'rectangle' : 'polygon',
    points: shape.points,
    flags: shape.flags ?? {}
  };
}

export function exportLabelme(
  shapes: AnnotationShape[],
  imageMeta: { name: string; width: number; height: number }
): LabelmeAnnotation {
  return {
    version: LABELME_VERSION,
    flags: {},
    shapes: shapes.map(shapeToLabelme),
    imagePath: imageMeta.name,
    imageWidth: imageMeta.width,
    imageHeight: imageMeta.height,
    imageData: null
  };
}

export function consumeLabelmeAnnotation(annotation: LabelmeAnnotation) {
  let maxGroupId = 0;
  annotation.shapes.forEach((shape) => {
    if (typeof shape.group_id === 'number') {
      maxGroupId = Math.max(maxGroupId, shape.group_id);
    }
  });
  let autoGroupId = maxGroupId > 0 ? maxGroupId + 1 : 1;

  const shapes = annotation.shapes.map((shape) => {
    const groupId = typeof shape.group_id === 'number' ? shape.group_id : autoGroupId++;
    maxGroupId = Math.max(maxGroupId, groupId);
    return labelmeToShape(shape, groupId);
  });

  const groups: AnnotationGroup[] = [];
  shapes.forEach((shape) => {
    if (!groups.find((group) => group.id === shape.groupId)) {
      groups.push({ id: shape.groupId, label: shape.label || `Object ${shape.groupId}` });
    }
  });

  const nextGroupId = Math.max(maxGroupId + 1, 1);
  return { shapes, groups, nextGroupId };
}
