import { useRef } from 'react';
import type { AnnotationGroup, AnnotationShape, LabelmeAnnotation } from '../types/annotations';
import { consumeLabelmeAnnotation, exportLabelme } from '../utils/labelme';

interface ImportExportPanelProps {
  imageName: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  shapes: AnnotationShape[];
  groups: AnnotationGroup[];
  onImport(shapes: AnnotationShape[], groups: AnnotationGroup[], nextGroupId: number): void;
}

export function ImportExportPanel({
  imageName,
  imageWidth,
  imageHeight,
  shapes,
  groups,
  onImport
}: ImportExportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    if (!imageName || imageWidth === null || imageHeight === null) {
      alert('Upload an image before exporting annotations.');
      return;
    }
    const json = exportLabelme(shapes, { name: imageName, width: imageWidth, height: imageHeight });
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const baseName = imageName.replace(/\.[^.]+$/, '') || imageName;
    anchor.download = `${baseName}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as LabelmeAnnotation;
      if (!parsed.shapes || !Array.isArray(parsed.shapes)) {
        alert('Invalid Labelme file: missing shapes list.');
        return;
      }
      const { shapes: importedShapes, groups: importedGroups, nextGroupId } = consumeLabelmeAnnotation(parsed);
      onImport(importedShapes, importedGroups, nextGroupId);
    } catch (error) {
      console.error('Failed to import annotation', error);
      alert('Failed to import Labelme JSON. Check console for details.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="import-export-panel">
      <h3>Labelme Import/Export</h3>
      <div className="import-export-actions">
        <button type="button" onClick={handleExport} className="group-action-btn" disabled={!imageName}>
          Export JSON
        </button>
        <button type="button" onClick={handleImportClick} className="group-action-btn">
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      <p className="import-note">Exports follow Labelme format; import supports Labelme JSON.</p>
    </div>
  );
}

export default ImportExportPanel;
