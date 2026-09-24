import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useAction } from '@/lib/hooks';
import { Alert, Button, FileUpload, FormField, Input, PageHeader, QueryBoundary, Select, useToast } from '@/components/ui';

export function SchoolProfilePage() {
  const q = useQuery(() => api.get<any>('/api/schools/me'), []);
  const { refresh } = useAuth(); const toast = useToast();
  const [f, setF] = useState<any>(null); const [logo, setLogo] = useState<File | null>(null);
  const [scale, setScale] = useState<any>(null);
  useEffect(() => { if (q.data) { setF({ name: q.data.name, address: q.data.address ?? '', phone: q.data.phone ?? '', email: q.data.email ?? '', type: q.data.type ?? 'private' }); setScale(q.data.grading_scale); } }, [q.data]);
  const save = useAction(async () => { await api.patch('/api/schools/me', f); if (logo) { const fd = new FormData(); fd.append('logo', logo); await api.upload('/api/schools/me/logo', fd); setLogo(null); } await refresh(); q.reload(); toast('School profile saved'); });
  const saveScale = useAction(async () => { await api.put('/api/schools/me/grading-scale', { ...scale, ca1Max: Number(scale.ca1Max), ca2Max: Number(scale.ca2Max), examMax: Number(scale.examMax), bands: scale.bands.map((b: any) => ({ ...b, min: Number(b.min) })) }); toast('Grading scale updated'); });
  return (
    <>
      <PageHeader title="School profile" description={q.data && <>School code <span className="font-mono">{q.data.code}</span> · Registered {new Date(q.data.created_at).toLocaleDateString()}</>} />
      <QueryBoundary loading={q.loading || !f} error={q.error} onRetry={q.reload}>
        <div className="grid gap-6 lg:grid-cols-2">
          <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
            <h2 className="font-semibold">Details</h2>
            {save.error && <Alert tone="error">{save.error}</Alert>}
            <FormField label="School name" error={save.fields.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></FormField>
            <FormField label="Address" error={save.fields.address}><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></FormField>
            <div className="grid gap-4 sm:grid-cols-2"><FormField label="Phone" error={save.fields.phone}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></FormField><FormField label="Email" error={save.fields.email}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField></div>
            <FormField label="School type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="private">Private</option><option value="public">Public / Government</option><option value="mission">Mission</option><option value="international">International</option><option value="other">Other</option></Select></FormField>
            <FormField label="Logo" hint="PNG, JPEG or WebP up to 2 MB. Shown on report cards.">
              <div className="flex items-center gap-4">{q.data.logo_key && <img src={`/api/logo/${q.data.id}?v=${encodeURIComponent(q.data.logo_key)}`} alt="School logo" className="h-14 w-14 rounded-lg border object-contain" />}<div className="flex-1"><FileUpload file={logo} onFile={setLogo} accept="image/png,image/jpeg,image/webp" /></div></div>
            </FormField>
            <Button type="submit" loading={save.pending}>Save changes</Button>
          </form>
          <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void saveScale.run(); }}>
            <h2 className="font-semibold">Grading scale</h2>
            <p className="text-sm text-slate-500">Maximum scores must total 100. Bands are matched from the highest minimum downwards.</p>
            {saveScale.error && <Alert tone="error">{saveScale.error}</Alert>}
            {scale && <>
              <div className="grid grid-cols-3 gap-3">{(['ca1Max', 'ca2Max', 'examMax'] as const).map((k) => <FormField key={k} label={{ ca1Max: 'CA 1 max', ca2Max: 'CA 2 max', examMax: 'Exam max' }[k]}><Input type="number" min={0} max={100} value={scale[k]} onChange={(e) => setScale({ ...scale, [k]: e.target.value })} /></FormField>)}</div>
              <div className="space-y-2">{scale.bands.map((b: any, i: number) => <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2">
                <Input type="number" min={0} max={100} value={b.min} onChange={(e) => setScale({ ...scale, bands: scale.bands.map((x: any, j: number) => j === i ? { ...x, min: e.target.value } : x) })} placeholder="Min" />
                <Input value={b.grade} onChange={(e) => setScale({ ...scale, bands: scale.bands.map((x: any, j: number) => j === i ? { ...x, grade: e.target.value } : x) })} placeholder="Grade" />
                <Input value={b.remark} onChange={(e) => setScale({ ...scale, bands: scale.bands.map((x: any, j: number) => j === i ? { ...x, remark: e.target.value } : x) })} placeholder="Remark" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setScale({ ...scale, bands: scale.bands.filter((_: any, j: number) => j !== i) })}>✕</Button></div>)}
                <Button type="button" variant="outline" size="sm" onClick={() => setScale({ ...scale, bands: [...scale.bands, { min: 0, grade: '', remark: '' }] })}>Add band</Button></div>
              <Button type="submit" loading={saveScale.pending}>Save grading scale</Button></>}
          </form>
        </div>
      </QueryBoundary>
    </>
  );
}
