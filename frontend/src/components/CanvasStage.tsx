import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Line, Image as KonvaImage, Circle, Transformer, Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import useImage from '../hooks/useImage';

import type {
  AnnotationShape,
  ImageMeta,
  Point,
  ToolType,
  ShapeType,
  RotatedBoxMeta
} from '../types/annotations';
import {
  normalizeRectPoints,
  rectToPolygon,
  translatePoints,
  getGroupBoundingBox,
  clonePoints,
  rotatePolygon,
  rotatedBoxToPolygon,
  rotatePoint,
  shapeContainsPoint,
  shapeToPolygon,
  polygonArea,
  worldToLocal
} from '../utils/geometry';

const HANDLE_OFFSET = 10;
const MIN_ROTATED_BOX_SIZE = 4;

interface CanvasStageProps {
  image: ImageMeta | null;
  shapes: AnnotationShape[];
  tool: ToolType;
  onCreateShape: (shape: {
    shapeType: ShapeType;
    points: Point[];
    metadata?: AnnotationShape['metadata'];
  }) => void;
  onUpdateShapePoints: (shapeId: string, points: Point[], metadata?: AnnotationShape['metadata']) => void;
  onBatchUpdateShapePoints: (
    updates: Array<{ shapeId: string; points: Point[]; metadata?: AnnotationShape['metadata'] }>
  ) => void;
  selectedShapeId: string | null;
  selectedGroupId: number | null;
  onSelectShape(id: string | null, groupId?: number): void;
  onAreaSelect(topLeft: Point, bottomRight: Point): void;
  viewResetTrigger: number;
  onGroupTransformComplete?: (groupId: number, mode: 'translate' | 'rotate') => void;
  selectionLocked: boolean;
}

interface DraftRect {
  start: Point;
  current: Point;
  tool: 'bbox' | 'rotated' | 'area';
}

