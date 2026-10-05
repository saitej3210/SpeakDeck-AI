import { useRef } from 'react';
import type { Slide, SlideObject } from '../types/presentation';
import ObjectRenderer from './ObjectRenderer';

export default function SlideCanvas({ slide, selectedObjectId, onSelect, onObjectChange, scale = 1, readOnly = false, readingObjectId = null, readingWordIndex = -1 }: {
  slide: Slide; selectedObjectId: string | null; onSelect: (id: string | null) => void;
  onObjectChange?: (obj: SlideObject) => void; scale?: number; readOnly?: boolean;
  readingObjectId?: string | null; readingWordIndex?: number;
}) {
  const changedRef = useRef(false);
  return (
    <div
      onClick={() => { if (!changedRef.current) onSelect(null); changedRef.current = false; }}
      style={{ position:'relative', width:1200*scale, height:675*scale, background:slide.background||'#0b0b0d', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', margin:'0 auto', boxShadow:'0 20px 60px rgba(0,0,0,.4)' }}
    >
      {slide.objects.map((obj) => (
        <ObjectRenderer key={obj.id} obj={obj} selected={obj.id===selectedObjectId} onSelect={(id)=>onSelect(id)}
          onChange={(next)=>{ changedRef.current=true; onObjectChange?.(next); }} scale={scale} readOnly={readOnly}
          readingActive={obj.id===readingObjectId} readingWordIndex={obj.id===readingObjectId ? readingWordIndex : -1}/>
      ))}
    </div>
  );
}
