"use client";
import { useState } from "react";
import { canvasBlob, loadImage, uploadAsset } from "@/lib/api";
import { collectionPath, fitImageDimensions, uid, type Workspace } from "@/lib/model";

const symbolGroups: Record<string, string> = {
  "Marks and shapes": "! ? ★ ☆ ♥ ♡ ✚ ✖ ✓ ✦ ✧ ◆ ◇ ● ○ ■ □ ▲ △ ▼ ▽ ◎ ◉ ⊕ ⊗ ∞ ⚑ ⚐ 🎯 🚩",
  "Combat and protection": "⚔ 🗡 🛡 🏹 🪓 🔨 💣 🧨 🪖 🦾 🥊 ⛓ 🪤 🩸 💥 💢 🏴‍☠️ ☠ 💀",
  "Magic and elements": "⚡ 🔥 ❄ 🌊 💧 🌪 🌬 🌫 ☁ ☀ ☾ 🌙 ⭐ 🌟 ✨ ☄ 🌈 🔮 🪄 🌀 🕯 🧿 🪬 ⚗ 🧪",
  "Conditions and emotions": "😵 😵‍💫 😴 💤 🥶 🥵 🤢 🤮 🤒 🤕 😱 😨 😡 😍 🤩 😶 🤐 👁 👀 👂 🧠 💔 ❤️‍🔥 💚 💜 🖤",
  "Creatures and nature": "🐺 🐻 🦊 🐈 🐀 🦇 🦉 🦅 🐍 🕷 🦂 🐉 🐲 👻 👹 👺 👽 🧟 🧛 🧙 🧚 🌿 🍃 🌲 🌵 🍄 🌹 🥀",
  "Objects and movement": "🔒 🔓 🔑 🗝 ⚙ ⚖ ⏳ ⌛ ⏰ 🔔 📜 📖 🧭 💎 👑 🪙 🧲 🦴 🪶 👣 🏃 🪽 ⚓ ⛰ 🏕 🏰 ⛺ 🚪 ⬆ ⬇ ⬅ ➡ ↗ ↘ ↙ ↖ ↔ ↕",
};
const allSymbols = Object.values(symbolGroups).flatMap(group => group.split(" "));

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  workspace: Workspace;
  commit: (fn: (w: Workspace) => void) => void;
  assetId: string | null;
  onAssetChange: (id: string | null) => void;
};

export default function ConditionSymbol({ value, onChange, label = "Custom symbol", workspace: w, commit, assetId, onAssetChange }: Props) {
  const [folder, setFolder] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = w.assets.find(asset => asset.id === assetId);
  const activeFolder = w.assetFolders.some(item => item.id === folder) ? folder : null;
  const images = w.assets.filter(asset => (w.assetLocations[asset.id] ?? null) === activeFolder);
  const chooseSymbol = (symbol: string) => { onChange(symbol); onAssetChange(null); };
  const upload = async (file?: File) => {
    if (!file || busy) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPG, or WebP image."); return; }
    if (file.size > 20 * 1024 * 1024) { setError("Choose an image smaller than 20 MB."); return; }
    setBusy(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      const size = fitImageDimensions(image.width, image.height, 512);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable.");
      context.drawImage(image, 0, 0, size.width, size.height);
      const name = (file.name.replace(/\.[^.]+$/, "") || "Condition symbol").slice(0, 120);
      const { src } = await uploadAsset(await canvasBlob(canvas), `${name}.png`);
      const id = uid();
      commit(next => {
        next.assets.push({ id, name, src, width: size.width, height: size.height });
        next.assetLocations[id] = next.assetFolders.some(item => item.id === activeFolder) ? activeFolder : null;
      });
      onAssetChange(id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Image upload failed."); }
    finally { URL.revokeObjectURL(objectUrl); setBusy(false); }
  };
  const folderOptions = <><option value="">Assets root</option>{w.assetFolders.map(item => <option key={item.id} value={item.id}>{collectionPath(w.assetFolders, item.id)}</option>)}</>;

  return <div className="condition-symbol-picker">
    <label>Symbol or emoji<select value={allSymbols.includes(value) ? value : ""} onChange={event => chooseSymbol(event.target.value)}>
      <option value="">Choose a symbol or use custom text</option>
      {Object.entries(symbolGroups).map(([name, symbols]) => <optgroup key={name} label={name}>{symbols.split(" ").map(symbol => <option key={symbol} value={symbol}>{symbol}</option>)}</optgroup>)}
    </select></label>
    <label>{label}<input maxLength={16} value={value} onChange={event => chooseSymbol(event.target.value)} placeholder="Type or paste a symbol or emoji" /></label>
    <label>Image folder<select value={activeFolder ?? ""} disabled={busy} onChange={event => setFolder(event.target.value || null)}>{folderOptions}</select></label>
    <div className="condition-symbol-folder-create"><input aria-label="New symbol folder name" maxLength={120} value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="New folder name" /><button type="button" disabled={!folderName.trim() || busy || w.assetFolders.length >= 2000} onClick={() => {
      const id = uid();
      commit(next => { next.assetFolders.push({ id, name: folderName.trim(), kind: "folder", parentId: null }); });
      setFolder(id); setFolderName("");
    }}>Create folder</button></div>
    <label>Image symbol<select value={images.some(image => image.id === assetId) ? assetId ?? "" : ""} onChange={event => onAssetChange(event.target.value || null)}>
      <option value="">Choose an image in this folder</option>
      {images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}
    </select></label>
    {selected && <div className="condition-symbol-image-preview"><img src={selected.src} alt={selected.name} width={40} height={40} /><span>{selected.name}</span><button type="button" onClick={() => onAssetChange(null)}>Use text symbol</button><label>Move image to folder<select value={w.assetLocations[selected.id] ?? ""} onChange={event => { const target = event.target.value || null; commit(next => { next.assetLocations[selected.id] = target; }); setFolder(target); }}>{folderOptions}</select></label></div>}
    <label>{busy ? "Uploading image…" : "Upload image symbol"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }} /></label>
    <small>PNG, JPG, or WebP, up to 20 MB. Uploads are saved in the selected folder. Folders are shared with Assets.</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}
