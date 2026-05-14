import{c as $,j as i}from"./index-ycyTXq2x.js";/**
 * @license lucide-react v0.553.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],T=$("copy",j);/**
 * @license lucide-react v0.553.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],M=$("refresh-cw",w),W=({content:y,className:k})=>{const m=c=>{const d=a=>a.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/g).map((t,l)=>t.startsWith("***")&&t.endsWith("***")?i.jsx("strong",{className:"font-extrabold italic text-foreground",children:t.slice(3,-3)},l):t.startsWith("**")&&t.endsWith("**")?i.jsx("strong",{className:"font-bold text-foreground",children:t.slice(2,-2)},l):t.startsWith("*")&&t.endsWith("*")?i.jsx("em",{className:"italic text-foreground/80",children:t.slice(1,-1)},l):t),h=/\[([^\]]+)\]\(([^)]+)\)/g,s=[];let r=0,e;for(;(e=h.exec(c))!==null;)e.index>r&&s.push(...d(c.slice(r,e.index))),s.push(i.jsx("a",{href:e[2],target:"_blank",rel:"noopener noreferrer",className:"text-orange-500 hover:text-orange-400 font-medium underline decoration-orange-500/30 underline-offset-4 transition-colors",children:e[1]},e.index)),r=h.lastIndex;return r<c.length&&s.push(...d(c.slice(r))),s.length>0?s:d(c)},N=c=>{if(!c)return null;const h=c.replace(/([.!?])\s*(\**\d+\.)/g,`$1

$2`).replace(/([.!?])\s*([•\-*])\s/g,`$1

$2 `).replace(/([.!?])\s+(\*\*[^*]+\*\*)/g,`$1

$2`).replace(/^(##+)\s*([^#\n\s].+?)([A-Z][a-z]{3,}\b|\bHello\b|\bNamaste\b)/gm,`$1 $2

$3`).replace(/^(##+)([^\s#])/gm,"$1 $2").split(`
`),s=[];let r=[],e=null;const a=()=>{if(r.length>0){const t=`list-${s.length}`,l=e==="number"?"ol":"ul";s.push(i.jsx(l,{className:`ml-6 mb-4 mt-2 space-y-3 ${e==="number"?"list-decimal":"list-disc"} text-foreground`,children:r},t)),r=[],e=null}};return h.forEach((t,l)=>{const o=t.trim();if(!o){if(e)return;a(),s.push(i.jsx("div",{className:"h-2"},`spacer-${l}`));return}if(o.startsWith("##")&&o.length<120){a();const u=o.replace(/^##+\s*/,"");s.push(i.jsx("h2",{className:"text-[19px] font-black mt-8 mb-4 text-orange-500 border-b border-orange-500/10 pb-2 tracking-tight",children:m(u)},`h-${l}`));return}const p=/^[\*\-•]?\s*(\*\*)?\d+\./.test(o);if(!p&&/^[•\-*]/.test(o)||p){const u=p?"number":"bullet";e&&e!==u&&a(),e=u;let n=o,b="";for(;n!==b;)b=n,n=n.replace(/^[•\-*]\s*/,"").replace(/^(\*\*)?\d+\.\s*/,"").replace(/^(\*\*)?\s*/,"").trim();if(n.includes(":")){const g=n.indexOf(":");if(g<60){let x=n.substring(0,g),f=n.substring(g+1);x=x.replace(/\*\*/g,"").trim(),f=f.replace(/^\s*\*\*/,"").trim(),n=`**${x}:** ${f}`}}if(!n.trim()||n.trim()==="**")return;r.push(i.jsx("li",{className:"text-[16px] leading-relaxed text-foreground pl-1",children:m(n)},`li-${l}`));return}a(),s.push(i.jsx("p",{className:"text-[17px] leading-[1.8] mb-6 text-foreground/90 last:mb-0",children:m(o)},`p-${l}`))}),a(),s};return i.jsx("div",{className:`markdown-content ${k} selection:bg-orange-500/30 break-words whitespace-pre-wrap leading-[1.6]`,children:N(y)})};export{T as C,W as M,M as R};
