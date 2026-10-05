import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../engine/api';
import type { Presentation, CommandLog, SlideObject, Slide } from '../types/presentation';
import SlideCanvas from '../components/SlideCanvas';
import VoiceCommandBar from '../components/VoiceCommandBar';

function readingText(obj:SlideObject){
  if(obj.type==='bullet_list') return (obj.data?.items||[]).join('. ');
  if(['title','subtitle','text'].includes(obj.type)) return obj.content||'';
  return '';
}
function wordIndexAtChar(text:string, char:number){
  const before=text.slice(0,char);
  return (before.match(/\S+/g)||[]).length-1;
}
function normalizeWord(word:string){return word.toLowerCase().replace(/[^a-z0-9'’-]/gi,'').replace(/[’]/g,"'")}
function speechTokens(slide:Slide){
  const out:{objectId:string;wordIndex:number;word:string}[]=[];
  for(const obj of slide.objects){
    if(obj.style.hidden||obj.style.deleted) continue;
    if(['title','subtitle','text'].includes(obj.type)){
      const words=obj.content.match(/[A-Za-z0-9]+(?:['’’-][A-Za-z0-9]+)*/g)||[];
      words.forEach((word,i)=>out.push({objectId:obj.id,wordIndex:i,word:normalizeWord(word)}));
    }else if(obj.type==='bullet_list'){
      let wi=0;
      for(const item of (obj.data?.items||[])){
        const words=String(item).match(/[A-Za-z0-9]+(?:['’’-][A-Za-z0-9]+)*/g)||[];
        words.forEach(word=>out.push({objectId:obj.id,wordIndex:wi++,word:normalizeWord(word)}));
      }
    }
  }
  return out;
}
function findSpeechMatch(tokens:{objectId:string;wordIndex:number;word:string}[], spoken:string[], cursor:number){
  if(!spoken.length||!tokens.length)return -1;
  const end=Math.min(tokens.length,cursor+80);
  for(let start=Math.max(0,cursor-2);start<end;start++){
    if(tokens[start].word!==spoken[0])continue;
    let j=0;
    while(j<spoken.length && start+j<tokens.length && tokens[start+j].word===spoken[j])j++;
    if(j>=Math.min(2,spoken.length) || (spoken.length===1&&j===1)) return start+j-1;
  }
  // If ASR slightly paraphrases a word, accept a close prefix match.
  for(let start=Math.max(0,cursor-2);start<end;start++){
    const a=tokens[start].word,b=spoken[0];
    if(a&&b&&(a.startsWith(b.slice(0,Math.max(3,b.length-1)))||b.startsWith(a.slice(0,Math.max(3,a.length-1))))) return start;
  }
  // When the presenter repeats a phrase or skips far ahead, search the whole slide.
  for(let start=0;start<tokens.length;start++){
    if(tokens[start].word!==spoken[0])continue;
    let j=0;while(j<spoken.length&&start+j<tokens.length&&tokens[start+j].word===spoken[j])j++;
    if(j>=Math.min(3,spoken.length))return start+j-1;
  }
  return -1;
}

export default function Presenter(){
 const {id}=useParams();const navigate=useNavigate();const [p,setP]=useState<Presentation|null>(null);const [idx,setIdx]=useState(0);const [seconds,setSeconds]=useState(0);const [ask,setAsk]=useState('');const [answer,setAnswer]=useState('');const [asking,setAsking]=useState(false);const [session,setSession]=useState<string|null>(null);const [qr,setQr]=useState<string|null>(null);const [joinUrl,setJoinUrl]=useState('');const [questions,setQuestions]=useState<any[]>([]);const [logs,setLogs]=useState<CommandLog[]>([]);const [practice,setPractice]=useState(false);const transcript=useRef('');const rec=useRef<any>(null);const started=useRef(0);const timestamps=useRef<any[]>([]);const [report,setReport]=useState<any>(null);
 const [reading,setReading]=useState(false); const [readingObjectId,setReadingObjectId]=useState<string|null>(null); const [readingWordIndex,setReadingWordIndex]=useState(-1); const [autoRead,setAutoRead]=useState(false); const readToken=useRef(0);
 const [liveSpeech,setLiveSpeech]=useState(false); const [speechObjectId,setSpeechObjectId]=useState<string|null>(null); const [speechWordIndex,setSpeechWordIndex]=useState(-1); const [speechText,setSpeechText]=useState(''); const speechCursor=useRef(0);
 useEffect(()=>{if(id)api.getPresentation(id).then(setP)},[id]); useEffect(()=>{const t=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(t)},[]);
 useEffect(()=>{if(!session)return;const t=setInterval(()=>api.getQuestions(session).then(setQuestions).catch(()=>{}),1500);return()=>clearInterval(t)},[session]);
 useEffect(()=>{resetLiveSpeech()},[idx]);
 useEffect(()=>()=>{readToken.current++;window.speechSynthesis?.cancel();try{(window as any).speechSynthesis?.cancel()}catch{}},[]);
 if(!p)return <div style={{padding:40}}>Loading…</div>; const slide=p.slides[idx];
 function resetLiveSpeech(){speechCursor.current=0;setSpeechObjectId(null);setSpeechWordIndex(-1);setSpeechText('')}
 function handleLiveSpeech(text:string,isFinal:boolean){
   if(!text.trim()){resetLiveSpeech();return;}
   setSpeechText(text.trim());
   const tokens=speechTokens(slide);
   const spoken=(text.match(/[A-Za-z0-9]+(?:['’’-][A-Za-z0-9]+)*/g)||[]).map(normalizeWord).filter(Boolean);
   const hit=findSpeechMatch(tokens,spoken,speechCursor.current);
   if(hit>=0){const t=tokens[hit];setSpeechObjectId(t.objectId);setSpeechWordIndex(t.wordIndex);if(isFinal)speechCursor.current=Math.min(tokens.length,hit+1);}
 }
 function go(n:number){const ni=Math.max(0,Math.min(p.slides.length-1,idx+n));if(ni!==idx){stopReading();resetLiveSpeech();if(practice){const last=timestamps.current.at(-1);if(last)last.leftAt=Date.now();timestamps.current.push({slideId:p.slides[ni].id,enteredAt:Date.now(),leftAt:Date.now()})}setIdx(ni);if(n>0&&autoRead)setTimeout(()=>startReading(p.slides[ni]),120)}}
 function startReading(targetSlide=slide){
   window.speechSynthesis?.cancel(); readToken.current++; const token=readToken.current; setReading(true); setReadingWordIndex(-1);
   const objects=targetSlide.objects.filter(o=>!o.style.hidden&&!o.style.deleted&&readingText(o)); let oi=0;
   const next=()=>{
     if(token!==readToken.current||oi>=objects.length){setReading(false);setReadingObjectId(null);setReadingWordIndex(-1);return;}
     const obj=objects[oi++]; const text=readingText(obj); setReadingObjectId(obj.id); setReadingWordIndex(0);
     const u=new SpeechSynthesisUtterance(text); u.rate=0.95; u.pitch=1; u.onboundary=(e:any)=>{if(token===readToken.current)setReadingWordIndex(wordIndexAtChar(text,Number(e.charIndex||0)));}; u.onend=()=>{setReadingWordIndex(-1);setTimeout(next,180)}; u.onerror=()=>next(); window.speechSynthesis.speak(u);
   }; next();
 }
 function stopReading(){readToken.current++;window.speechSynthesis?.cancel();setReading(false);setReadingObjectId(null);setReadingWordIndex(-1)}
 async function askAI(q=ask){if(!q.trim()||!id)return;setAsking(true);try{const r=await api.ask(id,`Current slide ${idx+1}: ${q}`);setAnswer(r.answer)}catch(e:any){setAnswer(e.message)}finally{setAsking(false)}}
 async function startSession(){if(!id)return;const r=await api.createSession(id);setSession(r.code);let origin=window.location.origin;try{const n=await api.network();if(n.urls?.[0])origin=n.urls[0]}catch{}const url=`${origin}/#/join/${r.code}`;setJoinUrl(url);setQr(await QRCode.toDataURL(url,{margin:1,color:{dark:'#000000',light:'#ffffff'}}))}
 async function copy(){if(joinUrl)await navigator.clipboard?.writeText(joinUrl)}
 function togglePractice(){if(!practice){transcript.current='';started.current=Date.now();timestamps.current=[{slideId:slide.id,enteredAt:Date.now(),leftAt:Date.now()}];const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(SR){const x=new SR();x.continuous=true;x.interimResults=false;x.lang='en-US';x.onresult=(e:any)=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)transcript.current+=' '+e.results[i][0].transcript};x.start();rec.current=x}setPractice(true)}else{rec.current?.stop();const last=timestamps.current.at(-1);if(last)last.leftAt=Date.now();api.analyzePractice({presentationId:id,transcript:transcript.current||'(no speech captured)',durationSeconds:Math.round((Date.now()-started.current)/1000),slideCount:p.slides.length,slideTimestamps:timestamps.current}).then(setReport);setPractice(false)}}
 return <div style={{display:'grid',gridTemplateColumns:'1fr 360px',height:'100vh'}}>
  <div style={{display:'flex',flexDirection:'column'}}>
   <div style={{padding:'10px 18px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><button className="btn btn-ghost" onClick={()=>navigate(`/editor/${id}`)}>← Editor</button><b>{p.title}</b><span className="pill">Slide {idx+1}/{p.slides.length}</span><span className="pill">{fmt(seconds)}</span><div style={{flex:1}}/><button className={`btn ${practice?'btn-danger':''}`} onClick={togglePractice}>{practice?'■ Stop practice':'● Practice'}</button><button className={`btn ${reading?'btn-danger':'btn-primary'}`} onClick={()=>reading?stopReading():startReading()}>{reading?'⏹ Stop reading':'🔊 Read slide'}</button><button className={`btn ${autoRead?'btn-primary':''}`} onClick={()=>setAutoRead(v=>!v)}>Auto-read {autoRead?'ON':'OFF'}</button>{liveSpeech&&<span className="pill on">🗣️ Live word tracking</span>}</div>
   <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}><SlideCanvas slide={slide} selectedObjectId={null} onSelect={()=>{}} scale={0.9} readOnly readingObjectId={liveSpeech?speechObjectId:readingObjectId} readingWordIndex={liveSpeech?speechWordIndex:readingWordIndex}/></div>
   <div style={{padding:'0 16px 10px'}}>{liveSpeech&&<div style={{fontSize:11,color:'var(--text-dim)',padding:'0 4px 6px'}}>Live transcript: <b style={{color:'var(--text)'}}>{speechText||'start speaking…'}</b></div>}<VoiceCommandBar presentation={p} currentSlideId={slide.id} selectedObjectId={null} onUpdate={setP} onLogs={setLogs} liveHighlight={liveSpeech} onLiveHighlightChange={setLiveSpeech} onSpeech={handleLiveSpeech} onContext={(c)=>{const s=p.slides.findIndex(x=>x.id===c.currentSlideId);if(s>=0)setIdx(s)}}/></div>
   <div style={{display:'flex',justifyContent:'center',gap:10,padding:12}}><button className="btn" onClick={()=>go(-1)} disabled={idx===0}>← Prev</button><button className="btn btn-primary" onClick={()=>go(1)} disabled={idx===p.slides.length-1}>Next →</button></div>
   {report&&<div className="card" style={{margin:'0 16px 16px'}}><b>Practice report</b><div style={{fontSize:12,color:'var(--text-dim)',marginTop:5}}>{report.wordCount} words · {report.wpm} wpm · {report.totalFillers} filler words · {report.repeatedSentences} repeats</div></div>}
  </div>
  <div style={{borderLeft:'1px solid var(--border)',padding:16,overflowY:'auto'}}>
   <Section title="Next slide"><div style={{fontSize:13,color:'var(--text-dim)'}}>{p.slides[idx+1]?.objects.find(o=>o.type==='title')?.content||'End of presentation'}</div></Section>
   <Section title="Speaker notes"><div style={{fontSize:13,whiteSpace:'pre-wrap'}}>{slide.speakerNotes||'(no notes)'}</div></Section>
   <Section title="AI co-presenter"><div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>{['What should I say next?','Give me a 10-second explanation','Explain this simply','Explain this technically'].map(x=><button className="btn" key={x} style={{fontSize:10}} onClick={()=>{setAsk(x);askAI(x)}}>{x}</button>)}</div><div style={{display:'flex',gap:6}}><input className="input" value={ask} onChange={e=>setAsk(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askAI()} placeholder="Ask about this slide…"/><button className="btn btn-primary" onClick={askAI}>{asking?'…':'Ask'}</button></div>{answer&&<div style={{fontSize:12,marginTop:8,color:'var(--text-dim)'}}>{answer}</div>}</Section>
   <Section title="Live audience">{!session?<button className="btn btn-primary" style={{width:'100%'}} onClick={startSession}>Start audience + QR</button>:<div>{qr&&<img src={qr} alt="Audience QR" style={{width:'100%',background:'#fff',padding:8,borderRadius:10}}/>}<div style={{textAlign:'center',fontSize:26,fontWeight:800,letterSpacing:5,margin:'8px 0'}}>{session}</div><button className="btn" style={{width:'100%',marginBottom:8}} onClick={copy}>Copy join link</button><div style={{fontSize:10,color:'var(--text-dim)',marginBottom:8}}>Use the LAN URL in the QR, not localhost. If a phone cannot connect, allow Node/Vite through Windows Firewall and keep both devices on the same Wi‑Fi.</div><b style={{fontSize:12}}>Questions ({questions.length})</b>{questions.map(q=><div key={q.id} style={{fontSize:12,padding:'7px 0',borderBottom:'1px solid var(--border)'}}>{q.question}</div>)}</div>}</Section>
   {logs.length>0&&<Section title="Voice activity"><div style={{fontSize:11,color:'var(--text-dim)'}}>{logs.slice(-8).map((l,i)=><div key={i}>→ {l.message}</div>)}</div></Section>}
  </div>
 </div>
}
function fmt(s:number){return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`}
function Section({title,children}:{title:string;children:React.ReactNode}){return <div style={{marginBottom:22}}><div style={{fontWeight:700,fontSize:12,marginBottom:8,color:'var(--text-dim)',textTransform:'uppercase'}}>{title}</div>{children}</div>}
