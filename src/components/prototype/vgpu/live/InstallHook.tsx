import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { SITE } from "../../../../lib/site";
import { installTargets, type InstallTarget } from "../../../../lib/install";
import { wireBetaRequest } from "../../../../lib/beta";
import type { HookMoment } from "./install-hook";

const canShare = () => typeof navigator!=="undefined" && typeof navigator.share==="function" && matchMedia("(hover: none)").matches;

function TestFlightRequest() {
  const form=useRef<HTMLFormElement>(null),note=useRef<HTMLParagraphElement>(null);
  useEffect(()=>wireBetaRequest(form.current,note.current),[]);
  return <>
    <form ref={form} className="install-hook-line install-hook-request">
      <input type="email" name="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="Apple email" aria-label="Email address for the TestFlight invite"/>
      <input className="install-hook-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
      <button type="submit" aria-label="Request access">↵</button>
    </form>
    <p ref={note} className="install-hook-status" role="status" aria-live="polite"/>
  </>;
}

/** Install controls; explanatory detail stays in the installation guide. */
export default function InstallHook({moment,onCopy,hookRef,copyRef}:{moment:HookMoment;onCopy:()=>void;hookRef:RefObject<HTMLElement|null>;copyRef:RefObject<HTMLButtonElement|null>}) {
  const [target,setTarget]=useState<InstallTarget>(installTargets[0]);
  const [status,setStatus]=useState("");
  const [copied,setCopied]=useState(false);
  const code=useRef<HTMLElement>(null);
  const reset=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(reset.current),[]);
  const mobile=target.id==="mobile";
  const command=target.command;
  const choose=(next:InstallTarget)=>{setTarget(next);setStatus("");setCopied(false);};
  const step=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    const delta=event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:0;
    if(!delta)return;
    event.preventDefault();
    const next=installTargets[(index+delta+installTargets.length)%installTargets.length];
    choose(next);
    (event.currentTarget.parentElement?.children[installTargets.indexOf(next)] as HTMLElement|undefined)?.focus();
  };
  const copy=async()=>{
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);setStatus("Copied.");onCopy();
      clearTimeout(reset.current);reset.current=setTimeout(()=>setCopied(false),1800);
    } catch {
      // Leave the whole command selected so ⌘C / long-press still works.
      if(code.current)getSelection()?.selectAllChildren(code.current);
      setStatus("Press ⌘C / Ctrl+C to copy.");
    }
  };
  const share=async()=>{
    try {await navigator.share({title:"Install phux",text:command,url:SITE.url});onCopy();}
    catch {/* The visitor dismissed the share sheet. */}
  };
  return <section ref={hookRef} className="install-hook" data-moment={moment} aria-label="Install phux">
    <div className="install-hook-tabs" role="group" aria-label="Choose an install">
      {installTargets.map((item,index)=><button key={item.id} type="button" aria-pressed={item.id===target.id} onClick={()=>choose(item)} onKeyDown={event=>step(event,index)}>{item.id==="mobile"?"iPhone":item.label}</button>)}
    </div>
    {mobile?<TestFlightRequest/>:<>
      <div className="install-hook-line" data-copied={copied}>
        <span className="install-hook-prompt" aria-hidden="true">$</span>
        <code ref={code} onClick={()=>void copy()}>{command}</code>
        <button ref={copyRef} type="button" className="install-hook-copy" onClick={()=>void copy()} aria-label={`Copy the ${target.label} install command`}>{copied?"Copied ✓":"Copy"}</button>
      </div>
      <p className="install-hook-status" role="status" aria-live="polite">{status}</p>
    </>}
    {!mobile&&canShare()&&<button type="button" className="install-hook-share" onClick={()=>void share()}>Share ↗</button>}
  </section>;
}
