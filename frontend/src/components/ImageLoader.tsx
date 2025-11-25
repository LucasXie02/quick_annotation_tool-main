import { ChangeEvent } from 'react';
import type { ImageMeta } from '../types/annotations';

interface ImageLoaderProps {
  image: ImageMeta | null;
  onImageLoaded(meta: ImageMeta): void;
}

export function ImageLoader({ image, onImageLoaded }: ImageLoaderProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          onImageLoaded({
            name: file.name,
            width: img.width,
            height: img.height,
            src: result
          });
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="image-loader">
      <label className="upload-label">
        <span>{image ? 'Change image' : 'Upload image'}</span>
        <input type="file" accept="image/*" onChange={handleChange} />
      </label>
      {image && (
        <p className="image-meta">
          {image.name} · {image.width}×{image.height}
        </p>
      )}
    </div>
  );
}

export default ImageLoader;
