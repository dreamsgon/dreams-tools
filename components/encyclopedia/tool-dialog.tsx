'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

/** Shared modal dialog for encyclopedia tools. Kept in its own file so pages that only need a dialog don't load the character directory. */
export function ToolDialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);return <dialog ref={ref} className={`modal ${wide?'wide-modal':''}`} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-inner"><div className="modal-heading"><h2>{title}</h2><button aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></dialog>;}
