import { useEffect, useRef, useState } from 'react';
import { Point } from './point';

export type CanvasInfo = {
  c: HTMLCanvasElement,
  d: CanvasRenderingContext2D,
  size: Point,
};

export type CanvasRef = (instance: HTMLCanvasElement | null) => void;
export function useCanvas<S>(
  state: S,
  render: (ci: CanvasInfo, state: S) => void,
  deps: any[],
  onLoad: (ci: CanvasInfo) => void,
): [
    React.RefCallback<HTMLCanvasElement>,
    React.MutableRefObject<CanvasInfo | undefined>,
  ] {
  const infoRef = useRef<CanvasInfo | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<Point>({ x: 0, y: 0 });

  // Set up resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const newWidth = Math.floor(entry.contentRect.width);
        const newHeight = Math.floor(entry.contentRect.height);
        setSize(prev => {
          if (prev.x !== newWidth || prev.y !== newHeight) {
            return { x: newWidth, y: newHeight };
          }
          return prev;
        });
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef.current]);

  // Update canvas dimensions and render when size changes
  useEffect(() => {
    const ci = infoRef.current;
    if (ci && size.x > 0 && size.y > 0) {
      const dpr = window.devicePixelRatio || 1;
      const targetW = size.x * dpr;
      const targetH = size.y * dpr;
      if (ci.c.width !== targetW || ci.c.height !== targetH) {
        ci.c.width = targetW;
        ci.c.height = targetH;
        ci.d.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ci.size = size;
      render(ci, state);
    }
  }, [size, ...deps]);

  const ref: React.RefCallback<HTMLCanvasElement> = canvas => {
    if (canvas !== null && canvasRef.current !== canvas) {
      canvasRef.current = canvas;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(canvas.getBoundingClientRect().width);
      const height = Math.floor(canvas.getBoundingClientRect().height);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      infoRef.current = { c: canvas, d: ctx, size: { x: width, y: height } };
      setSize({ x: width, y: height });
      onLoad(infoRef.current);
    }
  };
  return [ref, infoRef];
}
