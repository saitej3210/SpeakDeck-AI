import { useEffect, useRef, useState } from 'react';
import { api } from '../engine/api';
import type { Presentation, CommandLog } from '../types/presentation';

function speakLogs(logs:CommandLog[], p:Presentation){
 if(typeof window==='undefined'||!window.speechSynthesis)return;
 logs.filter(l=>l.intent==='read_aloud'&&l.objectId).forEach(l=>{for(const s of p.slides){const o=s.objects.find(x=>x.id===l.objectId);if(o){const text=o.content||(o.data?.items||[]).join('. ');if(text)window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));}}});
}

function looksLikeCommand(text:string){
 const t=text.trim().toLowerCase();
 return /^(assistant|command|please\s+)?(make|move|resize|enlarge|shrink|hide|show|highlight|unhighlight|zoom|crop|rotate|delete|remove|duplicate|replace|bring|send|set|change|turn|play|pause|go|next|previous|read|explain|summarize|simplify|rewrite|translate|add|remove|switch|open|close|fullscreen|full\s*screen)\b/.test(t);
}

export default function VoiceCommandBar({presentation,currentSlideId,selectedObjectId,onUpdate,onLogs,onContext,liveHighlight=false,onLiveHighlightChange,onSpeech}:{presentation:Presentation;currentSlideId:string;selectedObjectId:string|null;onUpdate:(p:Presentation)=>void;onLogs:(l:CommandLog[])=>void;onContext?:(c:any)=>void;liveHighlight?:boolean;onLiveHighlightChange?:(value:boolean)=>void;onSpeech?:(text:string,isFinal:boolean)=>void}){
 const [listening,setListening]=useState(false),[continuous,setContinuous]=useState(false),[typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[last,setLast]=useState('');
 const recognitionRef=useRef<any>(null), restartRef=useRef(false), lastObjectRef=useRef<string|null>(null);
 const supported=typeof window!=='undefined'&&((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition);
 useEffect(()=>()=>{restartRef.current=false;try{recognitionRef.current?.stop()}catch{}},[]);
 useEffect(()=>{
   if(!liveHighlight && !continuous){ restartRef.current=false; try{recognitionRef.current?.stop()}catch{} setListening(false); }
 },[liveHighlight,continuous]);
 function buildRecognition(){
   if(!supported)return null;
   const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
   const rec=new SR();
   rec.continuous=true;
   rec.interimResults=Boolean(liveHighlight);
   rec.lang='en-US';
   rec.onresult=(e:any)=>{
     for(let i=e.resultIndex;i<e.results.length;i++){
       const result=e.results[i];
       const text=result?.[0]?.transcript||'';
       if(!text.trim())continue;
       const isFinal=Boolean(result.isFinal);
       setLast(text.trim());
       onSpeech?.(text.trim(),isFinal);
       if(isFinal && (continuous || (liveHighlight && looksLikeCommand(text)))) sendCommand(text);
     }
   };
   rec.onend=()=>{
     if(restartRef.current){
       setTimeout(()=>{try{rec.start();setListening(true)}catch{}},180);
     }else setListening(false);
   };
   rec.onerror=(e:any)=>{
     if(e?.error==='not-allowed'||e?.error==='service-not-allowed'){restartRef.current=false;setListening(false);onLogs([{intent:'error',message:'Microphone permission is blocked. Allow microphone access for localhost and try again.'}]);return;}
     if(restartRef.current)setTimeout(()=>{try{rec.start();setListening(true)}catch{}},450); else setListening(false);
   };
   return rec;
 }
 function ensureRecognition(){
   if(!recognitionRef.current)recognitionRef.current=buildRecognition();
   return recognitionRef.current;
 }
 function restartRecognition(){
   try{recognitionRef.current?.stop()}catch{}
   recognitionRef.current=null;
   setTimeout(()=>{if(restartRef.current){const r=ensureRecognition();try{r?.start();setListening(true)}catch{}}},100);
 }
 function toggleContinuous(){
   const next=!continuous;
   setContinuous(next);
   restartRef.current=next||liveHighlight;
   if(restartRef.current){restartRecognition();}
   else{try{recognitionRef.current?.stop()}catch{}setListening(false);onSpeech?.('',true);}
 }
 function toggleLiveHighlight(){
   const next=!liveHighlight;
   onLiveHighlightChange?.(next);
   if(!next && !continuous){restartRef.current=false;try{recognitionRef.current?.stop()}catch{}setListening(false);onSpeech?.('',true);}
 }
 useEffect(()=>{
   if((liveHighlight||continuous)&&supported){restartRef.current=true;restartRecognition();}
   // eslint-disable-next-line react-hooks/exhaustive-deps
 },[liveHighlight]);
 function startOnce(){
   if(!recognitionRef.current)recognitionRef.current=buildRecognition();
   restartRef.current=false;
   try{recognitionRef.current?.start();setListening(true)}catch{}
 }
 async function sendCommand(transcript:string){
   if(!transcript.trim())return;
   setBusy(true);
   try{
     const r=await api.sendCommand({presentationId:presentation.id,currentSlideId,selectedObjectId,lastObjectId:lastObjectRef.current,transcript});
     onUpdate(r.presentation);onLogs(r.logs||[]);lastObjectRef.current=r.context?.lastObjectId||lastObjectRef.current;onContext?.(r.context);speakLogs(r.logs||[],r.presentation);
   }catch(e:any){onLogs([{intent:'error',message:e.message}])}finally{setBusy(false)}
 }
 return <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'var(--graphite)',border:'1px solid var(--border)',borderRadius:12,flexWrap:'wrap'}}>
  <button className="btn" onClick={startOnce} disabled={!supported||busy} title={supported?'Speak one command':'Use Chrome for microphone speech'}>🎙️</button>
  <button className="btn" onClick={toggleContinuous} style={{borderColor:continuous?'var(--accent)':undefined}} disabled={!supported}>{continuous?'⏹ Stop continuous':'∞ Continuous voice'}</button>
  {onLiveHighlightChange&&<button className="btn" onClick={toggleLiveHighlight} style={{borderColor:liveHighlight?'#ffd166':undefined,background:liveHighlight?'rgba(255,209,102,.10)':undefined}} disabled={!supported}>🗣️ {liveHighlight?'Stop live highlight':'Live speech highlight'}</button>}
  <input className="input" style={{flex:1,minWidth:220}} placeholder={supported?'Try: "make the second image bigger and move it right"':'Voice unsupported — type your command'} value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&typed.trim()){sendCommand(typed);setTyped('')}}}/>
  <button className="btn btn-primary" disabled={busy||!typed.trim()} onClick={()=>{sendCommand(typed);setTyped('')}}>{busy?'…':'Run'}</button>
  {listening&&<span className="pill on">{liveHighlight?'tracking speech…':'listening…'}</span>}{last&&!listening&&<span className="pill">“{last}”</span>}
 </div>
}
