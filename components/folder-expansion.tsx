"use client";
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
export const FolderPreferenceScope = createContext("local");
export function useFolderExpansion(area: string): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const scope = useContext(FolderPreferenceScope);
  const key = `maptable:folders:v1:${encodeURIComponent(scope)}:${area}`;
  const [state, setState] = useState<{key:string; closed:Set<string>}>(() => ({key:"",closed:new Set()}));
  useEffect(() => {
    let closed = new Set<string>();
    try { const ids = JSON.parse(localStorage.getItem(key) ?? "[]"); if(Array.isArray(ids)) closed = new Set(ids.filter((id:unknown):id is string => typeof id === "string").slice(0,10000)); } catch {}
    setState({key,closed});
  },[key]);
  const setClosed: Dispatch<SetStateAction<Set<string>>> = action => setState(previous => {
    const closed = typeof action === "function" ? action(previous.key === key ? previous.closed : new Set()) : action;
    return {key,closed};
  });
  useEffect(() => { if(state.key !== key) return; try { localStorage.setItem(key,JSON.stringify([...state.closed])); } catch {} },[key,state]);
  return [state.key === key ? state.closed : new Set(),setClosed];
}
