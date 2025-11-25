import { useEffect, useState } from 'react';

export function useImage(src?: string | null): [HTMLImageElement | undefined] {
  const [image, setImage] = useState<HTMLImageElement>();

  useEffect(() => {
    if (!src) {
      setImage(undefined);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) {
        setImage(img);
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return [image];
}

export default useImage;
