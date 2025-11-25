import { useCallback, useMemo, useState } from 'react';
import { nanoid } from 'nanoid';

import './App.css';
import CanvasStage from './components/CanvasStage';
import ToolPanel from './components/ToolPanel';
import ImageLoader from './components/ImageLoader';
import ImportExportPanel from './components/ImportExportPanel';
import ClassPanel from './components/ClassPanel';
import InstructionsPanel from './components/InstructionsPanel';
import DatasetPanel from './components/DatasetPanel';
import {
  translatePoints,
  isShapeWithinRect,
  normalizeRectPoints,
  clonePoints,
  rotatedBoxToPolygon
} from './utils/geometry';
import { consumeLabelmeAnnotation } from './utils/labelme';
import type {
  AnnotationGroup,
  AnnotationShape,
  ImageMeta,
  ToolType,
  ShapeType,
  Point,
  DatasetItem,
  LabelmeAnnotation
} from './types/annotations';

const DEFAULT_LABEL = 'object';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];

const getExtension = (name: string) => {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
};

const isImageFile = (fileName: string) => IMAGE_EXTENSIONS.includes(getExtension(fileName));

const getRelativePath = (file: File) =>
  (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

const stripExtension = (value: string) => value.replace(/\.[^.]+$/, '');

const readFileAsDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const cloneShape = (shape: AnnotationShape): AnnotationShape => ({
  ...shape,
  points: clonePoints(shape.points),
  metadata: shape.metadata
    ? {
        rotatedBox: shape.metadata.rotatedBox
          ? { ...shape.metadata.rotatedBox, center: [...shape.metadata.rotatedBox.center] as Point }
          : null
      }
    : undefined
});

const uniqueMerge = (existing: string[], incoming: string[]) => {
  const seen = new Set(existing.map((label) => label.trim()));
  const merged = [...existing];
  incoming.forEach((label) => {
    const trimmed = label.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      merged.push(trimmed);
    }
  });
  return merged;
};

