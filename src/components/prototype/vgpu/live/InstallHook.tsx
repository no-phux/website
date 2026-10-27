import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { SITE } from "../../../../lib/site";
import { desktopDownload, desktopFirstOpen, desktopInstall, installTargets, type InstallTarget } from "../../../../lib/install";
import type { HookMoment } from "./install-hook";
import "../../../../styles/mobile-access.css";

const canShare = () => typeof navigator!=="undefined" && typeof navigator.share==="function" && matchMedia("(hover: none)").matches;
// The homepage workspace lists shipped installers. The Mobile target stays on the
// landing picker, where the publish contract pins its request form.
const hookTargets = installTargets.filter((item) => item.id !== "mobile");

/** Install controls for the homepage workspace. CLI and Desktop only. */
export default function InstallHook({moment,onCopy,hookRef,copyRef}:{moment:HookMoment;onCopy:()=>void;hookRef:RefObject<HTMLElement|null>;copyRef:RefObject<HTMLButtonElement|null>}) {
  const [target,setTarget]=useState<InstallTarget>(hookTargets[0]);
  const [status,setStatus]=useState("");
  const [copied,setCopied]=useState(false);
  const code=useRef<HTMLElement>(null);
  const reset=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(reset.current),[]);
  const desktop=target.id==="desktop";
  const command=target.command;
  const choose=(next:InstallTarget)=>{setTarget(next);setStatus("");setCopied(false);};
  const step=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    const delta=event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:0;
    if(!delta)return;
    event.preventDefault();
    const next=hookTargets[(index+delta+hookTargets.length)%hookTargets.length];
    choose(next);
    (event.currentTarget.parentElement?.children[hookTargets.indexOf(next)] as HTMLElement|undefined)?.focus();
  };
  const copy=async(text:string)=>{
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);setStatus("Copied.");onCopy();
      clearTimeout(reset.current);reset.current=setTimeout(()=>setCopied(false),1800);
    } catch {
      // Leave the whole command selected so ⌘C / long-press still works.
      if(code.current)getSelection()?.selectAllChildren(code.current);
      setStatus(desktop?desktopInstall:"Press ⌘C / Ctrl+C to copy.");
    }
  };
  // From a phone, the computer is the real destination: send it the command or the download.
  const share=async()=>{
    try {await navigator.share(desktop?{title:"Phux for Mac",url:new URL(desktopDownload,SITE.url).href}:{title:"Install phux",text:command,url:SITE.url});onCopy();}
    catch {/* The visitor dismissed the share sheet. */}
  };
  return <section ref={hookRef} className="install-hook" data-moment={moment} aria-label="Install phux">
    <div className="install-hook-tabs" role="group" aria-label="Choose an install">
      {hookTargets.map((item,index)=><button key={item.id} type="button" aria-pressed={item.id===target.id} onClick={()=>choose(item)} onKeyDown={event=>step(event,index)}>{item.label}</button>)}
    </div>
    {desktop?<>
      <div className="install-hook-line install-hook-download">
        <span className="install-hook-prompt" aria-hidden="true">↓</span>
        <span className="install-hook-what">Phux for Apple-silicon Mac</span>
        <a className="install-hook-copy" href={desktopDownload} onClick={onCopy}>Download</a>
      </div>
      <p className="install-hook-status">
        <span role="status" aria-live="polite">{status||desktopFirstOpen}</span>
        <button ref={copyRef} type="button" className="install-hook-alt" onClick={()=>void copy(desktopInstall)} aria-label="Copy the Desktop install command">{copied?"Copied ✓":"Terminal install"}</button>
      </p>
    </>:<>
      <div className="install-hook-line" data-copied={copied}>
        <span className="install-hook-prompt" aria-hidden="true">$</span>
        <code ref={code} onClick={()=>void copy(command)}>{command}</code>
        <button ref={copyRef} type="button" className="install-hook-copy" onClick={()=>void copy(command)} aria-label={`Copy the ${target.label} install command`}>{copied?"Copied ✓":"Copy"}</button>
      </div>
      <p className="install-hook-status" role="status" aria-live="polite">{status}</p>
    </>}
    {canShare()&&<button type="button" className="install-hook-share" onClick={()=>void share()}>Share ↗</button>}
  </section>;
}
