import type { AnnotationShape, Point, RotatedBoxMeta } from '../types/annotations';

export const normalizeRectPoints = (start: Point, end: Point): [Point, Point] => {
  const [x1, y1] = start;
  const [x2, y2] = end;
  const topLeft: Point = [Math.min(x1, x2), Math.min(y1, y2)];
  const bottomRight: Point = [Math.max(x1, x2), Math.max(y1, y2)];
  return [topLeft, bottomRight];
};

export const rectToPolygon = (topLeft: Point, bottomRight: Point): Point[] => {
  const [x1, y1] = topLeft;
  const [x2, y2] = bottomRight;
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2]
  ];
};

export const translatePoints = (points: Point[], dx: number, dy: number): Point[] =>
  points.map(([x, y]) => [x + dx, y + dy]);

export const rotatePoint = (point: Point, center: Point, angleRad: number): Point => {
  const [x, y] = point;
  const [cx, cy] = center;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const nx = cos * (x - cx) - sin * (y - cy) + cx;
  const ny = sin * (x - cx) + cos * (y - cy) + cy;
  return [nx, ny];
};

export const rotatePolygon = (points: Point[], center: Point, angleRad: number): Point[] =>
  points.map((pt) => rotatePoint(pt, center, angleRad));

export const shapeToPolygonPoints = (shape: AnnotationShape): Point[] => {
  if (shape.shapeType === 'rectangle') {
    const [topLeft, bottomRight] = normalizeRectPoints(shape.points[0], shape.points[1]);
    return rectToPolygon(topLeft, bottomRight);
  }
  return shape.points;
};

export const getBoundingBox = (points: Point[]) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};

export const getGroupBoundingBox = (shapes: AnnotationShape[]) => {
  if (shapes.length === 0) return null;
  const allPoints = shapes.flatMap((shape) => shapeToPolygonPoints(shape));
  const box = getBoundingBox(allPoints);
  return {
    x: box.minX,
    y: box.minY,
    width: box.width,
    height: box.height,
    center: [box.minX + box.width / 2, box.minY + box.height / 2] as Point
  };
};

export const clonePoints = (points: Point[]): Point[] => points.map(([x, y]) => [x, y]);

export const polygonArea = (points: Point[]): number => {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  }
  return area / 2;
};

export const rotatedBoxToPolygon = (meta: RotatedBoxMeta): Point[] => {
  const { center, width, height, angle } = meta;
  const rad = (angle * Math.PI) / 180;
  const halfW = width / 2;
  const halfH = height / 2;
  const corners: Point[] = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH]
  ];
  return corners.map(([x, y]) => {
    const rotatedX = x * Math.cos(rad) + y * Math.sin(rad);
    const rotatedY = -x * Math.sin(rad) + y * Math.cos(rad);
    return [rotatedX + center[0], rotatedY + center[1]];
  });
};

export const polygonToRotatedBox = (points: Point[]): RotatedBoxMeta | null => {
  if (points.length !== 4) return null;
  const [p1, p2, p3, p4] = points;
  const center: Point = [
    (p1[0] + p2[0] + p3[0] + p4[0]) / 4,
    (p1[1] + p2[1] + p3[1] + p4[1]) / 4
  ];
  const vec1 = [p2[0] - p1[0], p2[1] - p1[1]];
  const vec2 = [p4[0] - p1[0], p4[1] - p1[1]];
  const width = Math.hypot(vec1[0], vec1[1]);
  const height = Math.hypot(vec2[0], vec2[1]);
  if (!width || !height) return null;
  const angleRad = Math.atan2(vec1[1], vec1[0]);
  const angleDeg = (angleRad * 180) / Math.PI;
  return {
    center,
    width,
    height,
    angle: angleDeg
  };
};

export const rotatedBoxFromAxisPoints = (points: Point[], angle: number): RotatedBoxMeta => {
  const [[x1, y1], [x2, y2]] = points;
  const center: Point = [(x1 + x2) / 2, (y1 + y2) / 2];
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { center, width, height, angle };
};

export const rotatedBoxToAxisPoints = (meta: RotatedBoxMeta): [Point, Point] => {
  const halfW = meta.width / 2;
  const halfH = meta.height / 2;
  return [
    [meta.center[0] - halfW, meta.center[1] - halfH],
    [meta.center[0] + halfW, meta.center[1] + halfH]
  ];
};

export const worldToLocal = (point: Point, meta: RotatedBoxMeta): Point => {
  const dx = point[0] - meta.center[0];
  const dy = point[1] - meta.center[1];
  const rad = (meta.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
};

export const pointInPolygon = (point: Point, polygon: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + 0.000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

export const shapeToPolygon = (shape: AnnotationShape): Point[] => {
  if (shape.metadata?.rotatedBox) {
    return rotatedBoxToPolygon(shape.metadata.rotatedBox);
  }
  if (shape.shapeType === 'rectangle') {
    const [topLeft, bottomRight] = normalizeRectPoints(shape.points[0], shape.points[1]);
    return rectToPolygon(topLeft, bottomRight);
  }
  return shape.points;
};

export const shapeContainsPoint = (shape: AnnotationShape, point: Point): boolean => {
  const polygon = shapeToPolygon(shape);
  return pointInPolygon(point, polygon);
};

export const getShapeBoundingBox = (shape: AnnotationShape) => {
  const points = shapeToPolygonPoints(shape);
  return getBoundingBox(points);
};

export const isShapeWithinRect = (
  shape: AnnotationShape,
  topLeft: Point,
  bottomRight: Point
) => {
  const bounds = getShapeBoundingBox(shape);
  return (
    bounds.minX >= topLeft[0] &&
    bounds.maxX <= bottomRight[0] &&
    bounds.minY >= topLeft[1] &&
    bounds.maxY <= bottomRight[1]
  );
};
