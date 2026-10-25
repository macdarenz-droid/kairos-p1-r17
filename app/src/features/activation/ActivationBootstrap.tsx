import { type PropsWithChildren, useEffect, useState } from 'react';
import { buildInfo } from '../../shared/config/buildInfo';
import type { DatabaseLifecycleStatus } from '../../data/database';
import { kairosRepositories } from '../../data/repositories';
import {
  ActivationCoordinator,
  ActivationReceiptRepository,
  EcdsaActivationReceiptVerifier,
  RemoteActivationAdapter,
  describeThisDevice,
  parseActivationDeploymentConfig,
} from '../../services/activation';
import { ActivationGate, ActivationLogo, type ActivationJournalPort } from './ActivationGate';

export interface ActivationBootstrapProps extends PropsWithChildren {
  readonly databaseStartup: Promise<DatabaseLifecycleStatus>;
  /** This device's journal, so the invite screen can offer a copy (D281); built in main.tsx. */
  readonly journal: ActivationJournalPort;
}

type RuntimeState =
  | { readonly state: 'preparing' }
  | { readonly state: 'ready'; readonly controller: ActivationCoordinator }
  | { readonly state: 'unavailable'; readonly message: string };

function readRuntimeConfig() {
  return parseActivationDeploymentConfig({
    endpoint: import.meta.env.VITE_KAIROS_ACTIVATION_ENDPOINT,
    publicKeySpkiBase64: import.meta.env.VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI,
  });
}

function buildController(config: { readonly endpoint: string; readonly publicKeySpkiBase64: string }): ActivationCoordinator {
  return new ActivationCoordinator({
    adapter: new RemoteActivationAdapter({ endpoint: config.endpoint }),
    repository: new ActivationReceiptRepository(kairosRepositories.metadata),
    verifier: new EcdsaActivationReceiptVerifier({
      publicKeySpkiBase64: config.publicKeySpkiBase64,
    }),
    // D275: a coarse name from the Worker's fixed list, so the trader can tell their devices apart.
    deviceLabel: describeThisDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 }),
  });
}

export function ActivationBootstrap({ databaseStartup, journal, children }: ActivationBootstrapProps) {
  const [runtime, setRuntime] = useState<RuntimeState>({ state: 'preparing' });

  useEffect(() => {
    let active = true;
    void databaseStartup.then((databaseStatus) => {
      if (!active) return;
      if (databaseStatus.state !== 'ready') {
        setRuntime({
          state: 'unavailable',
          message: "Kairos couldn't open its storage on this device. Your journal wasn't opened.",
        });
        return;
      }

      const configResult = readRuntimeConfig();
      if (!configResult.ok) {
        setRuntime({
          state: 'unavailable',
          message: "This version of Kairos isn't set up to check invite codes yet.",
        });
        return;
      }

      try {
        setRuntime({ state: 'ready', controller: buildController(configResult.config) });
      } catch {
        setRuntime({
          state: 'unavailable',
          message: "This version of Kairos can't check invite codes.",
        });
      }
    }).catch(() => {
      if (active) {
        setRuntime({
          state: 'unavailable',
          message: "Kairos couldn't open its storage on this device. Your journal wasn't opened.",
        });
      }
    });

    return () => {
      active = false;
    };
  }, [databaseStartup]);

  if (runtime.state === 'preparing') {
    return (
      <main className="kairos-activation">
        <section className="kairos-activation__card">
          <ActivationLogo />
          <p className="kairos-activation__status" role="status" aria-live="polite">
            Preparing Kairos…
          </p>
        </section>
      </main>
    );
  }

  if (runtime.state === 'unavailable') {
    return (
      <main className="kairos-activation">
        <section className="kairos-activation__card" aria-labelledby="kairos-activation-unavailable-title">
          <ActivationLogo />
          <h1 id="kairos-activation-unavailable-title">Kairos can’t open yet</h1>
          <p className="kairos-activation__feedback" role="alert">{runtime.message}</p>
        </section>
      </main>
    );
  }

  return (
    <ActivationGate
      controller={runtime.controller}
      appVersion={buildInfo.appVersion}
      buildId={buildInfo.buildId}
      journal={journal}
    >
      {children}
    </ActivationGate>
  );
}
