import { useEffect, useState } from 'react';

/** How the prompt reaches the service worker; features never import `src/pwa`. */
export interface UpdatePromptPort {
  readonly subscribe: (listener: (status: { readonly hasWaitingUpdate: boolean }) => void) => () => void;
  readonly activate: () => boolean;
}

/** Offers a waiting new version; the page reloads once the new version takes over. */
export function UpdatePrompt({ port }: { readonly port: UpdatePromptPort }) {
  const [hasWaitingUpdate, setHasWaitingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => port.subscribe(status => setHasWaitingUpdate(status.hasWaitingUpdate)), [port]);

  if (!hasWaitingUpdate) return null;
  return <div className="kairos-update-prompt" role="status">
    <p>A new version is ready.</p>
    <button type="button" disabled={updating} onClick={() => { if (port.activate()) setUpdating(true); }}>{updating ? 'Updating…' : 'Update'}</button>
  </div>;
}
