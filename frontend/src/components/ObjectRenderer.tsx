import { useRef } from 'react';
import type { SlideObject } from '../types/presentation';

function cropDefaults(obj: SlideObject) {
  return { x: Number(obj.data?.crop?.x ?? 0), y: Number(obj.data?.crop?.y ?? 0), w: Number(obj.data?.crop?.w ?? 100), h: Number(obj.data?.crop?.h ?? 100) };
}

function tokenize(text:string){ return text.split(/(\s+)/); }
function highlightedText(text:string, active:number, activeOn:boolean){
  if(!activeOn || active < 0) return text;
  let word=0;
  return tokenize(text).map((part,i)=>{
    if(/^\s+$/.test(part)) return <span key={i}>{part}</span>;
    const idx=word++;
    return <span key={i} style={{background:idx===active?'rgba(255,209,102,.95)':'transparent',color:idx===active?'#08080a':'inherit',borderRadius:4,padding:idx===active?'1px 3px':'0',boxShadow:idx===active?'0 0 18px rgba(255,209,102,.45)':'none',transition:'background .08s ease'}}>{part}</span>;
  });
}

export default function ObjectRenderer({ obj, selected, onSelect, onChange, scale=1, readOnly=false, readingActive=false, readingWordIndex=-1 }: {
  obj: SlideObject; selected:boolean; onSelect:(id:string)=>void; onChange:(obj:SlideObject)=>void; scale?:number; readOnly?:boolean;
  readingActive?:boolean; readingWordIndex?:number;
}) {
  if (obj.style.deleted || obj.style.hidden) return null;
  const dragRef = useRef<any>(null);
  const base: React.CSSProperties = {
    position:'absolute', left:obj.style.x*scale, top:obj.style.y*scale, width:obj.style.w*scale, height:obj.style.h*scale,
    transform:`rotate(${obj.style.rotation||0}deg) scale(${obj.style.zoom||1})`, fontSize:obj.style.fontSize*scale,
    fontWeight:obj.style.bold?700:400, fontStyle:obj.style.italic?'italic':'normal', textDecoration:obj.style.underline?'underline':'none',
    textAlign:obj.style.align as any, color:obj.style.color, zIndex:obj.style.zIndex, outline:selected?'2px solid #6ee7ff':obj.style.highlighted?'2px solid #ffd166':readingActive?'2px solid rgba(255,209,102,.75)':'none',
    outlineOffset:4, background:obj.style.highlighted?'rgba(255,209,102,.08)':'transparent', borderRadius:8, padding:4, cursor:readOnly?'default':'grab', overflow:'hidden', transition:dragRef.current?'none':'all .18s ease',
  };
  const updatePosition = (dx:number,dy:number,w?:number,h?:number) => {
    const next=JSON.parse(JSON.stringify(obj)); next.style.x=Math.max(0,Math.min(1200-next.style.w,dragRef.current.x+dx/scale)); next.style.y=Math.max(0,Math.min(675-next.style.h,dragRef.current.y+dy/scale));
    if(w!==undefined) next.style.w=Math.max(40,Math.min(1200-next.style.x,w));
    if(h!==undefined) next.style.h=Math.max(30,Math.min(675-next.style.y,h));
    onChange(next);
  };
  const pointerDown=(e:React.PointerEvent, resize=false)=>{
    if(readOnly) { e.stopPropagation(); onSelect(obj.id); return; }
    e.stopPropagation(); onSelect(obj.id); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current={sx:e.clientX,sy:e.clientY,x:obj.style.x,y:obj.style.y,w:obj.style.w,h:obj.style.h,resize};
  };
  const pointerMove=(e:React.PointerEvent)=>{ const d=dragRef.current; if(!d) return; const dx=(e.clientX-d.sx)/scale, dy=(e.clientY-d.sy)/scale; if(d.resize) updatePosition(0,0,d.w+dx,d.h+dy); else updatePosition(dx,dy); };
  const pointerUp=()=>{dragRef.current=null;};
  const wrap=(child:React.ReactNode)=> <div style={base} onPointerDown={(e)=>pointerDown(e)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={(e)=>{e.stopPropagation();onSelect(obj.id)}} data-object-id={obj.id}>{child}{selected&&!readOnly&&<div onPointerDown={(e)=>pointerDown(e,true)} style={{position:'absolute',right:1,bottom:1,width:14,height:14,borderRadius:3,background:'#6ee7ff',cursor:'nwse-resize',zIndex:999}}/>}</div>;

  switch(obj.type){
    case 'title': case 'subtitle': case 'text': return wrap(<div style={{whiteSpace:'pre-wrap'}}>{highlightedText(obj.content, readingWordIndex, readingActive)}</div>);
    case 'bullet_list': return wrap(<ul style={{margin:0,paddingLeft:24*scale}}>{(obj.data?.items||[]).map((it:string,i:number)=>{ const prior=(obj.data?.items||[]).slice(0,i).join(' '); const offset=tokenize(prior).filter(x=>!/^\s+$/.test(x)).length; return <li key={i} style={{marginBottom:Math.max(4,scale*4)}}>{highlightedText(it, readingWordIndex-offset, readingActive)}</li>; })}</ul>);
    case 'image': {
      const crop=cropDefaults(obj); const src=obj.data?.src;
      return wrap(src ? <img src={src} alt={obj.content||'slide image'} draggable={false} style={{position:'absolute',left:`-${crop.x/crop.w*100}%`,top:`-${crop.y/crop.h*100}%`,width:`${100/crop.w*100}%`,height:`${100/crop.h*100}%`,maxWidth:'none',objectFit:'fill',userSelect:'none'}}/> : <div style={{height:'100%',display:'grid',placeItems:'center',background:'#1a1a1e',color:'#888'}}>🖼️ {obj.content||'Image'}</div>);
    }
    case 'chart': case 'diagram': return wrap(<div style={{height:'100%',display:'grid',placeItems:'center',background:'#1a1a1e',color:'#888'}}>{obj.type==='chart'?'📊':'🗺️'} {obj.content||obj.type}</div>);
    case 'video': return wrap(<div style={{height:'100%',display:'grid',placeItems:'center',background:'#1a1a1e',color:'#aaa'}}>▶️ {obj.data?.playback?.state==='playing'?'Playing':'Paused'} video</div>);
    case 'audio': return wrap(<div style={{height:'100%',display:'grid',placeItems:'center',background:'#1a1a1e',color:'#aaa'}}>🔊 {obj.data?.playback?.state==='playing'?'Playing':'Paused'} audio</div>);
    default: return wrap(<div>{obj.content}</div>);
  }
}
