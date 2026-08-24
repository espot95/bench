/**
 * Compressione nativa del browser (CompressionStream): un salvataggio da ~2.7 MB di JSON
 * scende a ~300-400 KB. Usata per il cloud e per l'export su file.
 */

export function hasGzip(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

export async function gzipText(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export async function gunzipToText(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Magic bytes 1f 8b: distingue un .gz da un JSON in chiaro (import da file). */
export async function isGzip(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return head[0] === 0x1f && head[1] === 0x8b;
}

/** Legge un file importato, compresso o in chiaro. */
export async function readMaybeGzip(blob: Blob): Promise<string> {
  if (await isGzip(blob)) {
    if (!hasGzip()) throw new Error('Questo browser non sa decomprimere il file (.gz)');
    return gunzipToText(blob);
  }
  return blob.text();
}
