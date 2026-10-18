import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import release from "../../../../lib/release.json";
import { SITE } from "../../../../lib/site";
import { dryRun, installScriptSource, installTargets, type InstallTarget } from "../../../../lib/install";
import { wireBetaRequest } from "../../../../lib/beta";
import { copiedNote, hookLede, type HookMoment } from "./install-hook";

const day = new Intl.DateTimeFormat("en",{month:"short",day:"numeric",timeZone:"UTC"});
const released = release.publishedAt ? day.format(new Date(release.publishedAt)) : "";
const canShare = () => typeof navigator!=="undefined" && typeof navigator.share==="function" && matchMedia("(hover: none)").matches;

function TestFlightRequest() {
  const form=useRef<HTMLFormElement>(null),note=useRef<HTMLParagraphElement>(null);
  useEffect(()=>wireBetaRequest(form.current,note.current),[]);
  return <>
    <form ref={form} className="install-hook-request">
      <input type="email" name="email" required autoComplete="email" placeholder="Apple Account email" aria-label="Email address for the TestFlight invite"/>
      <input className="install-hook-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
      <button type="submit">Request access</button>
    </form>
    <p ref={note} className="install-hook-status" role="status" aria-live="polite"/>
  </>;
}

/** The demo's one call to action: a real command, the proof behind it, and a copy that cannot miss. */
export default function InstallHook({moment,live,onCopy,hookRef,copyRef}:{moment:HookMoment;live:boolean;onCopy:()=>void;hookRef:RefObject<HTMLElement|null>;copyRef:RefObject<HTMLButtonElement|null>}) {
  const [target,setTarget]=useState<InstallTarget>(installTargets[0]);
  const [preview,setPreview]=useState(false);
  const [status,setStatus]=useState("");
  const [copied,setCopied]=useState(false);
  const code=useRef<HTMLElement>(null);
  const reset=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(reset.current),[]);
  const mobile=target.id==="mobile";
  const command=preview?dryRun(target.command):target.command;
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
      setCopied(true);setStatus(copiedNote(target.id==="desktop"?"desktop":"cli",preview));onCopy();
      clearTimeout(reset.current);reset.current=setTimeout(()=>setCopied(false),1800);
    } catch {
      // Leave the whole command selected so ⌘C / long-press still works.
      if(code.current)getSelection()?.selectAllChildren(code.current);
      setStatus("Selected. Press ⌘C (Ctrl+C) to copy.");
    }
  };
  const share=async()=>{
    try {await navigator.share({title:"Install phux",text:command,url:SITE.url});onCopy();}
    catch {/* The visitor dismissed the share sheet. */}
  };
  return <section ref={hookRef} className="install-hook" data-moment={moment} aria-labelledby="install-hook-lede">
    <p className="install-hook-lede" id="install-hook-lede">{hookLede(moment,live)}</p>
    <div className="install-hook-tabs" role="group" aria-label="Choose an install">
      {installTargets.map((item,index)=><button key={item.id} type="button" aria-pressed={item.id===target.id} onClick={()=>choose(item)} onKeyDown={event=>step(event,index)}>{item.id==="mobile"?"iPhone":item.label}</button>)}
    </div>
    {mobile?<TestFlightRequest/>:<>
      <div className="install-hook-line" data-copied={copied}>
        <span className="install-hook-prompt" aria-hidden="true">$</span>
        <code ref={code} onClick={()=>void copy()}>{command}</code>
        <button ref={copyRef} type="button" className="install-hook-copy" onClick={()=>void copy()} aria-label={`Copy the ${target.label} install command`}>{copied?"Copied ✓":"Copy"}</button>
      </div>
      <p className="install-hook-status" role="status" aria-live="polite">{status||target.note}</p>
    </>}
    <ul className="install-hook-proof" aria-label="Why it is safe to run">
      <li><i aria-hidden="true">✓</i>Checksum-verified before anything installs</li>
      <li><i aria-hidden="true">✓</i>No sudo · lands in ~/.local/bin</li>
      {!mobile&&<li><button type="button" aria-pressed={preview} onClick={()=>{setPreview(value=>!value);setStatus("");setCopied(false);}}>{preview?"Back to the real install":"Preview with --dry-run"}</button></li>}
      <li><a href={installScriptSource} target="_blank" rel="noreferrer">Read the script ↗</a></li>
      <li>{release.url?<a href={release.url} target="_blank" rel="noreferrer">{release.tag}{released&&` · ${released}`}</a>:"Latest"} · <a href={SITE.github} target="_blank" rel="noreferrer">Apache-2.0</a></li>
    </ul>
    {!mobile&&canShare()&&<button type="button" className="install-hook-share" onClick={()=>void share()}>Send it to my computer ↗</button>}
  </section>;
}
