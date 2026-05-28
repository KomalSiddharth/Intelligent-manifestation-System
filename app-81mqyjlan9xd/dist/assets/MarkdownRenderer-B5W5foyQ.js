import{d as f,j as r}from"./index-B9sd6hig.js";/**
 * @license lucide-react v0.553.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],W=f("chevron-left",L);/**
 * @license lucide-react v0.553.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],v=f("send",_);/**
 * @license lucide-react v0.553.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],C=f("shield-check",T),z=({content:$,className:N})=>{const h=u=>{const m=[],s=u.replace(/\[([^\]]+)\]\(([^)]+)\)/g,t=>{const e=m.length;return m.push(t),`\0LINK${e}\0`}).replace(/(^|[\s(])((https?:\/\/[^\s<>"')\]]+))/gi,(t,e,d)=>`${e}[${d}](${d})`).replace(/\x00LINK(\d+)\x00/g,(t,e)=>m[Number(e)]),o=t=>t.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/g).map((e,d)=>e.startsWith("***")&&e.endsWith("***")?r.jsx("strong",{className:"font-extrabold italic text-foreground",children:e.slice(3,-3)},d):e.startsWith("**")&&e.endsWith("**")?r.jsx("strong",{className:"font-bold text-foreground",children:e.slice(2,-2)},d):e.startsWith("*")&&e.endsWith("*")?r.jsx("em",{className:"italic text-foreground/80",children:e.slice(1,-1)},d):e),n=/\[([^\]]+)\]\(([^)]+)\)/g,l=[];let a=0,i;for(;(i=n.exec(s))!==null;){i.index>a&&l.push(...o(s.slice(a,i.index)));const t=i[2].trim(),e=/^https?:\/\//i.test(t)?t:`https://${t}`;l.push(r.jsx("a",{href:e,target:"_blank",rel:"noopener noreferrer",className:"text-orange-500 hover:text-orange-400 font-medium underline decoration-orange-500/30 underline-offset-4 transition-colors",children:i[1]},i.index)),a=n.lastIndex}return a<s.length&&l.push(...o(s.slice(a))),l.length>0?l:o(s)},j=u=>{if(!u)return null;const g=u.replace(/([.!?])\s*(\**\d+\.)/g,`$1

$2`).replace(/([.!?])\s*([•\-*])\s/g,`$1

$2 `).replace(/([.!?])\s+(\*\*[^*]+\*\*)/g,`$1

$2`).replace(/^(##+)\s*([^#\n\s].+?)([A-Z][a-z]{3,}\b|\bHello\b|\bNamaste\b)/gm,`$1 $2

$3`).replace(/^(##+)([^\s#])/gm,"$1 $2").split(`
`),s=[];let o=[],n=null;const l=()=>{if(o.length>0){const a=`list-${s.length}`;n==="number"?s.push(r.jsx("ol",{className:"ml-5 mb-2 mt-1 space-y-1 list-decimal text-foreground",children:o},a)):n==="emoji"?s.push(r.jsx("ul",{className:"ml-1 mb-2 mt-1 space-y-1 list-none text-foreground",children:o},a)):s.push(r.jsx("ul",{className:"ml-5 mb-2 mt-1 space-y-1 list-disc text-foreground",children:o},a)),o=[],n=null}};return g.forEach((a,i)=>{const t=a.trim();if(!t){if(n)return;l(),s.push(r.jsx("div",{className:"h-1"},`spacer-${i}`));return}if(t.startsWith("##")&&t.length<120){l();const p=t.replace(/^##+\s*/,"");s.push(r.jsx("h2",{className:"text-[18px] font-black mt-5 mb-2 text-orange-500 border-b border-orange-500/10 pb-1.5 tracking-tight",children:h(p)},`h-${i}`));return}const e=/^[\*\-•]?\s*(\*\*)?\d+\./.test(t),d=!e&&/^[✅☑✓✔️\u{1F539}\u{1F538}\u{1F7E2}\u{1F535}→➤▸►◆●]/u.test(t),k=!e&&!d&&/^[•\-*]/.test(t);if(d){n&&n!=="emoji"&&l(),n="emoji",o.push(r.jsx("li",{className:"text-[15px] leading-snug text-foreground pl-1",children:h(t)},`li-${i}`));return}if(k||e){const p=e?"number":"bullet";n&&n!==p&&l(),n=p;let c=t,b="";for(;c!==b;)b=c,c=c.replace(/^[•\-*]\s*/,"").replace(/^(\*\*)?\d+\.\s*/,"").replace(/^(\*\*)?\s*/,"").trim();if(c.includes(":")){const x=c.indexOf(":");if(x<60){let w=c.substring(0,x).replace(/\*\*/g,"").trim(),y=c.substring(x+1).replace(/^\s*\*\*/,"").trim();c=`**${w}:** ${y}`}}if(!c.trim()||c.trim()==="**")return;o.push(r.jsx("li",{className:"text-[15px] leading-snug text-foreground pl-1",children:h(c)},`li-${i}`));return}l(),s.push(r.jsx("p",{className:"text-[16px] leading-[1.65] mb-2 text-foreground/90 last:mb-0",children:h(t)},`p-${i}`))}),l(),s};return r.jsx("div",{className:`markdown-content ${N} selection:bg-orange-500/30 break-words whitespace-pre-wrap leading-[1.5]`,children:j($)})};export{W as C,z as M,C as S,v as a};
