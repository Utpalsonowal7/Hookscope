export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api${path}`,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers}});
  if(!response.ok){const data=await response.json().catch(()=>({error:'Server unavailable'}));if(response.status===401)window.dispatchEvent(new Event('session:expired'));throw new ApiError(data.error||'Request failed',response.status);}
  return response.status===204?undefined as T:response.json();
}
export const formatBytes=(n:number)=>n<1024?`${n} B`:`${(n/1024).toFixed(1)} KB`;
export const time=(value:string)=>new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function pretty(value:string){try{return JSON.stringify(JSON.parse(value),null,2);}catch{return value;}}
export async function copy(value:string){await navigator.clipboard.writeText(value);}
export function download(name:string,content:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