function App() {
  const [image, setImage] = useState<ImageMeta | null>(null);
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const [tool, setTool] = useState<ToolType>('select');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [groups, setGroups] = useState<AnnotationGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [nextGroupId, setNextGroupId] = useState(1);
  const [clipboard, setClipboard] = useState<AnnotationShape[] | null>(null);
  const [datasetItems, setDatasetItems] = useState<DatasetItem[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [viewResetTrigger, setViewResetTrigger] = useState(0);
  const [history, setHistory] = useState<AnnotationShape[][]>([]);
  const [classes, setClasses] = useState<string[]>(['object']);
  const [activeClass, setActiveClass] = useState('object');
  const [instructionsLang, setInstructionsLang] = useState<'en' | 'zh'>('en');
  const [pendingUngroupGroupId, setPendingUngroupGroupId] = useState<number | null>(null);
  const [selectionLocked, setSelectionLocked] = useState(false);

  const captureHistory = useCallback((currentShapes: AnnotationShape[]) => {
    if (currentShapes.length === 0) {
      return;
    }
    const snapshot = currentShapes.map(cloneShape);
    setHistory((prev) => {
      const next = [...prev, snapshot];
      return next.slice(-50);
    });
  }, []);

  const syncClassesWithLabels = useCallback((labels: string[]) => {
    setClasses((prev) => {
      const merged = uniqueMerge(prev, labels.length ? labels : ['object']);
      setActiveClass((current) => (merged.includes(current) ? current : merged[0]));
      return merged;
    });
  }, []);

  const loadDatasetItem = useCallback(
    async (item: DatasetItem) => {
      try {
        const dataUrl = await readFileAsDataURL(item.imageFile);
        const img = await loadImageElement(dataUrl);
        setImage({ name: item.name, width: img.width, height: img.height, src: dataUrl });
        setActiveDatasetId(item.id);
        setClipboard(null);
        setPendingUngroupGroupId(null);
        if (item.annotationFile) {
          const text = await item.annotationFile.text();
          const parsed = JSON.parse(text) as LabelmeAnnotation;
          const { shapes: importedShapes, groups: importedGroups, nextGroupId: importedNext } =
            consumeLabelmeAnnotation(parsed);
          setShapes(importedShapes);
          setGroups(importedGroups);
          setNextGroupId(importedNext);
          setActiveGroupId(importedGroups[0]?.id ?? null);
          setSelectedShapeId(importedShapes[0]?.id ?? null);
          syncClassesWithLabels(importedShapes.map((shape) => shape.label || 'object'));
        } else {
          setShapes([]);
          setGroups([]);
          setNextGroupId(1);
          setActiveGroupId(null);
          setSelectedShapeId(null);
          syncClassesWithLabels([]);
        }
        setHistory([]);
        setViewResetTrigger((prev) => prev + 1);
      } catch (error) {
        console.error('Failed to load dataset item', error);
        alert('Failed to load dataset entry. Check console for details.');
      }
    },
    []
  );

  const handleImageLoaded = (meta: ImageMeta) => {
    setImage(meta);
    setShapes([]);
    setSelectedShapeId(null);
    setGroups([]);
    setActiveGroupId(null);
    setNextGroupId(1);
    setClipboard(null);
    setActiveDatasetId(null);
    setHistory([]);
    setViewResetTrigger((prev) => prev + 1);
    syncClassesWithLabels([]);
    setPendingUngroupGroupId(null);
  };

  const handleDatasetFolderSelected = useCallback(
    (files: FileList) => {
      const entries = Array.from(files);
      const annotationMap = new Map<string, File>();
      entries.forEach((file) => {
        if (getExtension(file.name) === '.json') {
          annotationMap.set(stripExtension(getRelativePath(file)), file);
        }
      });
      const items = entries
        .filter((file) => isImageFile(file.name))
        .map((file) => {
          const relativePath = getRelativePath(file);
          const key = stripExtension(relativePath);
          return {
            id: nanoid(),
            name: file.name,
            imageFile: file,
            annotationFile: annotationMap.get(key),
            relativePath
          } satisfies DatasetItem;
        });
      if (items.length === 0) {
        alert('No image files found in the selected folder.');
        return;
      }
      setDatasetItems(items);
      loadDatasetItem(items[0]);
    },
    [loadDatasetItem]
  );

  const handleSelectDatasetItem = useCallback(
    (id: string) => {
      const item = datasetItems.find((entry) => entry.id === id);
      if (item) {
        loadDatasetItem(item);
      }
    },
    [datasetItems, loadDatasetItem]
  );

  const handleCenterView = () => {
    setViewResetTrigger((prev) => prev + 1);
  };

  const handleUndo = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      const restored = snapshot.map(cloneShape);
      setShapes(restored);
      setSelectedShapeId(restored[restored.length - 1]?.id ?? null);
      return prev.slice(0, -1);
    });
  };

  const ensureActiveGroup = useCallback(() => {
    if (activeGroupId !== null) {
      return activeGroupId;
    }
    const newId = nextGroupId;
    const label = `Object ${newId}`;
    setGroups((prev) => [...prev, { id: newId, label }]);
    setActiveGroupId(newId);
    setNextGroupId((prev) => prev + 1);
    return newId;
  }, [activeGroupId, nextGroupId]);

  const handleCreateGroup = useCallback(() => {
    const newId = nextGroupId;
    const label = `Object ${newId}`;
    setGroups((prev) => [...prev, { id: newId, label }]);
    setActiveGroupId(newId);
    setNextGroupId((prev) => prev + 1);
  }, [nextGroupId]);

  const handleCreateShape = useCallback(
    ({
      shapeType,
      points,
      metadata
    }: {
      shapeType: ShapeType;
      points: Point[];
      metadata?: AnnotationShape['metadata'];
    }) => {
      const groupId = ensureActiveGroup();
      const newShape: AnnotationShape = {
        id: nanoid(),
        label: activeClass,
        groupId,
        shapeType,
        points,
        flags: {},
        metadata
      };
      setShapes((prev) => {
        captureHistory(prev);
        return [...prev, newShape];
      });
      setSelectedShapeId(newShape.id);
    },
    [ensureActiveGroup, captureHistory, activeClass]
  );

  const handleBatchUpdateShapes = useCallback(
    (
      updates: Array<{
        shapeId: string;
        points: Point[];
        shapeType?: ShapeType;
        metadata?: AnnotationShape['metadata'];
      }>
    ) => {
      const updateMap = new Map(updates.map((item) => [item.shapeId, item]));
      if (updates.length === 0) return;
      setShapes((prev) => {
        captureHistory(prev);
        return prev.map((shape) => {
          const update = updateMap.get(shape.id);
          if (!update) return shape;
          return {
            ...shape,
            points: update.points,
            shapeType: update.shapeType ?? shape.shapeType,
            metadata: update.metadata ?? shape.metadata
          };
        });
      });
    },
    [captureHistory]
  );

  const handleUpdateShapePoints = useCallback(
    (shapeId: string, points: Point[], metadata?: AnnotationShape['metadata']) => {
      handleBatchUpdateShapes([{ shapeId, points, metadata }]);
    },
    [handleBatchUpdateShapes]
  );

  const handleSelectShape = useCallback(
    (shapeId: string | null, groupId?: number) => {
      setSelectedShapeId(shapeId);
      if (shapeId === null) {
        setActiveGroupId(null);
        setSelectionLocked(false);
      } else if (groupId !== undefined) {
        setActiveGroupId(groupId);
      }
    },
    []
  );

  const handleDeleteShape = useCallback(
    (shapeId: string) => {
      setShapes((prevShapes) => {
        captureHistory(prevShapes);
        const target = prevShapes.find((shape) => shape.id === shapeId);
        const nextShapes = prevShapes.filter((shape) => shape.id !== shapeId);
        if (target) {
          const stillHasShapes = nextShapes.some((shape) => shape.groupId === target.groupId);
          if (!stillHasShapes) {
            setGroups((prevGroups) => prevGroups.filter((group) => group.id !== target.groupId));
            setClipboard((prevClipboard) => {
              if (!prevClipboard) return prevClipboard;
              return prevClipboard[0]?.groupId === target.groupId ? null : prevClipboard;
            });
            if (activeGroupId === target.groupId) {
              setActiveGroupId(null);
            }
          }
        }
        return nextShapes;
      });
      setSelectedShapeId(null);
    },
    [activeGroupId, captureHistory]
  );

  const handleSelectGroup = (groupId: number) => {
    setActiveGroupId(groupId);
    const shape = shapes.find((s) => s.groupId === groupId);
    setSelectedShapeId(shape ? shape.id : null);
  };

  const handleRenameGroup = (groupId: number, label: string) => {
    setGroups((prev) => prev.map((group) => (group.id === groupId ? { ...group, label } : group)));
  };

  const handleDeleteGroup = (groupId: number) => {
    setGroups((prev) => prev.filter((group) => group.id !== groupId));
    setShapes((prevShapes) => {
      captureHistory(prevShapes);
      const nextShapes = prevShapes.filter((shape) => shape.groupId !== groupId);
      setSelectedShapeId((prevSelected) => {
        if (!prevSelected) return null;
        const stillExists = nextShapes.some((shape) => shape.id === prevSelected);
        return stillExists ? prevSelected : null;
      });
      return nextShapes;
    });
    if (activeGroupId === groupId) {
      setActiveGroupId(null);
    }
    setClipboard((prev) => {
      if (!prev) return prev;
      return prev[0]?.groupId === groupId ? null : prev;
    });
  };

  const handleCopyGroup = () => {
    if (activeGroupId === null) return;
    const groupShapes = shapes.filter((shape) => shape.groupId === activeGroupId);
    if (groupShapes.length === 0) return;
    const clones = groupShapes.map((shape) => cloneShape(shape));
    setClipboard(clones);
  };

  const handlePasteGroup = () => {
    if (!clipboard || clipboard.length === 0) return;
    const newGroupId = nextGroupId;
    const sourceGroup = groups.find((group) => group.id === clipboard[0].groupId);
    const label = sourceGroup ? `${sourceGroup.label} Copy` : `Object ${newGroupId}`;
    const offset = 20;
    const pastedShapes = clipboard.map((shape) => ({
      ...cloneShape(shape),
      id: nanoid(),
      groupId: newGroupId,
      points: translatePoints(shape.points, offset, offset),
      metadata: shape.metadata?.rotatedBox
        ? {
            rotatedBox: {
              ...shape.metadata.rotatedBox,
              center: [
                shape.metadata.rotatedBox.center[0] + offset,
                shape.metadata.rotatedBox.center[1] + offset
              ] as Point
            }
          }
        : shape.metadata
    }));
    setGroups((prev) => [...prev, { id: newGroupId, label }]);
    setShapes((prev) => {
      captureHistory(prev);
      return [...prev, ...pastedShapes];
    });
    setNextGroupId((prev) => prev + 1);
    setActiveGroupId(newGroupId);
    setSelectedShapeId(pastedShapes[0]?.id ?? null);
  };

  const handleAreaClone = useCallback(
    (start: Point, end: Point) => {
      const [topLeft, bottomRight] = normalizeRectPoints(start, end);
      const selectedShapes = shapes.filter((shape) => isShapeWithinRect(shape, topLeft, bottomRight));
      if (selectedShapes.length === 0) {
        alert('No shapes inside the selected box.');
        return;
      }
      const newGroupId = nextGroupId;
      const label = `Region ${newGroupId}`;
      const clones = selectedShapes.map((shape) => ({
        ...cloneShape(shape),
        id: nanoid(),
        groupId: newGroupId
      }));
      setGroups((prev) => [...prev, { id: newGroupId, label }]);
      setShapes((prev) => {
        captureHistory(prev);
        return [...prev, ...clones];
      });
      setNextGroupId((prev) => prev + 1);
      setActiveGroupId(newGroupId);
      setSelectedShapeId(clones[0]?.id ?? null);
      setTool('select');
      setPendingUngroupGroupId(newGroupId);
    },
    [nextGroupId, shapes, captureHistory]
  );

  const handleUngroupGroup = (groupId: number) => {
    const targetShapes = shapes.filter((shape) => shape.groupId === groupId);
    if (targetShapes.length <= 1) return;
    let next = nextGroupId;
    const idMap = new Map<string, number>();
    targetShapes.forEach((shape) => {
      idMap.set(shape.id, next);
      next += 1;
    });
    captureHistory(shapes);
    setShapes((prev) =>
      prev.map((shape) =>
        idMap.has(shape.id) ? { ...shape, groupId: idMap.get(shape.id)! } : shape
      )
    );
    setGroups((prev) => {
      const filtered = prev.filter((group) => group.id !== groupId);
      const additions = targetShapes.map((shape) => ({
        id: idMap.get(shape.id)!,
        label: shape.label || `Object ${idMap.get(shape.id)!}`
      }));
      return [...filtered, ...additions];
    });
    setNextGroupId(next);
    setActiveGroupId(null);
    setSelectedShapeId(targetShapes[0]?.id ?? null);
    setPendingUngroupGroupId((prev) => (prev === groupId ? null : prev));
  };

  const handleGroupTransformComplete = (groupId: number, mode: 'translate' | 'rotate') => {
    if (mode === 'translate' && pendingUngroupGroupId === groupId) {
      // keep the group active so users can pan/zoom before ungrouping
      setActiveGroupId(groupId);
    }
    if (mode === 'translate') {
      setPendingUngroupGroupId(groupId);
    }
  };

  const handleAddClass = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setClasses((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setActiveClass(trimmed);
  };

  const handleSelectClass = (label: string) => {
    if (classes.includes(label)) {
      setActiveClass(label);
    }
  };

  const handleAdjustRotatedBox = (
    shapeId: string,
    updates: Partial<{ width: number; height: number; angle: number }>
  ) => {
    setShapes((prev) => {
      captureHistory(prev);
      return prev.map((shape) => {
        if (shape.id !== shapeId || !shape.metadata?.rotatedBox) return shape;
        const nextMeta = {
          ...shape.metadata.rotatedBox,
          ...updates,
          width: Math.max(4, updates.width ?? shape.metadata.rotatedBox.width),
          height: Math.max(4, updates.height ?? shape.metadata.rotatedBox.height),
          angle: updates.angle ?? shape.metadata.rotatedBox.angle
        };
        return {
          ...shape,
          metadata: { rotatedBox: nextMeta },
          points: rotatedBoxToPolygon(nextMeta)
        };
      });
    });
  };

  const selectionMeta = useMemo(() => {
    if (!selectedShapeId) return null;
    const shape = shapes.find((s) => s.id === selectedShapeId);
    if (!shape) return null;
    const group = groups.find((g) => g.id === shape.groupId) ?? null;
    return { shape, group };
  }, [selectedShapeId, shapes, groups]);

  const canCopyGroup = activeGroupId !== null && shapes.some((shape) => shape.groupId === activeGroupId);
  const canUndo = history.length > 0;
  const canUngroupSelection =
    selectionMeta && shapes.filter((shape) => shape.groupId === selectionMeta.shape.groupId).length > 1;

  const handleSelectionLabelChange = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!selectionMeta || !trimmed) return;
      syncClassesWithLabels([trimmed]);
      setActiveClass(trimmed);
      setShapes((prev) => {
        captureHistory(prev);
        return prev.map((shape) =>
          shape.id === selectionMeta.shape.id ? { ...shape, label: trimmed } : shape
        );
      });
    },
    [selectionMeta, syncClassesWithLabels, captureHistory]
  );
  const canPasteGroup = Boolean(clipboard);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Quick Annotation Tool</h1>
        <p className="subtitle">Web canvas MVP with bbox, polygon, and rotated bbox tools</p>
      </header>

      <main className="app-main">
        <section className="canvas-panel">
          {image ? (
            <CanvasStage
              image={image}
              shapes={shapes}
              tool={tool}
              onCreateShape={handleCreateShape}
              onUpdateShapePoints={handleUpdateShapePoints}
              onBatchUpdateShapePoints={handleBatchUpdateShapes}
              selectedShapeId={selectedShapeId}
              selectedGroupId={activeGroupId}
              onSelectShape={handleSelectShape}
              onAreaSelect={handleAreaClone}
              viewResetTrigger={viewResetTrigger}
              onGroupTransformComplete={handleGroupTransformComplete}
              selectionLocked={selectionLocked}
            />
          ) : (
            <div className="canvas-placeholder">
              <p>Upload an image to start annotating.</p>
            </div>
          )}
        </section>

        <aside className="control-panel">
          <InstructionsPanel language={instructionsLang} onLanguageChange={setInstructionsLang} />
          <ImageLoader image={image} onImageLoaded={handleImageLoaded} />
          <DatasetPanel
            items={datasetItems}
            activeId={activeDatasetId}
            onFolderSelected={handleDatasetFolderSelected}
            onSelectItem={handleSelectDatasetItem}
          />
          <div className="control-card">
            <h3>View</h3>
            <button type="button" className="secondary-btn" onClick={handleCenterView}>
              Center & Fit
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={handleUndo}
              disabled={!canUndo}
            >
              Undo Last Change
            </button>
          </div>
          <ToolPanel
            activeTool={tool}
            onChange={setTool}
            hasSelection={Boolean(selectionMeta)}
            onDeleteSelected={() => {
              if (!selectionMeta) return;
              const groupId = selectionMeta.shape.groupId;
              const groupShapes = shapes.filter((shape) => shape.groupId === groupId);
              if (groupShapes.length > 1) {
                handleDeleteGroup(groupId);
              } else {
                handleDeleteShape(selectionMeta.shape.id);
              }
            }}
          />
          <ClassPanel
            classes={classes}
            activeClass={activeClass}
            onSelectClass={handleSelectClass}
            onAddClass={handleAddClass}
          />
          <ImportExportPanel
            imageName={image?.name ?? null}
            imageWidth={image?.width ?? null}
            imageHeight={image?.height ?? null}
            shapes={shapes}
            groups={groups}
            onImport={(nextShapes, nextGroups, nextGroupValue) => {
              setShapes(nextShapes);
              setGroups(nextGroups);
              setNextGroupId(nextGroupValue);
              setActiveGroupId(nextGroups[0]?.id ?? null);
              setSelectedShapeId(nextShapes[0]?.id ?? null);
              syncClassesWithLabels(nextShapes.map((shape) => shape.label || 'object'));
              setHistory([]);
            }}
          />

          <div className="control-card">
            <h3>Selection</h3>
            {selectionMeta ? (
              <ul className="selection-meta">
                <li>ID: {selectionMeta.shape.id}</li>
                <li>
                  Group: {selectionMeta.group?.label ?? selectionMeta.shape.groupId} (#{selectionMeta.shape.groupId})
                </li>
                <li>
                  Class:
                  <select
                    value={selectionMeta.shape.label}
                    onChange={(event) => handleSelectionLabelChange(event.target.value)}
                  >
                    {classes.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </li>
                <li>Type: {selectionMeta.shape.shapeType}</li>
                <li>Points: {selectionMeta.shape.points.length}</li>
              </ul>
            ) : (
              <p>No shape selected.</p>
            )}
            {selectionMeta && (
              <button
                type="button"
                className="reset-btn"
                onClick={() => handleDeleteShape(selectionMeta.shape.id)}
              >
                Delete Selected Shape
              </button>
            )}
            {selectionMeta?.shape.metadata?.rotatedBox && (
              <div className="size-controls">
                <label>
                  Width
                  <input
                    type="number"
                    min={4}
                    value={Math.round(selectionMeta.shape.metadata.rotatedBox.width)}
                    onChange={(event) =>
                      handleAdjustRotatedBox(selectionMeta.shape.id, {
                        width: Number(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    min={4}
                    value={Math.round(selectionMeta.shape.metadata.rotatedBox.height)}
                    onChange={(event) =>
                      handleAdjustRotatedBox(selectionMeta.shape.id, {
                        height: Number(event.target.value)
                      })
                    }
                  />
                </label>
              </div>
            )}
            {selectionMeta && canUngroupSelection && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handleUngroupGroup(selectionMeta.shape.groupId)}
              >
                Ungroup Clone
              </button>
            )}
            {selectionMeta && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSelectionLocked((prev) => !prev)}
              >
                {selectionLocked ? 'Unlock Selection' : 'Lock Selection'}
              </button>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
