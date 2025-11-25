import type { AnnotationShape, Point } from '../types/annotations';

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
