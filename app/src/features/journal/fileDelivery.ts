/** How a file leaves the app: the device's share sheet, else a download (D214). Tests pass their own. */
export interface FileDeliveryPorts {
  canShare(data: { files: File[] }): boolean;
  share(data: { files: File[]; title: string }): Promise<void>;
  download(blob: Blob, fileName: string): void;
}

export type FileDeliveryResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/**
 * The one place a file is handed over (D214, D266): to the share sheet when the device offers one for this file, else
 * downloaded. Closing the share sheet is the trader's choice ('cancelled'), not a failure. A share sheet the browser
 * won't open (a tap too long ago while a big file was made) downloads the file instead.
 */
export async function deliverFile(content: Blob, fileName: string, type: string, ports: FileDeliveryPorts = browserFileDeliveryPorts()): Promise<FileDeliveryResult> {
  try {
    const file = new File([content], fileName, { type });
    if (ports.canShare({ files: [file] })) {
      try {
        await ports.share({ files: [file], title: fileName });
        return 'shared';
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'NotAllowedError')) throw error;
      }
    }
    ports.download(content, fileName);
    return 'downloaded';
  } catch (error) {
    return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export function browserFileDeliveryPorts(): FileDeliveryPorts {
  return {
    canShare: data => typeof navigator.canShare === 'function' && navigator.canShare(data),
    share: data => navigator.share(data),
    download: (blob, fileName) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  };
}
