/**
 * Il TAVOLO DA LAVORO della maglia (MODULE_STADIUM §3.4 E-bis): Stage react-konva
 * sovrapposto alla maglia SVG, stesse unità del viewBox 100×92 (via scale dello
 * Stage). Trascini le forme, le scali dagli angoli, le ruoti dalla maniglia; guida
 * di centratura sull'asse della maglia; Canc elimina, Esc deseleziona. Il clip sul
 * corpo maglia replica il path SVG. Il render di VISUALIZZAZIONE resta KitShirt:
 * qui vive solo l'editor.
 */

import type Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Group, Image as KImage, Layer, Line, Path, Stage, Text, Transformer } from 'react-konva';
import type { KitDecal } from '../../src/core/types';
import { DECAL_D, FONT_FAMILY, MAX_TEXT_LEN } from './kitShapes';

function useImg(src?: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    const im = new window.Image();
    im.onload = () => setImg(im);
    im.src = src;
  }, [src]);
  return img;
}

/** Clip identico al path `body` di KitShirt (corpo maglia, maniche escluse). */
function bodyClip(ctx: Konva.Context): void {
  ctx.beginPath();
  ctx.moveTo(25, 10);
  ctx.lineTo(75, 10);
  ctx.lineTo(75, 81);
  ctx.bezierCurveTo(75, 85, 72, 87, 68, 87);
  ctx.lineTo(32, 87);
  ctx.bezierCurveTo(28, 87, 25, 85, 25, 81);
  ctx.closePath();
}

function DecalNode({
  dc,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  dragBound,
  nodeRef,
}: {
  dc: KitDecal;
  onSelect: () => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  dragBound: (pos: Konva.Vector2d) => Konva.Vector2d;
  nodeRef: (n: Konva.Node | null) => void;
}) {
  const img = useImg(dc.shape === 'logo' ? dc.image : undefined);
  const common = {
    x: dc.x,
    y: dc.y,
    scaleX: dc.scale,
    scaleY: dc.scale,
    rotation: dc.rot ?? 0,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart: onSelect,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    dragBoundFunc: dragBound,
  };
  if (dc.shape === 'testo') {
    return (
      <Text
        {...common}
        ref={nodeRef as never}
        text={(dc.text ?? 'TESTO').slice(0, MAX_TEXT_LEN)}
        fontSize={7}
        fontStyle="bold"
        fontFamily={FONT_FAMILY[dc.font ?? 'block']}
        fill={dc.color}
        width={60}
        align="center"
        offsetX={30}
        offsetY={3.5}
      />
    );
  }
  if (dc.shape === 'logo') {
    if (!img) return null;
    const ar = img.width / Math.max(1, img.height);
    const w = ar >= 1 ? 16 : 16 * ar;
    const h = ar >= 1 ? 16 / ar : 16;
    return (
      <KImage
        {...common}
        ref={nodeRef as never}
        image={img}
        width={w}
        height={h}
        offsetX={w / 2}
        offsetY={h / 2}
      />
    );
  }
  return <Path {...common} ref={nodeRef as never} data={DECAL_D[dc.shape]} fill={dc.color} />;
}

export function KitEditor({
  decals,
  selected,
  onSelect,
  onChange,
  onDelete,
  size = 250,
  accent,
}: {
  decals: KitDecal[];
  selected: number | null;
  onSelect: (i: number | null) => void;
  onChange: (i: number, patch: Partial<KitDecal>) => void;
  onDelete: (i: number) => void;
  size?: number;
  accent: string;
}) {
  const k = size / 100;
  const [guide, setGuide] = useState(false);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Map<number, Konva.Node>>(new Map());

  // Il Transformer segue la selezione (maniglie di scala agli angoli + rotazione).
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selected !== null ? nodeRefs.current.get(selected) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  });

  // Tastiera: Canc elimina la forma selezionata, Esc deseleziona (mai dentro un input).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') onSelect(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) onDelete(selected);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected, onSelect, onDelete]);

  const dragBound = (pos: Konva.Vector2d): Konva.Vector2d => ({
    x: Math.max(21 * k, Math.min(79 * k, pos.x)),
    y: Math.max(8 * k, Math.min(86 * k, pos.y)),
  });

  const r1 = (x: number) => Math.round(x * 2) / 2;

  return (
    <Stage
      width={size}
      height={(size * 92) / 100}
      scaleX={k}
      scaleY={k}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
      onTouchStart={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
    >
      <Layer>
        <Group clipFunc={bodyClip}>
          {decals.map((dc, i) => (
            <DecalNode
              key={`${i}-${dc.shape}`}
              dc={dc}
              nodeRef={(n) => {
                if (n) nodeRefs.current.set(i, n);
                else nodeRefs.current.delete(i);
              }}
              onSelect={() => onSelect(i)}
              dragBound={dragBound}
              onDragMove={(e) => {
                // Guida di centratura: calamita sull'asse x=50 della maglia.
                const x = e.target.x();
                if (Math.abs(x - 50) < 1.2) {
                  e.target.x(50);
                  setGuide(true);
                } else setGuide(false);
              }}
              onDragEnd={(e) => {
                setGuide(false);
                onChange(i, { x: r1(e.target.x()), y: r1(e.target.y()) });
              }}
              onTransformEnd={(e) => {
                const n = e.target;
                const scale = Math.max(0.35, Math.min(3.5, n.scaleX()));
                onChange(i, {
                  scale: Math.round(scale * 100) / 100,
                  rot: Math.round(n.rotation()),
                  x: r1(n.x()),
                  y: r1(n.y()),
                });
              }}
            />
          ))}
        </Group>
        {guide && (
          <Line
            points={[50, 10, 50, 87]}
            stroke="#ffffff"
            opacity={0.55}
            dash={[2, 2]}
            strokeWidth={0.5}
          />
        )}
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          anchorSize={7}
          anchorCornerRadius={2}
          anchorStroke={accent}
          anchorFill="#18181b"
          borderStroke={accent}
          borderDash={[3, 2]}
          rotateAnchorOffset={16}
          boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 3 ? oldBox : newBox)}
        />
      </Layer>
    </Stage>
  );
}
