"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { inputCls, primaryBtn } from "@/components/ui/Field";

interface Props {
  consentText: string;
  consentVersion: string;
  defaults: { holderName: string; licenceNumber: string; licenceType: string };
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 2000;

/** Phone photos are often 4-8 MB: redraw them at most 2000 px on the long edge as JPEG, so the upload stays small. */
async function shrinkPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= 900 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.85, 0.75, 0.65]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  return file;
}

const fieldCls = `${inputCls} pointer-coarse:text-base`;

export function VerificationForm({ consentText, consentVersion, defaults }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      for (const field of ["licenceFile", "medicalFile"]) {
        const f = form.get(field);
        if (f instanceof File && f.size > 0) {
          const small = await shrinkPhoto(f);
          if (small.size > MAX_BYTES) return setError("A file is larger than 2 MB. Take a photo instead, or export a smaller PDF.");
          form.set(field, small, f.name.replace(/\.(heic|png|webp)$/i, ".jpg"));
        }
      }
      const res = await fetch("/api/pilot/verification", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? (data.issues?.[0] ? `${data.issues[0].path}: ${data.issues[0].message}` : "Something went wrong. Please try again."));
        return;
      }
      router.refresh();
    } catch {
      setError("The upload didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-2xl text-ivory">Your licence details</legend>
        <label className="block sm:col-span-2">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Name exactly as on your licence</span>
          <input name="holderName" required defaultValue={defaults.holderName} autoComplete="name" className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Licence number</span>
          <input name="licenceNumber" required defaultValue={defaults.licenceNumber} autoComplete="off" className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Licence type (e.g. CPL(A))</span>
          <input name="licenceType" defaultValue={defaults.licenceType} autoComplete="off" className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Licence expiry</span>
          <input name="licenceExpiresAt" type="date" className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Type ratings (comma separated)</span>
          <input name="ratings" placeholder="e.g. H125, B206" autoComplete="off" className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Medical class</span>
          <select name="medicalClass" defaultValue="" className={fieldCls}>
            <option value="">Choose…</option>
            {[1, 2, 3, 4].map((c) => <option key={c} value={c}>Class {c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Medical expiry</span>
          <input name="medicalExpiresAt" type="date" className={fieldCls} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-2xl text-ivory">Photos</legend>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Licence (photo or PDF)</span>
          <input name="licenceFile" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className={`${fieldCls} file:mr-3 file:rounded-full file:border-0 file:bg-gold file:px-3 file:py-1 file:text-obsidian`} />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Medical certificate (photo or PDF)</span>
          <input name="medicalFile" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className={`${fieldCls} file:mr-3 file:rounded-full file:border-0 file:bg-gold file:px-3 file:py-1 file:text-obsidian`} />
        </label>
      </fieldset>

      <label className="flex items-start gap-3 rounded-2xl border border-white/10 p-4 text-sm text-slate-tac">
        <input type="checkbox" name="consent" required className="mt-1 h-5 w-5 shrink-0 accent-[#d4af37]" />
        <span>
          {consentText} <span className="text-xs">(Consent version {consentVersion})</span>
        </span>
      </label>

      {error && <Alert tone="err">{error}</Alert>}
      <button type="submit" disabled={busy} className={`${primaryBtn} w-full sm:w-auto`}>
        {busy ? "Uploading…" : "Send for review"}
      </button>
    </form>
  );
}
