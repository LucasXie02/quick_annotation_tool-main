# Quick Annotation Tool

A single-page web application for creating Labelme-compatible image annotations. Built for speed and single-user workflows, it lets you draw axis-aligned boxes, polygons, rotated rectangles, clone regions, and manage per-object group IDs. React + React-Konva power the canvas; FastAPI serves the backend and static assets.

## Features
- Axis-aligned bounding boxes, polygons, rotated rectangles (stored as 4-point polygons).
- Group-level operations: copy/paste, drag, rotate entire objects, synchronized `group_id`s across shapes.
- Area Clone tool: marquee a region to duplicate all shapes inside it automatically.
- Undo for the most recent shape-modifying actions.
- Label editing & group list with inline rename/delete, plus clipboard support.
- Labelme JSON import/export (per image) with shape/group reconstruction.
- Dataset browser: load a folder of images + JSON files and annotate them sequentially.
- Canvas niceties: zoom/pan around cursor, snap-to-center button, rotation handles.

## Project Structure
```
quick_annotation_tool/
├── backend/
│   ├── main.py           # FastAPI entrypoint (serves API + static files)
│   └── requirements.txt  # FastAPI + Uvicorn versions
├── frontend/
│   ├── package.json      # Vite + React dependencies
│   └── src/              # React, canvas components, geometry helpers
├── Dockerfile            # Multi-stage build (Node + Python)
└── README.md
```

## Prerequisites
- Python ≥ 3.11
- Node.js ≥ 18
- npm (bundled with Node)
- Docker (optional, for containerized deployment)

## Local Development
### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # optional
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
This serves the API and (when built) the frontend bundle.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Vite runs at http://localhost:5173 with hot reload. The backend’s CORS settings allow cross-origin calls during development.

### Production Build
```bash
cd frontend
npm run build
```
Outputs go to `frontend/dist`. Running `uvicorn backend.main:app` from repo root will now serve the bundled SPA at http://localhost:8000.

## Docker Deployment
```bash
docker build -t annotation-mvp .
docker run -p 8000:8000 annotation-mvp
```
Then browse to http://localhost:8000.

## Usage Tips
1. **Load an Image**: Use “Upload image” or the Dataset panel’s “Choose folder” to pick a directory containing images and optional Labelme JSON files. Entries with matching JSON appear with a “JSON” badge.
2. **Select a Tool**: Choose Select/BBox/Polygon/Rotated/Area Clone from the Tools card.
3. **Draw & Edit**: Drag to draw shapes. Use the group list to rename/delete or copy/paste objects. The Select tool enables vertex editing and group transforms (drag/rotate via cyan bounding box).
4. **Area Clone**: Choose Area Clone, marquee a region, and the enclosed shapes are duplicated into a new group. Tool switches back to Select automatically so you can reposition/rotate the cloned cluster.
5. **Undo & Center**: The View card offers “Undo Last Change” (reverts the most recent shape edit) and “Center & Fit” to reset zoom/pan.
6. **Import/Export**: Use the Labelme panel to import existing annotations or export the current state. Exports share the image’s base filename with `.json`.

## Shortcuts & Controls
- **Scroll wheel / trackpad**: zoom around the cursor.
- **Mouse drag on canvas (Select tool)**: pan when no shape is being edited.
- **Group drag/rotate**: select a group and use the cyan bounding box + rotation handle.

## Future Enhancements
- Redo stack for multi-level history.
- Keyboard shortcuts (`Ctrl+Z`, `Delete`, etc.).
- Multi-image batch export/import flows.

Contributions, suggestions, and bug reports are welcome! EOF