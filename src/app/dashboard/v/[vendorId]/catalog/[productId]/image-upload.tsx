"use client";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { addProductImage } from "../../../../_actions/catalog";

export function ImageUpload({ vendorId, productId }: { vendorId: string; productId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    start(async () => {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) { setError(`${file.name} is over 5MB`); continue; }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${vendorId}/${productId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
        if (error) { setError(error.message); continue; }
        await addProductImage(vendorId, productId, path);
      }
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      <Button type="button" variant="secondary" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? "Uploading…" : "Add photos"}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
