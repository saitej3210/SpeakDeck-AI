import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';

function dataUrlToBuffer(src=''){
  const m=String(src).match(/^data:([^;]+);base64,(.+)$/s); return m?Buffer.from(m[2],'base64'):null;
}

export async function exportToPptx(presentation){
 const pres=new PptxGenJS();pres.defineLayout({name:'SD_16x9',width:13.33,height:7.5});pres.layout='SD_16x9';
 for(const slide of presentation.slides){const s=pres.addSlide();s.background={color:(slide.background||'#0b0b0d').replace('#','')};
  for(const obj of slide.objects){if(obj.style.hidden||obj.style.deleted)continue;const x=obj.style.x/90,y=obj.style.y/90,w=obj.style.w/90,h=obj.style.h/90;
   if(obj.type==='image'&&obj.data?.src){try{s.addImage({data:obj.data.src,x,y,w,h});}catch{s.addShape('rect',{x,y,w,h,fill:{color:'2a2a2e'},line:{color:'555555'}})}}
   else if(obj.type==='title')s.addText(obj.content||'',{x,y,w,h,fontSize:28,bold:true,color:'FFFFFF',breakLine:false});
   else if(obj.type==='text')s.addText(obj.content||'',{x,y,w,h,fontSize:16,color:'E5E5E7',fit:'shrink'});
   else if(obj.type==='bullet_list'){const items=(obj.data?.items||[]).map(t=>({text:t,options:{bullet:true}}));s.addText(items,{x,y,w,h,fontSize:16,color:'E5E5E7',fit:'shrink'});}
   else if(obj.type==='shape')s.addShape('roundRect',{x,y,w,h,fill:{color:'233044',transparency:10},line:{color:'6ee7ff'}});
   else if(obj.type==='chart'||obj.type==='diagram'||obj.type==='video'||obj.type==='audio'){s.addShape('rect',{x,y,w,h,fill:{color:'2a2a2e'},line:{color:'555555'}});s.addText(obj.content||obj.type,{x,y,w,h,fontSize:12,color:'999999',align:'center',valign:'mid'});}
  }
  if(slide.speakerNotes)s.addNotes(slide.speakerNotes);
 }
 return pres.write('nodebuffer');
}

export function exportToPdf(presentation){return new Promise((resolve,reject)=>{const doc=new PDFDocument({size:[960,540],margin:20});const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 presentation.slides.forEach((slide,i)=>{if(i>0)doc.addPage({size:[960,540],margin:20});doc.rect(0,0,960,540).fill(slide.background||'#0b0b0d');
  for(const obj of slide.objects){if(obj.style.hidden||obj.style.deleted)continue;const x=obj.style.x*0.75,y=obj.style.y*0.75,w=obj.style.w*0.75,h=obj.style.h*0.75;
   if(obj.type==='image'&&obj.data?.src){const b=dataUrlToBuffer(obj.data.src);if(b){try{doc.image(b,x,y,{width:w,height:h,fit:[w,h]});}catch{doc.rect(x,y,w,h).strokeColor('#555').stroke();}}}
   else if(obj.type==='title')doc.fontSize(28).fillColor('#fff').text(obj.content||'',x,y,{width:w,height:h});
   else if(obj.type==='text')doc.fontSize(16).fillColor('#d5d5d7').text(obj.content||'',x,y,{width:w,height:h});
   else if(obj.type==='bullet_list'){doc.fontSize(16).fillColor('#d5d5d7');let yy=y;for(const item of obj.data?.items||[]){doc.text(`• ${item}`,x+8,yy,{width:w-8});yy+=22;}}
   else {doc.rect(x,y,w,h).strokeColor('#555').stroke();doc.fontSize(10).fillColor('#999').text(obj.content||obj.type,x,y+h/2-6,{width:w,align:'center'});}
  }
 });doc.end();});}

export function exportTranscript(presentation){let out=`${presentation.title}\n\n`;for(const slide of presentation.slides){out+=`--- Slide ${slide.index} ---\n`;for(const obj of slide.objects){if(obj.type==='title')out+=`TITLE: ${obj.content}\n`;else if(obj.type==='text')out+=`${obj.content}\n`;else if(obj.type==='bullet_list')out+=(obj.data?.items||[]).map(i=>`- ${i}`).join('\n')+'\n';else if(obj.type==='image')out+=`IMAGE: ${obj.content||obj.id}\n`;}if(slide.speakerNotes)out+=`NOTES: ${slide.speakerNotes}\n`;out+='\n';}return out;}