export function CanvasStage({
  image,
  shapes,
  tool,
  onCreateShape,
  onUpdateShapePoints,
  onBatchUpdateShapePoints,
  selectedShapeId,
  selectedGroupId,
  onSelectShape,
  onAreaSelect,
  viewResetTrigger,
  onGroupTransformComplete,
  selectionLocked
}: CanvasStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Record<string, Konva.Node | null>>({});
  const selectionCycleRef = useRef<{
    stack: string[];
    pointer: Point;
    index: number;
  } | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [stageDragLocked, setStageDragLocked] = useState(false);
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<Point[]>([]);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const groupTransformRef = useRef<
    | {
        mode: 'translate';
        groupId: number;
        startPointer: Point;
        initialShapes: Record<string, { points: Point[]; shapeType: ShapeType; metadata?: AnnotationShape['metadata'] }>;
      }
    | {
        mode: 'rotate';
        groupId: number;
        center: Point;
        startAngle: number;
        initialShapes: Record<string, { points: Point[]; shapeType: ShapeType; metadata?: AnnotationShape['metadata'] }>;
      }
    | null
  >(null);
  const handleResizeRef = useRef<{
    shapeId: string;
    direction: 'left' | 'right' | 'top' | 'bottom';
    baseMeta: RotatedBoxMeta;
  } | null>(null);
  const [imageElement] = useImage(image?.src ?? '');

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const selectedShape = shapes.find((shape) => shape.id === selectedShapeId);
    const node = selectedShapeId ? shapeRefs.current[selectedShapeId] : null;
    if (selectedShape && node) {
      transformer.nodes([node]);
      transformer.rotateEnabled(tool === 'select');
      if (selectedShape.shapeType === 'polygon') {
        transformer.enabledAnchors([]);
      } else {
        transformer.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
      }
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [selectedShapeId, shapes, tool]);

  const isDrawing = draftRect !== null || polygonDraft.length > 0;
const selectedGroupShapes = useMemo(
    () => (selectedGroupId ? shapes.filter((shape) => shape.groupId === selectedGroupId) : []),
    [selectedGroupId, shapes]
  );
const groupBounds = useMemo(() => {
    if (!selectedGroupId) return null;
    return getGroupBoundingBox(selectedGroupShapes);
  }, [selectedGroupId, selectedGroupShapes]);

  const centerStage = useCallback(() => {
    if (!image) return;
    const fitScale = Math.min(
      containerSize.width / image.width,
      containerSize.height / image.height
    );
    const safeScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
    const position = {
      x: (containerSize.width - image.width * safeScale) / 2,
      y: (containerSize.height - image.height * safeScale) / 2
    };
    setStageScale(safeScale);
    setStagePosition(position);
    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: safeScale, y: safeScale });
      stage.position(position);
      stage.batchDraw();
    }
  }, [image, containerSize]);

  useEffect(() => {
    if (!image) return;
    centerStage();
  }, [image, containerSize.width, containerSize.height, viewResetTrigger, centerStage]);

  const getStagePoint = useCallback((): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return null;
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const point = transform.point(pointerPosition);
    return [point.x, point.y];
  }, []);

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const scaleBy = 1.05;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = stageScale;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const targetScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const newScale = Math.min(Math.max(targetScale, 0.1), 10);
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale
    };
    const newPosition = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position(newPosition);
    stage.batchDraw();
    setStageScale(newScale);
    setStagePosition(newPosition);
  };

  const handleStageDragEnd = (event: KonvaEventObject<DragEvent>) => {
    setStagePosition({ x: event.target.x(), y: event.target.y() });
  };

  const commitRect = (rect: DraftRect) => {
    const [topLeft, bottomRight] = normalizeRectPoints(rect.start, rect.current);
    if (rect.tool === 'area') {
      onAreaSelect(topLeft, bottomRight);
      return;
    }
    if (rect.tool === 'rotated') {
      const center: Point = [
        (topLeft[0] + bottomRight[0]) / 2,
        (topLeft[1] + bottomRight[1]) / 2
      ];
      const width = bottomRight[0] - topLeft[0];
      const height = bottomRight[1] - topLeft[1];
      const metadata = { rotatedBox: { center, width, height, angle: 0 } };
      const polygonPoints = rotatedBoxToPolygon(metadata.rotatedBox);
      onCreateShape({ shapeType: 'polygon', points: polygonPoints, metadata });
    } else {
      onCreateShape({ shapeType: 'rectangle', points: [topLeft, bottomRight] });
    }
  };

  const handleStageMouseDown = (event: KonvaEventObject<MouseEvent>) => {
    if (groupTransformRef.current) {
      return;
    }
    // prevent deselect when grabbing stage for panning
    if (event.target === event.target.getStage() && tool === 'select') {
      return;
    }
    const point = getStagePoint();
    if (!point) return;
    if (tool === 'bbox' || tool === 'rotated' || tool === 'area') {
      setDraftRect({ start: point, current: point, tool: tool === 'area' ? 'area' : tool });
    }
    if (tool === 'polygon') {
      setPolygonDraft((prev) => [...prev, point]);
    }
  };

  const handleStageMouseMove = () => {
    if (groupTransformRef.current) {
      const pointer = getStagePoint();
      if (!pointer) return;
      const snapshot = groupTransformRef.current;
      if (snapshot.mode === 'translate') {
        const dx = pointer[0] - snapshot.startPointer[0];
        const dy = pointer[1] - snapshot.startPointer[1];
        const updates = Object.entries(snapshot.initialShapes).map(([shapeId, data]) => ({
          shapeId,
          points: translatePoints(data.points, dx, dy),
          metadata: translateMetadata(data.metadata, dx, dy)
        }));
        onBatchUpdateShapePoints(updates);
      } else if (snapshot.mode === 'rotate') {
        const angle = Math.atan2(pointer[1] - snapshot.center[1], pointer[0] - snapshot.center[0]);
        const delta = angle - snapshot.startAngle;
        const updates = Object.entries(snapshot.initialShapes).map(([shapeId, data]) => {
          let basePoints: Point[];
          let shapeTypeOverride: ShapeType | undefined;
          if (data.shapeType === 'rectangle') {
            const [topLeft, bottomRight] = normalizeRectPoints(data.points[0], data.points[1]);
            basePoints = rectToPolygon(topLeft, bottomRight);
            shapeTypeOverride = 'polygon';
          } else {
            basePoints = data.points;
          }
          const rotated = rotatePolygon(basePoints, snapshot.center, delta);
          return {
            shapeId,
            points: rotated,
            shapeType: shapeTypeOverride,
            metadata: rotateMetadata(data.metadata, snapshot.center, delta)
          };
        });
        onBatchUpdateShapePoints(updates);
      }
      return;
    }

    if (handleResizeRef.current) {
      const pointer = getStagePoint();
      if (!pointer) return;
      const { shapeId, direction, baseMeta } = handleResizeRef.current;
      if (direction === 'left' || direction === 'right') {
        handleWidthHandleDrag(shapeId, baseMeta, pointer, direction);
      } else {
        handleHeightHandleDrag(shapeId, baseMeta, pointer, direction);
      }
      return;
    }

    if (draftRect) {
      const point = getStagePoint();
      if (!point) return;
      setDraftRect({ ...draftRect, current: point });
    }
    if (polygonDraft.length > 0) {
      const point = getStagePoint();
      if (!point) return;
      setCursorPoint(point);
    } else {
      setCursorPoint(null);
    }
  };

  const handleStageMouseUp = () => {
    if (handleResizeRef.current) {
      handleResizeRef.current = null;
      unlockStageDrag();
      return;
    }

    if (groupTransformRef.current) {
      const snapshot = groupTransformRef.current;
      groupTransformRef.current = null;
      if (snapshot.mode === 'translate') {
        onGroupTransformComplete?.(snapshot.groupId, 'translate');
      } else {
        onGroupTransformComplete?.(snapshot.groupId, 'rotate');
      }
      unlockStageDrag();
      return;
    }
    if (draftRect) {
      commitRect(draftRect);
      setDraftRect(null);
    }
  };

  const handlePolygonDoubleClick = () => {
    if (polygonDraft.length >= 3) {
      onCreateShape({
        shapeType: 'polygon',
        points: polygonDraft.map((pt) => [pt[0], pt[1]] as Point)
      });
    }
    setPolygonDraft([]);
    setCursorPoint(null);
  };

  const selectShapeAtPointer = (shape: AnnotationShape, pointer: Point | null) => {
    if (selectionLocked && selectedShapeId && shape.id !== selectedShapeId) {
      return;
    }
    if (selectedShapeId === shape.id) {
      return;
    }
    if (!pointer) {
      selectionCycleRef.current = null;
      onSelectShape(shape.id, shape.groupId);
      return;
    }
    const overlapping = shapes
      .filter((candidate) => shapeContainsPoint(candidate, pointer))
      .sort((a, b) => Math.abs(polygonArea(shapeToPolygon(a))) - Math.abs(polygonArea(shapeToPolygon(b))));
    if (overlapping.length <= 1) {
      selectionCycleRef.current = { stack: [shape.id], pointer, index: 0 };
      onSelectShape(shape.id, shape.groupId);
      return;
    }
    const stackIds = overlapping.map((candidate) => candidate.id);
    const previous = selectionCycleRef.current;
    const currentIndex = overlapping.findIndex((candidate) => candidate.id === shape.id);
    let nextIndex = 0;
    if (
      previous &&
      stackIds.length === previous.stack.length &&
      stackIds.every((id, idx) => id === previous.stack[idx]) &&
      Math.hypot(previous.pointer[0] - pointer[0], previous.pointer[1] - pointer[1]) < 3
    ) {
      nextIndex = (previous.index + 1) % stackIds.length;
    } else if (stackIds.length === 1 && currentIndex >= 0) {
      nextIndex = currentIndex;
    }
    const target = overlapping[nextIndex];
    selectionCycleRef.current = { stack: stackIds, pointer, index: nextIndex };
    onSelectShape(target.id, target.groupId);
  };

  const finalizeRectPreview = draftRect
    ? normalizeRectPoints(draftRect.start, draftRect.current)
    : null;

  const polygonPreviewPoints = useMemo(() => {
    if (polygonDraft.length === 0) return null;
    const workingPoints = [...polygonDraft];
    if (cursorPoint) {
      workingPoints.push(cursorPoint);
    }
    return workingPoints.flat();
  }, [polygonDraft, cursorPoint]);

  const handleRectTransform = (shape: AnnotationShape, node: Konva.Rect) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const width = Math.max(1, node.width() * scaleX);
    const height = Math.max(1, node.height() * scaleY);
    const x = node.x();
    const y = node.y();
    node.scaleX(1);
    node.scaleY(1);
    const newPoints: [Point, Point] = [
      [x, y],
      [x + width, y + height]
    ];
    onUpdateShapePoints(shape.id, newPoints);
  };

  const handleRectDrag = (shape: AnnotationShape, node: Konva.Rect) => {
    const x = node.x();
    const y = node.y();
    const [[oldX, oldY]] = shape.points;
    const dx = x - oldX;
    const dy = y - oldY;
    const translated = translatePoints(shape.points, dx, dy);
    const metadata = translateMetadata(shape.metadata, dx, dy);
    onUpdateShapePoints(shape.id, translated, metadata);
  };

  const handlePolygonDrag = (shape: AnnotationShape, node: Konva.Group) => {
    const x = node.x();
    const y = node.y();
    const translated = translatePoints(shape.points, x, y);
    const metadata = translateMetadata(shape.metadata, x, y);
    onUpdateShapePoints(shape.id, translated, metadata);
    node.x(0);
    node.y(0);
  };

  const handlePolygonTransform = (shape: AnnotationShape, node: Konva.Group) => {
    const transform = node.getTransform().copy();
    const nextPoints = shape.points.map((point) => {
      const { x, y } = transform.point({ x: point[0], y: point[1] });
      return [x, y] as Point;
    });
    onUpdateShapePoints(shape.id, nextPoints, shape.metadata?.rotatedBox ? { rotatedBox: null } : shape.metadata);
    node.rotation(0);
    node.scaleX(1);
    node.scaleY(1);
    node.position({ x: 0, y: 0 });
  };

  const handleVertexDrag = (shape: AnnotationShape, vertexIndex: number, newPoint: Point) => {
    const nextPoints = shape.points.map((pt, idx) => (idx === vertexIndex ? newPoint : pt)) as Point[];
    onUpdateShapePoints(shape.id, nextPoints, shape.metadata?.rotatedBox ? { rotatedBox: null } : shape.metadata);
  };

  const snapshotGroupShapes = () => {
    const snapshot: Record<
      string,
      { points: Point[]; shapeType: ShapeType; metadata?: AnnotationShape['metadata'] }
    > = {};
    selectedGroupShapes.forEach((shape) => {
      snapshot[shape.id] = {
        points: clonePoints(shape.points),
        shapeType: shape.shapeType,
        metadata: shape.metadata
      };
    });
    return snapshot;
  };

  const translateMetadata = (
    metadata: AnnotationShape['metadata'],
    dx: number,
    dy: number
  ): AnnotationShape['metadata'] => {
    if (!metadata?.rotatedBox) return metadata;
    return {
      rotatedBox: {
        ...metadata.rotatedBox,
        center: [
          metadata.rotatedBox.center[0] + dx,
          metadata.rotatedBox.center[1] + dy
        ] as Point
      }
    };
  };

  const rotateMetadata = (
    metadata: AnnotationShape['metadata'],
    pivot: Point,
    deltaRad: number
  ): AnnotationShape['metadata'] => {
    if (!metadata?.rotatedBox) return metadata;
    const center = rotatePoint(metadata.rotatedBox.center, pivot, deltaRad);
    const deltaDeg = (deltaRad * 180) / Math.PI;
    return {
      rotatedBox: {
        ...metadata.rotatedBox,
        center,
        angle: metadata.rotatedBox.angle + deltaDeg
      }
    };
  };

  const updateRotatedBoxShape = (shapeId: string, meta: RotatedBoxMeta) => {
    const polygonPoints = rotatedBoxToPolygon(meta);
    onUpdateShapePoints(shapeId, polygonPoints, { rotatedBox: meta });
  };

  const lockStageDrag = () => setStageDragLocked(true);
  const unlockStageDrag = () => setStageDragLocked(false);
  const beginHandleResize = (
    shape: AnnotationShape,
    direction: 'left' | 'right' | 'top' | 'bottom'
  ) => {
    const meta = shape.metadata?.rotatedBox;
    if (!meta) return;
    handleResizeRef.current = {
      shapeId: shape.id,
      direction,
      baseMeta: {
        ...meta,
        center: [meta.center[0], meta.center[1]] as Point
      }
    };
    lockStageDrag();
  };

  const localOffsetToWorld = (meta: RotatedBoxMeta, offsetX: number, offsetY: number): Point => {
    const rad = (meta.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [offsetX * cos - offsetY * sin, offsetX * sin + offsetY * cos];
  };

  const handleWidthHandleDrag = (
    shapeId: string,
    baseMeta: RotatedBoxMeta,
    pointer: Point,
    direction: 'left' | 'right'
  ) => {
    const [localX] = worldToLocal(pointer, baseMeta);
    const sign = direction === 'right' ? 1 : -1;
    const movingFace = localX - sign * HANDLE_OFFSET;
    const anchorFace = direction === 'right' ? -baseMeta.width / 2 : baseMeta.width / 2;
    const minimumFace = anchorFace + sign * MIN_ROTATED_BOX_SIZE;
    const constrainedFace = sign === 1 ? Math.max(movingFace, minimumFace) : Math.min(movingFace, minimumFace);
    const width = Math.max(MIN_ROTATED_BOX_SIZE, Math.abs(constrainedFace - anchorFace));
    const centerLocalX = (constrainedFace + anchorFace) / 2;
    const [offsetX, offsetY] = localOffsetToWorld(baseMeta, centerLocalX, 0);
    const center: Point = [baseMeta.center[0] + offsetX, baseMeta.center[1] + offsetY];
    const nextMeta = { ...baseMeta, width, center };
    updateRotatedBoxShape(shapeId, nextMeta);
  };

  const handleHeightHandleDrag = (
    shapeId: string,
    baseMeta: RotatedBoxMeta,
    pointer: Point,
    direction: 'top' | 'bottom'
  ) => {
    const [, localY] = worldToLocal(pointer, baseMeta);
    const sign = direction === 'bottom' ? 1 : -1;
    const movingFace = localY - sign * HANDLE_OFFSET;
    const anchorFace = direction === 'bottom' ? -baseMeta.height / 2 : baseMeta.height / 2;
    const minimumFace = anchorFace + sign * MIN_ROTATED_BOX_SIZE;
    const constrainedFace = sign === 1 ? Math.max(movingFace, minimumFace) : Math.min(movingFace, minimumFace);
    const height = Math.max(MIN_ROTATED_BOX_SIZE, Math.abs(constrainedFace - anchorFace));
    const centerLocalY = (constrainedFace + anchorFace) / 2;
    const [offsetX, offsetY] = localOffsetToWorld(baseMeta, 0, centerLocalY);
    const center: Point = [baseMeta.center[0] + offsetX, baseMeta.center[1] + offsetY];
    const nextMeta = { ...baseMeta, height, center };
    updateRotatedBoxShape(shapeId, nextMeta);
  };

  const startGroupTranslate = () => {
    if (!selectedGroupId || !groupBounds) return;
    const pointer = getStagePoint();
    if (!pointer) return;
    groupTransformRef.current = {
      mode: 'translate',
      groupId: selectedGroupId,
      startPointer: pointer,
      initialShapes: snapshotGroupShapes()
    };
  };

  const startGroupRotate = () => {
    if (!selectedGroupId || !groupBounds) return;
    const pointer = getStagePoint();
    if (!pointer) return;
    const angle = Math.atan2(pointer[1] - groupBounds.center[1], pointer[0] - groupBounds.center[0]);
    groupTransformRef.current = {
      mode: 'rotate',
      groupId: selectedGroupId,
      center: groupBounds.center,
      startAngle: angle,
      initialShapes: snapshotGroupShapes()
    };
  };

  return (
    <div className="canvas-stage" ref={containerRef}>
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        draggable={tool === 'select' && !isDrawing && !stageDragLocked && !selectionLocked}
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
        onMouseDown={handleStageMouseDown}
        onClick={(event) => {
          if (!selectionLocked && tool === 'select' && event.target === event.target.getStage()) {
            selectionCycleRef.current = null;
            onSelectShape(null);
          }
        }}
        onTap={(event) => {
          if (!selectionLocked && tool === 'select' && event.target === event.target.getStage()) {
            selectionCycleRef.current = null;
            onSelectShape(null);
          }
        }}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handlePolygonDoubleClick}
        style={{ background: '#0f172a', borderRadius: '0.5rem' }}
      >
        <Layer>
          {imageElement && (
            <KonvaImage
              image={imageElement}
              width={image?.width}
              height={image?.height}
              listening={false}
            />
          )}

          {shapes.map((shape) => {
            const isShapeSelected = selectedShapeId === shape.id;
            const isGroupSelected = selectedGroupId !== null && selectedGroupId === shape.groupId;

            if (shape.shapeType === 'rectangle') {
              const [topLeft, bottomRight] = normalizeRectPoints(
                shape.points[0],
                shape.points[1]
              );
              const width = bottomRight[0] - topLeft[0];
              const height = bottomRight[1] - topLeft[1];
              return (
                <Rect
                  key={shape.id}
                  ref={(node) => {
                    shapeRefs.current[shape.id] = node;
                  }}
                  x={topLeft[0]}
                  y={topLeft[1]}
                  width={width}
                  height={height}
                  stroke={isShapeSelected ? '#2563eb' : isGroupSelected ? '#fb923c' : '#fbbf24'}
                  strokeWidth={2}
                  dash={isShapeSelected ? [4, 4] : undefined}
                  opacity={0.85}
                  fill={
                    isShapeSelected
                      ? 'rgba(37, 99, 235, 0.12)'
                      : isGroupSelected
                        ? 'rgba(249, 115, 22, 0.12)'
                        : 'rgba(251, 191, 36, 0.08)'
                  }
                  onClick={(event) => {
                    event.cancelBubble = true;
                    selectShapeAtPointer(shape, getStagePoint());
                  }}
                  onMouseDown={() => lockStageDrag()}
                  onMouseUp={() => unlockStageDrag()}
                  draggable={tool === 'select'}
                  onDragEnd={(event) => handleRectDrag(shape, event.target as Konva.Rect)}
                  onTransformStart={lockStageDrag}
                  onTransformEnd={(event) => {
                    handleRectTransform(shape, event.target as Konva.Rect);
                    unlockStageDrag();
                  }}
                  perfectDrawEnabled={false}
                />
              );
            }

            return (
              <Group
                key={shape.id}
                ref={(node) => {
                  shapeRefs.current[shape.id] = node;
                }}
                draggable={tool === 'select'}
                onDragStart={lockStageDrag}
                onDragEnd={(event) => {
                  handlePolygonDrag(shape, event.target as Konva.Group);
                  unlockStageDrag();
                }}
                onTransformEnd={(event) => handlePolygonTransform(shape, event.target as Konva.Group)}
              >
                <Line
                  points={shape.points.flat()}
                  closed
                  stroke={isShapeSelected ? '#22d3ee' : isGroupSelected ? '#fb7185' : '#c084fc'}
                  strokeWidth={2}
                  fill={
                    isShapeSelected
                      ? 'rgba(34, 211, 238, 0.12)'
                      : isGroupSelected
                        ? 'rgba(251, 113, 133, 0.12)'
                        : 'rgba(192, 132, 252, 0.12)'
                  }
                  onClick={(event) => {
                    event.cancelBubble = true;
                    selectShapeAtPointer(shape, getStagePoint());
                  }}
                  onMouseDown={() => lockStageDrag()}
                  onMouseUp={() => unlockStageDrag()}
                />
                {selectedShapeId === shape.id && !shape.metadata?.rotatedBox &&
                  shape.points.map((point, idx) => (
                    <Circle
                      key={`${shape.id}-vertex-${idx}`}
                      x={point[0]}
                      y={point[1]}
                      radius={5}
                      fill="#2563eb"
                      stroke="#eff6ff"
                      strokeWidth={1}
                      draggable={tool === 'select'}
                      onDragStart={lockStageDrag}
                      onDragEnd={() => unlockStageDrag()}
                      onDragMove={(event) => {
                        handleVertexDrag(shape, idx, [event.target.x(), event.target.y()]);
                      }}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        selectShapeAtPointer(shape, getStagePoint());
                      }}
                    />
                  ))}
                {selectedShapeId === shape.id && shape.metadata?.rotatedBox && (() => {
                  const meta = shape.metadata.rotatedBox;
                  const rad = (meta.angle * Math.PI) / 180;
                  const handlePosition = (offsetX: number, offsetY: number) =>
                    rotatePoint([meta.center[0] + offsetX, meta.center[1] + offsetY], meta.center, rad);
                  const positions = {
                    right: handlePosition(meta.width / 2 + HANDLE_OFFSET, 0),
                    left: handlePosition(-meta.width / 2 - HANDLE_OFFSET, 0),
                    top: handlePosition(0, -meta.height / 2 - HANDLE_OFFSET),
                    bottom: handlePosition(0, meta.height / 2 + HANDLE_OFFSET)
                  } as const;

                  const renderHandle = (key: keyof typeof positions) => (
                    <Circle
                      key={`${shape.id}-handle-${key}`}
                      x={positions[key][0]}
                      y={positions[key][1]}
                      radius={9}
                      fill="#34d399"
                      stroke="#065f46"
                      strokeWidth={2}
                      hitStrokeWidth={20}
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                        beginHandleResize(shape, key);
                      }}
                    />
                  );

                  return (
                    <>
                      {renderHandle('right')}
                      {renderHandle('left')}
                      {renderHandle('top')}
                      {renderHandle('bottom')}
                    </>
                  );
                })()}
              </Group>
            );
          })}

          {finalizeRectPreview && (
            <Rect
              x={finalizeRectPreview[0][0]}
              y={finalizeRectPreview[0][1]}
              width={finalizeRectPreview[1][0] - finalizeRectPreview[0][0]}
              height={finalizeRectPreview[1][1] - finalizeRectPreview[0][1]}
              stroke={
                draftRect?.tool === 'rotated'
                  ? '#22d3ee'
                  : draftRect?.tool === 'area'
                    ? '#10b981'
                    : '#93c5fd'
              }
              strokeWidth={draftRect?.tool === 'area' ? 3 : 1.5}
              dash={draftRect?.tool === 'area' ? [8, 4] : [4, 2]}
              listening={false}
              fill={draftRect?.tool === 'area' ? 'rgba(16, 185, 129, 0.12)' : undefined}
            />
          )}

          {polygonPreviewPoints && (
            <Line
              points={polygonPreviewPoints}
              stroke="#38bdf8"
              lineCap="round"
              lineJoin="round"
              dash={[6, 4]}
            />
          )}

          {groupBounds && selectedGroupShapes.length > 0 && (
            <Group listening>
              <Rect
                x={groupBounds.x}
                y={groupBounds.y}
                width={groupBounds.width}
                height={groupBounds.height}
                stroke="#38bdf8"
                dash={[6, 4]}
                strokeWidth={1.2}
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  startGroupTranslate();
                }}
              />
              <Line
                points={[
                  groupBounds.center[0],
                  groupBounds.y - 40,
                  groupBounds.center[0],
                  groupBounds.center[1]
                ]}
                stroke="#38bdf8"
                strokeWidth={1}
                dash={[4, 4]}
              />
              <Circle
                x={groupBounds.center[0]}
                y={groupBounds.y - 40}
                radius={8}
                fill="#2563eb"
                stroke="#e0f2fe"
                strokeWidth={2}
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  startGroupRotate();
                }}
              />
            </Group>
          )}
        </Layer>
        <Layer>
          <Transformer ref={transformerRef} />
        </Layer>
      </Stage>
    </div>
  );
}

export default CanvasStage;
